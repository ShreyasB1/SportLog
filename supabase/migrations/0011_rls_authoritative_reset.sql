-- Authoritative RLS reset.
--
-- After 0010, an anonymous request (anon key, no user session) still returned
-- rows from profiles, logs, ranks and games. Two causes were possible and
-- could not be told apart from outside the database:
--
--   1. 0010 errored partway. The SQL editor stops at the first failure.
--   2. RLS is on, but some policy has no TO clause. A policy without one
--      targets role "public", which includes anon -- so a permissive policy
--      recreated by hand in the dashboard would admit unauthenticated reads
--      no matter how correct every other policy is.
--
-- Rather than guess, this migration drops every policy on the nine app tables
-- and rebuilds the complete set from scratch. It is the single source of truth
-- for RLS; 0001 through 0010 are superseded for policy purposes.
--
-- It ends by raising an exception if RLS is still off anywhere, or if any
-- policy still targets role "public". A silent success is exactly the failure
-- mode that produced this bug, so this migration is designed to fail loudly.

-- ---------------------------------------------------------------------------
-- 0. Helper functions (recreated in case 0009 applied only partially)
-- ---------------------------------------------------------------------------

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
-- 1. Clear every existing policy
-- ---------------------------------------------------------------------------

-- Named drops cannot remove a policy whose name we do not know, and the
-- suspected culprit is exactly that: something added by hand. Enumerate.
do $$
declare r record;
begin
  for r in
    select tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'profiles','games','logs','ranks','friendships',
        'watchlist','picks','blocks','mutes'
      )
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
    raise notice 'dropped policy %.%', r.tablename, r.policyname;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Enable RLS
-- ---------------------------------------------------------------------------

alter table public.profiles    enable row level security;
alter table public.games       enable row level security;
alter table public.logs        enable row level security;
alter table public.ranks       enable row level security;
alter table public.friendships enable row level security;
alter table public.watchlist   enable row level security;
alter table public.picks       enable row level security;
alter table public.blocks      enable row level security;
alter table public.mutes       enable row level security;

-- ---------------------------------------------------------------------------
-- 3. Rebuild the policy set
-- ---------------------------------------------------------------------------
-- Every policy below names "to authenticated" explicitly. Omitting it is what
-- makes a policy apply to anon, so treat its absence as a bug in review.

-- profiles -------------------------------------------------------------------
create policy "profiles: read visible"
  on profiles for select to authenticated
  using (
    id = auth.jwt()->>'sub'
    or not public.is_blocked(auth.jwt()->>'sub', id)
  );

create policy "profiles: insert own"
  on profiles for insert to authenticated
  with check (id = auth.jwt()->>'sub');

create policy "profiles: update own"
  on profiles for update to authenticated
  using      (id = auth.jwt()->>'sub')
  with check (id = auth.jwt()->>'sub');

-- games ----------------------------------------------------------------------
-- Public reference data mirrored from ESPN, written by five client call sites
-- that upsert by real ESPN id. Not user content, so any signed-in user may
-- write; the tradeoff is that a score can be altered for everyone, which
-- moving these writes behind an Edge Function would fix.
create policy "games: read all"
  on games for select to authenticated using (true);

create policy "games: insert"
  on games for insert to authenticated with check (true);

create policy "games: update"
  on games for update to authenticated using (true) with check (true);

-- logs -----------------------------------------------------------------------
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

create policy "logs: insert own"
  on logs for insert to authenticated
  with check (user_id = auth.jwt()->>'sub');

create policy "logs: update own"
  on logs for update to authenticated
  using      (user_id = auth.jwt()->>'sub')
  with check (user_id = auth.jwt()->>'sub');

create policy "logs: delete own"
  on logs for delete to authenticated
  using (user_id = auth.jwt()->>'sub');

-- ranks ----------------------------------------------------------------------
create policy "ranks: read own"
  on ranks for select to authenticated
  using (user_id = auth.jwt()->>'sub');

create policy "ranks: insert own"
  on ranks for insert to authenticated
  with check (user_id = auth.jwt()->>'sub');

