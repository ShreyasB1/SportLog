-- RLS hardening.
--
-- Fixes three gaps found auditing the policies against the published privacy
-- policy (docs/privacy-policy.html):
--
--   1. logs / ranks INSERT accepted an arbitrary user_id, letting any client
--      forge rows into another user's account.
--   2. The logs SELECT policy matched friendships in either direction, so
--      being *followed* exposed your logbook to the follower.
--   3. Account deletion left avatar objects behind in the public bucket.
--
-- On (1): 0004 relaxed WITH CHECK to `true` because auth.jwt()->>'sub' could
-- be NULL while the Clerk JWT template was half-configured. Since 0006 the app
-- runs on Supabase Auth, where 'sub' is always the auth.users UUID, so the
-- original check is safe to restore. Both call sites (log-game.tsx) already
-- send user_id explicitly and match auth.uid(), so this is not a client-visible
-- change.

-- ---------------------------------------------------------------------------
-- 1. Writes must belong to the caller
-- ---------------------------------------------------------------------------

-- A column DEFAULT only applies when the client omits the column, so it never
-- constrained an explicit user_id. WITH CHECK does.
drop policy if exists "logs: insert own" on logs;
create policy "logs: insert own"
  on logs for insert to authenticated
  with check (user_id = auth.jwt()->>'sub');

drop policy if exists "ranks: insert own" on ranks;
create policy "ranks: insert own"
  on ranks for insert to authenticated
  with check (user_id = auth.jwt()->>'sub');

-- The UPDATE policies had USING but no WITH CHECK. Postgres falls back to
-- USING for the row-after check, so these were already safe -- made explicit
-- here so a future edit to USING cannot silently open up row reassignment.
drop policy if exists "logs: update own" on logs;
create policy "logs: update own"
  on logs for update to authenticated
  using      (user_id = auth.jwt()->>'sub')
  with check (user_id = auth.jwt()->>'sub');

drop policy if exists "ranks: update own" on ranks;
create policy "ranks: update own"
  on ranks for update to authenticated
  using      (user_id = auth.jwt()->>'sub')
  with check (user_id = auth.jwt()->>'sub');

-- ---------------------------------------------------------------------------
-- 2. Logbook reads follow one direction only
-- ---------------------------------------------------------------------------

-- Before: (I follow them) OR (they follow me) -- the second branch leaked the
-- follower's own logbook to the person they followed.
-- After:  I read your logbook only if I follow you.
--
-- Follows are still one-way and self-approved (see 0007). This migration does
-- not add an approval step -- that is a product decision, and adding it here
-- would break the follow flow in profile.tsx / user/[id].tsx, which insert
-- rows with status 'accepted' directly. Until that changes, the honest
-- description is "visible to your followers", not "to followers you accepted".
drop policy if exists "logs: read own or friends" on logs;
create policy "logs: read own or following"
  on logs for select to authenticated using (
    user_id = auth.jwt()->>'sub'
    or exists (
      select 1 from friendships f
      where f.status = 'accepted'
        and f.requester_id = auth.jwt()->>'sub'
        and f.addressee_id = logs.user_id
    )
  );

-- ---------------------------------------------------------------------------
-- 3. Only the follower may modify a follow row
-- ---------------------------------------------------------------------------

-- Previously either party could UPDATE, with no WITH CHECK, so an addressee
-- could rewrite requester_id and manufacture a follow edge. Nothing in the app
-- updates friendships (insert / select / delete only), so restricting this to
-- the requester costs no functionality.
drop policy if exists "friendships: update own" on friendships;
create policy "friendships: update own"
  on friendships for update to authenticated
  using      (requester_id = auth.jwt()->>'sub')
  with check (requester_id = auth.jwt()->>'sub');

-- ---------------------------------------------------------------------------
-- 4. Account deletion removes avatars
-- ---------------------------------------------------------------------------

-- Avatar paths are "<user_id>/avatar-<ts>.jpg" in a public bucket, so a row
-- left behind stays fetchable by URL forever. Dropping the storage.objects row
-- makes the object unreachable through the storage API; the delete-account
-- Edge Function should also call storage.remove() so the underlying file is
-- reclaimed rather than orphaned.
create or replace function public.handle_user_deleted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.logs        where user_id = old.id::text;
  delete from public.ranks       where user_id = old.id::text;
  delete from public.watchlist   where user_id = old.id::text;
  delete from public.picks       where user_id = old.id::text;
  delete from public.friendships where requester_id = old.id::text or addressee_id = old.id::text;
  delete from public.profiles    where id = old.id::text;

  -- Isolated: this runs in a BEFORE DELETE trigger, so an error here would
  -- abort the whole account deletion. A stranded avatar is a far better
  -- outcome than a delete-account button that fails, so degrade to a warning
  -- if the function's owner lacks rights on storage.objects.
  begin
    delete from storage.objects
      where bucket_id = 'avatars'
        and (storage.foldername(name))[1] = old.id::text;
  exception
    when insufficient_privilege or undefined_table or undefined_function then
      raise warning 'handle_user_deleted: could not purge avatars for %', old.id;
  end;

  return old;
end;
$$;
