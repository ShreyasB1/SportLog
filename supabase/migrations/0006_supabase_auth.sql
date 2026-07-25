-- Migration from Clerk to Supabase Auth.
--
-- The schema keys user rows on auth.jwt()->>'sub' (TEXT). Under Supabase
-- Auth, 'sub' is the auth.users UUID rendered as text, so every existing RLS
-- policy keeps working unchanged. This migration only adds:
--   1. a trigger that creates a profile row when a user signs up
--   2. a helper that erases all of a user's data (used by account deletion)
--
-- NOTE: existing Clerk-era rows (user ids like 'user_2...') will be orphaned.
-- If there is production data to keep, map Clerk ids to new Supabase users
-- before flipping the app over.

-- 1. Auto-create a profile on signup --------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base_username text;
  final_username text;
begin
  base_username := coalesce(
    nullif(regexp_replace(lower(new.raw_user_meta_data->>'username'), '[^a-z0-9_]', '', 'g'), ''),
    'user' || replace(substr(new.id::text, 1, 8), '-', '')
  );
  final_username := base_username;
  -- de-dupe: append a short suffix until the username is free
  while exists (select 1 from public.profiles where username = final_username) loop
    final_username := base_username || '_' || substr(md5(random()::text), 1, 4);
  end loop;

  insert into public.profiles (id, username, display_name)
  values (new.id::text, final_username, new.raw_user_meta_data->>'username')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 2. Cascade app data when an auth user is deleted -------------------------
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
  return old;
end;
$$;

drop trigger if exists on_auth_user_deleted on auth.users;
create trigger on_auth_user_deleted
  before delete on auth.users
  for each row execute function public.handle_user_deleted();
