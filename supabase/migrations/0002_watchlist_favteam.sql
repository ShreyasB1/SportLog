-- Add favorite_team and bio to profiles
alter table profiles add column if not exists favorite_team text;
alter table profiles add column if not exists bio text;

-- Watchlist (games a user wants to watch)
create table watchlist (
  id         uuid primary key default gen_random_uuid(),
  user_id    text not null default (auth.jwt()->>'sub'),
  game_id    text not null references games(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, game_id)
);

alter table watchlist enable row level security;

create policy "watchlist: own"
  on watchlist for all to authenticated
  using  (user_id = auth.jwt()->>'sub')
  with check (user_id = auth.jwt()->>'sub');

-- Public aggregate: log counts per league across all users.
-- Runs as definer so it bypasses RLS — returns counts only, not individual rows.
create or replace function public.league_log_counts()
returns table(league text, log_count bigint)
language sql
security definer
stable
as $$
  select g.league, count(l.id) as log_count
  from logs l
  join games g on g.id = l.game_id
  group by g.league
  order by log_count desc
  limit 10;
$$;

grant execute on function public.league_log_counts() to authenticated;
