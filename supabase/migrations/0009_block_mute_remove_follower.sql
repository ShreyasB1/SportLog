-- Blocking, muting, and follower removal.
--
-- Semantics:
--   remove follower - drop the edge where you are the addressee. They lose
--                     logbook access but may follow you again.
--   block           - mutual severance. Existing edges in both directions are
--                     removed, neither party may follow the other, and each
--                     disappears from the other's profile/pick queries.
--   mute            - one-way and private. You stop seeing them in your
--                     leaderboard and suggestions. They are not told, keep
--                     following you, and retain logbook access. Enforced
--                     client-side only; there is nothing to hide server-side.

create table if not exists blocks (
  blocker_id text not null default (auth.jwt()->>'sub'),
  blocked_id text not null,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint blocks_not_self check (blocker_id <> blocked_id)
);

create table if not exists mutes (
  muter_id   text not null default (auth.jwt()->>'sub'),
  muted_id   text not null,
  created_at timestamptz not null default now(),
  primary key (muter_id, muted_id),
  constraint mutes_not_self check (muter_id <> muted_id)
);

alter table blocks enable row level security;
alter table mutes  enable row level security;

-- Both sides are private to their owner: the blocked party is never told, and
-- a mute is invisible by design.
drop policy if exists "blocks: read own"   on blocks;
drop policy if exists "blocks: insert own" on blocks;
drop policy if exists "blocks: delete own" on blocks;
create policy "blocks: read own"
  on blocks for select to authenticated using (blocker_id = auth.jwt()->>'sub');
create policy "blocks: insert own"
  on blocks for insert to authenticated with check (blocker_id = auth.jwt()->>'sub');
create policy "blocks: delete own"
  on blocks for delete to authenticated using (blocker_id = auth.jwt()->>'sub');

drop policy if exists "mutes: read own"   on mutes;
drop policy if exists "mutes: insert own" on mutes;
drop policy if exists "mutes: delete own" on mutes;
create policy "mutes: read own"
  on mutes for select to authenticated using (muter_id = auth.jwt()->>'sub');
create policy "mutes: insert own"
  on mutes for insert to authenticated with check (muter_id = auth.jwt()->>'sub');
create policy "mutes: delete own"
  on mutes for delete to authenticated using (muter_id = auth.jwt()->>'sub');

-- ---------------------------------------------------------------------------
-- Block lookup
-- ---------------------------------------------------------------------------

-- SECURITY DEFINER on purpose. A subquery inside an RLS policy is still
-- subject to the referenced table's own RLS, and "blocks: read own" hides the
-- rows we need to test (the blocked party cannot see the row blocking them).
-- Routing the check through a definer function bypasses that, and returning
-- only a boolean leaks nothing about who blocked whom.
create or replace function public.is_blocked(a text, b text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from blocks
    where (blocker_id = a and blocked_id = b)
       or (blocker_id = b and blocked_id = a)
  );
$$;

revoke all on function public.is_blocked(text, text) from public;
grant execute on function public.is_blocked(text, text) to authenticated;

-- "profiles: read visible" below hides blocked accounts in both directions,
-- which would otherwise leave the block list unreadable: you could block
-- someone and then not see who you had blocked. This returns the caller's own
-- block list only, so the management screen has names to show.
create or replace function public.blocked_profiles()
returns table (id text, username text, display_name text, avatar_url text)
language sql
security definer
stable
set search_path = public
as $$
  select p.id, p.username, p.display_name, p.avatar_url
  from blocks b
  join profiles p on p.id = b.blocked_id
  where b.blocker_id = auth.jwt()->>'sub'
  order by b.created_at desc;
$$;

revoke all on function public.blocked_profiles() from public;
grant execute on function public.blocked_profiles() to authenticated;

-- ---------------------------------------------------------------------------
-- Follower removal
-- ---------------------------------------------------------------------------

-- 0007 allowed only the requester to delete, so you could unfollow someone but
-- never remove a follower -- a follower kept logbook access until they chose
-- to leave. Either party may now drop the edge.
drop policy if exists "friendships: delete own" on friendships;
drop policy if exists "friendships: delete own or remove follower" on friendships;
create policy "friendships: delete own or remove follower"
  on friendships for delete to authenticated
  using (
    requester_id = auth.jwt()->>'sub'
    or addressee_id = auth.jwt()->>'sub'
  );

-- ---------------------------------------------------------------------------
-- Blocks are enforced server-side, not just hidden in the UI
-- ---------------------------------------------------------------------------

-- A block must survive a hand-rolled API call, so re-following is refused at
-- the policy level rather than by omitting a button.
drop policy if exists "friendships: create" on friendships;
create policy "friendships: create"
  on friendships for insert to authenticated
  with check (
    requester_id = auth.jwt()->>'sub'
    and not public.is_blocked(requester_id, addressee_id)
  );

-- Blocked parties disappear from each other entirely. This also removes the
-- need to filter search results client-side.
drop policy if exists "profiles: read all" on profiles;
drop policy if exists "profiles: read visible" on profiles;
create policy "profiles: read visible"
  on profiles for select to authenticated
  using (
    id = auth.jwt()->>'sub'
    or not public.is_blocked(auth.jwt()->>'sub', id)
  );

-- Same for picks, which 0007 opened to every signed-in user. Community
-- consensus counts on the Picks deck now exclude anyone you have blocked.
drop policy if exists "picks: read all" on picks;
drop policy if exists "picks: read visible" on picks;
create policy "picks: read visible"
  on picks for select to authenticated
  using (
    user_id = auth.jwt()->>'sub'
    or not public.is_blocked(auth.jwt()->>'sub', user_id)
  );

-- Logbook access already required a follow edge, and blocking deletes those
-- edges. The explicit check keeps a stale or re-inserted edge from granting
-- access anyway.
drop policy if exists "logs: read own or following" on logs;
create policy "logs: read own or following"
  on logs for select to authenticated using (
    user_id = auth.jwt()->>'sub'
    or (
      not public.is_blocked(auth.jwt()->>'sub', logs.user_id)
      and exists (
        select 1 from friendships f
        where f.status = 'accepted'
          and f.requester_id = auth.jwt()->>'sub'
          and f.addressee_id = logs.user_id
      )
    )
  );

-- ---------------------------------------------------------------------------
-- Deletion cascade
-- ---------------------------------------------------------------------------

-- 0008's version predates these tables; without this a deleted account leaves
-- rows that still suppress content for other users.
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
  delete from public.blocks      where blocker_id  = old.id::text or blocked_id   = old.id::text;
  delete from public.mutes       where muter_id    = old.id::text or muted_id     = old.id::text;
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
