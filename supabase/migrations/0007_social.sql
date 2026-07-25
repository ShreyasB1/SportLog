-- Social features: shared pick visibility (leaderboards, friend profiles)
-- and avatar storage.

-- Picks become readable by any signed-in user so friends can compare
-- records. Writes remain owner-only via the existing "for all" policy.
create policy "picks: read all"
  on picks for select to authenticated using (true);

-- Avatars bucket: public read (served via public URL), owner-scoped writes.
-- Object paths are "<user_id>/avatar-<ts>.jpg".
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy "avatars: read"
  on storage.objects for select to authenticated
  using (bucket_id = 'avatars');

create policy "avatars: upload own"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.jwt()->>'sub'
  );

create policy "avatars: update own"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.jwt()->>'sub'
  );

create policy "avatars: delete own"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.jwt()->>'sub'
  );

-- Unfollow: users may remove follows they created (no delete policy existed).
create policy "friendships: delete own"
  on friendships for delete to authenticated
  using (requester_id = auth.jwt()->>'sub');

-- The app's follow flow is one-way (no accept step), but rows were created
-- as 'pending' while every count/visibility check filters on 'accepted'.
-- Promote existing follows and let the app insert accepted rows directly.
update friendships set status = 'accepted' where status = 'pending';
