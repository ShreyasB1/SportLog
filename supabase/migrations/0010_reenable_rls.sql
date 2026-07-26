-- Re-enable row level security.
--
-- Found by probing the live REST API with the anon key and no user session:
-- profiles, logs, ranks and games all returned rows to an unauthenticated
-- caller. Every policy on those tables is "to authenticated", so anon should
-- match nothing -- which means RLS was not in force on them.
--
-- Probable cause: RLS was switched off while debugging the Clerk JWT problem
-- described in 0004 ("auth.jwt()->>'sub' can return NULL") and never switched
-- back on. Policies do not run when RLS is off, so every policy written in
-- 0001 through 0009 was inert on those tables.
--
-- Verify after applying, from scripts/probe-rls.mjs or by hand:
--   select tablename, rowsecurity from pg_tables
--   where schemaname = 'public' order by tablename;
-- Every row must show rowsecurity = true.

-- ---------------------------------------------------------------------------
-- 1. Let the client keep writing games BEFORE locking the table
-- ---------------------------------------------------------------------------

-- Ordering matters. games has a SELECT policy and an INSERT policy that only
-- admits 'manual-%' ids, and no UPDATE policy at all. Five client call sites
-- (log-game, index, picks, logbook) upsert ESPN rows by their real id, so
-- enabling RLS without this would reject every one of them and break logging
-- a game outright.
--
-- Games are public reference data mirrored from ESPN, not user content, so
-- authenticated users may write them. The tradeoff is that any signed-in user
-- can alter a score or team name for everyone; moving these writes behind an
-- Edge Function with the service role would remove that, at the cost of a
-- round trip on every feed render.
drop policy if exists "games: insert manual" on games;
drop policy if exists "games: insert"        on games;
drop policy if exists "games: update"        on games;

create policy "games: insert"
  on games for insert to authenticated
  with check (true);

create policy "games: update"
  on games for update to authenticated
  using (true)
  with check (true);

-- ---------------------------------------------------------------------------
-- 2. Enable RLS everywhere
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

-- Catch-all for anything not named above -- a table added by hand in the
-- dashboard, or one introduced after this migration was written. A table with
-- RLS off and no policies is readable by anon, so defaulting to on is the
-- safe direction: a missing policy shows too little, never too much.
do $$
declare t record;
begin
  for t in
    select tablename
    from pg_tables
    where schemaname = 'public'
      and rowsecurity = false
  loop
    execute format('alter table public.%I enable row level security', t.tablename);
    raise notice 'enabled RLS on public.%', t.tablename;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Report anything now locked but unreachable
-- ---------------------------------------------------------------------------

-- RLS with no policy denies everything. That is safe, but silently breaks
-- features, so surface it at migration time rather than as an empty list in
-- the app.
do $$
declare t record;
begin
  for t in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and c.relrowsecurity
      and not exists (
        select 1 from pg_policies p
        where p.schemaname = 'public' and p.tablename = c.relname
      )
  loop
    raise warning 'public.% has RLS enabled but no policies -- it is now unreadable', t.relname;
  end loop;
end $$;
