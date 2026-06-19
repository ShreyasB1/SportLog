-- Allow clients to upsert games sourced from ESPN (id prefix 'espn-')
-- alongside existing manual entries ('manual-'). The service role (edge fns)
-- bypasses RLS entirely so it is unaffected.
drop policy if exists "games: insert manual" on games;

create policy "games: insert api or manual"
  on games for insert to authenticated
  with check (id like 'manual-%' or id like 'espn-%');

-- Upsert requires an UPDATE policy in addition to INSERT.
create policy "games: update any"
  on games for update to authenticated
  using (true);
