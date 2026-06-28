create table if not exists picks (
  id           uuid primary key default gen_random_uuid(),
  user_id      text not null,
  game_id      text not null references games(id) on delete cascade,
  picked_team  text not null,
  result       text check (result in ('correct', 'incorrect', 'push')),
  created_at   timestamptz default now(),
  unique (user_id, game_id)
);

alter table picks enable row level security;

create policy "users manage own picks"
  on picks for all
  using  (user_id = auth.jwt()->>'sub')
  with check (user_id = auth.jwt()->>'sub');
