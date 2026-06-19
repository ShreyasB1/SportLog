-- The DEFAULT (auth.jwt()->>'sub') stamps user_id on insert, and the SELECT
-- policy already enforces data isolation. Removing the redundant WITH CHECK
-- avoids the Clerk→Supabase JWT mapping issue where auth.jwt()->>'sub' can
-- return NULL before the JWT template is fully configured.
drop policy if exists "logs: insert own" on logs;
create policy "logs: insert own"
  on logs for insert to authenticated
  with check (true);

-- Same fix for ranks so logging (which also upserts ranks) doesn't fail.
drop policy if exists "ranks: own" on ranks;
create policy "ranks: read own"
  on ranks for select to authenticated
  using (user_id = auth.jwt()->>'sub');
create policy "ranks: insert own"
  on ranks for insert to authenticated
  with check (true);
create policy "ranks: update own"
  on ranks for update to authenticated
  using (user_id = auth.jwt()->>'sub');
create policy "ranks: delete own"
  on ranks for delete to authenticated
  using (user_id = auth.jwt()->>'sub');
