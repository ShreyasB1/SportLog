# SportLog — stack scaffold

A Letterboxd/Beli-for-sports app: log games you've watched, rate them by
**relative ranking** (not stars), follow friends, and get spoiler-free
"should I watch this?" recommendations.

`setup.sh` scaffolds the whole stack and pushes it to GitHub. Read this first,
then run `./setup.sh sportlog private` and work through the manual checklist it
prints. Hand the resulting repo to Claude Code to build the screens.

## Stack

| Concern            | Service                          | Where it runs |
|--------------------|----------------------------------|---------------|
| Frontend + UI      | Expo (React Native) + expo-router | Mobile app    |
| Backend / DB       | Supabase (Postgres + RLS)         | Managed       |
| Auth               | Clerk (native Supabase integration) | App + verified by Supabase |
| Sports data        | Sports API (e.g. API-Sports)      | Edge Function |
| Cache / rate-limit | Upstash Redis                     | Edge Function |
| Vector search      | Pinecone                          | Edge Function |
| Analytics          | PostHog                           | Mobile app    |
| Error tracking     | Sentry                            | Mobile app    |
| Version control    | GitHub                            | —             |
| DNS                | Cloudflare                        | Dashboard     |

## The one rule that shapes the architecture

Anything prefixed `EXPO_PUBLIC_` is **compiled into the downloadable app
bundle** and can be extracted by anyone. So secret-bearing services never run
in the mobile app:

- **In the app (public keys only):** Clerk publishable key, Supabase anon key,
  PostHog key, Sentry DSN.
- **In Supabase Edge Functions (secrets):** the sports API key, Upstash Redis,
  Pinecone, and the Supabase service-role key. The app calls these functions;
  it never holds their keys.

That's why `live-scores` (Upstash + sports API) and `recommend` (Pinecone) are
Edge Functions, not client code.

## Clerk + Supabase (the non-obvious integration)

Uses Supabase's **native third-party auth** — the old Clerk JWT-template
approach is deprecated. Two consequences baked into the schema:

- RLS policies key off `auth.jwt()->>'sub'` (the Clerk user id, a **text**
  value), not `auth.uid()`. `auth.uid()` returns a UUID and won't work with
  Clerk ids.
- The Supabase client passes a Clerk token getter via the `accessToken` option
  (see `lib/useSupabase.ts`); Supabase verifies it against Clerk's JWKS.

## Data model (in `supabase/migrations/0001_init.sql`)

`profiles`, `games`, `logs` (watch entries + reviews), `ranks` (private
pairwise-ranking scores), `friendships`. RLS lets you read your own and accepted
friends' logs; `games` is read-only to clients and written only by the
service-role Edge Function.

## Where Claude Code takes over

The scaffold wires the services and leaves stubs. Good next tasks to delegate:

1. Auth screens (Clerk sign-in/up) + a profile-creation step that inserts a
   `profiles` row.
2. The **logbook** + **relative-ranking** flow (pairwise "better / worse / about
   the same?" that maintains `ranks.score`). Redis sorted sets are a natural fit
   for the resulting leaderboards.
3. A spoiler-first feed and game pages (blur scores/reviews until the user marks
   a game watched).
4. Flesh out `normalize()` in `live-scores` for your chosen provider, and the
   embedding pipeline feeding Pinecone in `recommend`.

## Manual steps

The script can't create accounts or set dashboard secrets. After running it,
follow the checklist it prints (accounts → `.env.local` → Clerk↔Supabase auth →
`supabase db push` → `supabase secrets set` + `functions deploy` → Sentry token →
Cloudflare DNS → `npx expo start`).
