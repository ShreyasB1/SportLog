-- SportLog schema — RLS keyed on the Clerk user id: auth.jwt()->>'sub' (TEXT).
-- Do NOT use auth.uid() — Clerk ids are not UUIDs.

-- Profiles (one row per Clerk user) ----------------------------------------
create table profiles (
  id           text primary key default (auth.jwt()->>'sub'),
  username     text unique not null,
  display_name text,
  avatar_url   text,
  created_at   timestamptz not null default now()
);

-- Games (populated by the live-scores Edge Fn or manual client entries) ------
create table games (
  id         text primary key,
  league     text not null,
  home_team  text not null,
  away_team  text not null,
  starts_at  timestamptz not null,
  status     text not null default 'scheduled',  -- scheduled|live|final
  home_score int,
  away_score int,
  season     text,
  updated_at timestamptz not null default now()
);

-- Log entries (user watched a game) ----------------------------------------
create table logs (
  id           uuid primary key default gen_random_uuid(),
  user_id      text not null default (auth.jwt()->>'sub'),
  game_id      text not null references games(id),
  watched_via  text,                             -- live|venue|replay|highlights|bar
  review       text,
  reaction     text,
  spoiler_free boolean not null default true,
  created_at   timestamptz not null default now(),
  unique (user_id, game_id)
);

-- Elo rankings (one row per user × game) ------------------------------------
create table ranks (
  id         uuid primary key default gen_random_uuid(),
  user_id    text not null default (auth.jwt()->>'sub'),
  game_id    text not null references games(id),
  score      double precision not null default 1500,
  created_at timestamptz not null default now(),
  unique (user_id, game_id)
);

-- Friend graph (directed; mutual when status = 'accepted') ------------------
create table friendships (
  id           uuid primary key default gen_random_uuid(),
  requester_id text not null default (auth.jwt()->>'sub'),
  addressee_id text not null,
  status       text not null default 'pending',  -- pending|accepted|blocked
  created_at   timestamptz not null default now(),
  unique (requester_id, addressee_id)
);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table profiles    enable row level security;
alter table games       enable row level security;
alter table logs        enable row level security;
alter table ranks       enable row level security;
alter table friendships enable row level security;

-- profiles ------------------------------------------------------------------
create policy "profiles: read all"
  on profiles for select to authenticated using (true);

create policy "profiles: insert own"
  on profiles for insert to authenticated
  with check (id = auth.jwt()->>'sub');

create policy "profiles: update own"
  on profiles for update to authenticated
  using (id = auth.jwt()->>'sub');

-- games ---------------------------------------------------------------------
create policy "games: read all"
  on games for select to authenticated using (true);

-- Service role (Edge Functions) bypasses RLS for bulk upserts from the sports API.
-- Authenticated users may create manual game entries (id prefix enforced by app).
create policy "games: insert manual"
  on games for insert to authenticated
  with check (id like 'manual-%');

-- logs ----------------------------------------------------------------------
-- A user can read their own logs, or an accepted friend's logs.
create policy "logs: read own or friends"
  on logs for select to authenticated using (
    user_id = auth.jwt()->>'sub'
    or exists (
      select 1 from friendships f
      where f.status = 'accepted'
        and (
          (f.requester_id = auth.jwt()->>'sub' and f.addressee_id = logs.user_id)
          or (f.addressee_id = auth.jwt()->>'sub' and f.requester_id = logs.user_id)
        )
    )
  );

create policy "logs: insert own"
  on logs for insert to authenticated
  with check (user_id = auth.jwt()->>'sub');

create policy "logs: update own"
  on logs for update to authenticated
  using (user_id = auth.jwt()->>'sub');

create policy "logs: delete own"
  on logs for delete to authenticated
  using (user_id = auth.jwt()->>'sub');

-- ranks ---------------------------------------------------------------------
create policy "ranks: own"
  on ranks for all to authenticated
  using  (user_id = auth.jwt()->>'sub')
  with check (user_id = auth.jwt()->>'sub');

-- friendships ---------------------------------------------------------------
create policy "friendships: read own"
  on friendships for select to authenticated using (
    requester_id = auth.jwt()->>'sub' or addressee_id = auth.jwt()->>'sub'
  );

create policy "friendships: create"
  on friendships for insert to authenticated
  with check (requester_id = auth.jwt()->>'sub');

create policy "friendships: update own"
  on friendships for update to authenticated using (
    requester_id = auth.jwt()->>'sub' or addressee_id = auth.jwt()->>'sub'
  );