create policy "ranks: update own"
  on ranks for update to authenticated
  using      (user_id = auth.jwt()->>'sub')
  with check (user_id = auth.jwt()->>'sub');

create policy "ranks: delete own"
  on ranks for delete to authenticated
  using (user_id = auth.jwt()->>'sub');

-- friendships ----------------------------------------------------------------
create policy "friendships: read own"
  on friendships for select to authenticated
  using (
    requester_id = auth.jwt()->>'sub'
    or addressee_id = auth.jwt()->>'sub'
  );

create policy "friendships: create"
  on friendships for insert to authenticated
  with check (
    requester_id = auth.jwt()->>'sub'
    and not public.is_blocked(requester_id, addressee_id)
  );

create policy "friendships: update own"
  on friendships for update to authenticated
  using      (requester_id = auth.jwt()->>'sub')
  with check (requester_id = auth.jwt()->>'sub');

-- Either party may drop the edge: the follower unfollows, or the followed
-- account removes a follower.
create policy "friendships: delete own or remove follower"
  on friendships for delete to authenticated
  using (
    requester_id = auth.jwt()->>'sub'
    or addressee_id = auth.jwt()->>'sub'
  );

-- watchlist ------------------------------------------------------------------
create policy "watchlist: read own"
  on watchlist for select to authenticated
  using (user_id = auth.jwt()->>'sub');

create policy "watchlist: insert own"
  on watchlist for insert to authenticated
  with check (user_id = auth.jwt()->>'sub');

create policy "watchlist: delete own"
  on watchlist for delete to authenticated
  using (user_id = auth.jwt()->>'sub');

-- picks ----------------------------------------------------------------------
create policy "picks: read visible"
  on picks for select to authenticated
  using (
    user_id = auth.jwt()->>'sub'
    or not public.is_blocked(auth.jwt()->>'sub', user_id)
  );

create policy "picks: insert own"
  on picks for insert to authenticated
  with check (user_id = auth.jwt()->>'sub');

create policy "picks: update own"
  on picks for update to authenticated
  using      (user_id = auth.jwt()->>'sub')
  with check (user_id = auth.jwt()->>'sub');

create policy "picks: delete own"
  on picks for delete to authenticated
  using (user_id = auth.jwt()->>'sub');

-- blocks and mutes -----------------------------------------------------------
-- Private to their owner: a blocked account is never told, and a mute is
-- invisible by design.
create policy "blocks: read own"
  on blocks for select to authenticated using (blocker_id = auth.jwt()->>'sub');
create policy "blocks: insert own"
  on blocks for insert to authenticated with check (blocker_id = auth.jwt()->>'sub');
create policy "blocks: delete own"
  on blocks for delete to authenticated using (blocker_id = auth.jwt()->>'sub');

create policy "mutes: read own"
  on mutes for select to authenticated using (muter_id = auth.jwt()->>'sub');
create policy "mutes: insert own"
  on mutes for insert to authenticated with check (muter_id = auth.jwt()->>'sub');
create policy "mutes: delete own"
  on mutes for delete to authenticated using (muter_id = auth.jwt()->>'sub');

-- ---------------------------------------------------------------------------
-- 4. Refuse to succeed quietly
-- ---------------------------------------------------------------------------

do $$
declare bad text;
begin
  select string_agg(tablename, ', ' order by tablename) into bad
  from pg_tables
  where schemaname = 'public' and rowsecurity = false;

  if bad is not null then
    raise exception 'RLS still disabled on: %', bad;
  end if;

  -- A policy with no TO clause reports role "public", which includes anon.
  -- This is the condition that let unauthenticated reads through.
  select string_agg(tablename || '.' || policyname, ', ' order by tablename) into bad
  from pg_policies
  where schemaname = 'public' and 'public' = any(roles);

  if bad is not null then
    raise exception 'policies targeting role public (anon can match these): %', bad;
  end if;

  raise notice 'RLS verified: all public tables protected, no policy targets anon.';
end $$;
