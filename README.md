# SportLog

A Letterboxd/Beli-for-sports app: log games you've watched, rank them against each other with pairwise comparisons, follow friends, and get spoiler-free "should I watch this?" recommendations.

## Features

- **Logbook** — record every game you watch with a reaction, free-text review, how you watched it, and a spoiler-free toggle
- **Relative ranking** — Beli-style pairwise comparisons power an Elo leaderboard; no star ratings, just "which was better?"
- **Friends** — follow people and see their logs without spoilers until you've watched the game
- **Recommendations** — Pinecone vector search matches your taste profile to upcoming games

## Stack

| Concern | Service | Runs in |
|---|---|---|
| UI | Expo (React Native) + expo-router | Mobile app |
| Database | Supabase (Postgres + RLS) | Managed cloud |
| Auth | Clerk (native Supabase integration) | App + JWKS-verified by Supabase |
| Sports data | API-Sports (or any provider) | Edge Function |
| Cache | Upstash Redis | Edge Function |
| Vector search | Pinecone | Edge Function |
| Analytics | PostHog | Mobile app |
| Error tracking | Sentry | Mobile app |

## Project structure

```
app/
├── _layout.tsx              # Root: Sentry + Clerk + PostHog providers
├── index.tsx                # Entry — redirects based on auth state
├── log-game.tsx             # Modal: log a new game
├── (auth)/
│   ├── sign-in.tsx
│   ├── sign-up.tsx
│   └── verify-email.tsx
└── (tabs)/
    ├── index.tsx            # Logbook
    ├── profile.tsx
    └── rank/
        ├── index.tsx        # Ranked list (Elo scores, medal podium)
        └── compare.tsx      # Pairwise comparison screen

lib/
├── elo.ts                   # Elo algorithm (K=32, initial 1500)
├── tokenCache.ts            # Clerk SecureStore adapter
├── types.ts                 # Shared TypeScript types
└── useSupabase.ts           # Clerk-authenticated Supabase client

supabase/
├── migrations/0001_init.sql # Schema + RLS policies
└── functions/
    ├── live-scores/         # Sports API → Upstash cache → Postgres upsert
    └── recommend/           # Pinecone vector query
```

## Getting started

### 1. Create accounts

You need accounts for: Supabase, Clerk, PostHog, Sentry, Upstash, Pinecone, and a sports-data provider (e.g. [API-Sports](https://api-sports.io)).

### 2. Fill environment variables

```sh
cp .env.example .env.local
# Edit .env.local and add your public keys (top block only)
```

### 3. Connect Clerk to Supabase

1. Clerk dashboard → **Configure → Integrations → Connect with Supabase** → copy the Clerk domain.
2. Supabase dashboard → **Authentication → Sign In / Providers → Third Party Auth** → add Clerk, paste the domain.

This replaces the old JWT-template approach. The Supabase client sends the raw Clerk session token; Supabase validates it via Clerk's JWKS endpoint.

### 4. Push the database schema

```sh
npx supabase link --project-ref <your-ref>
npx supabase db push
```

### 5. Deploy Edge Functions with server-side secrets

```sh
supabase secrets set \
  SPORTS_API_KEY=... \
  UPSTASH_REDIS_REST_URL=... \
  UPSTASH_REDIS_REST_TOKEN=... \
  PINECONE_API_KEY=...

supabase functions deploy live-scores recommend
```

### 6. Run

```sh
npm install
npx expo start
```

## Architecture notes

### Secret isolation

Anything prefixed `EXPO_PUBLIC_` is compiled into the app bundle and extractable by anyone. Secret-bearing services therefore never run in the mobile client:

- **In the app (public keys only):** Clerk publishable key, Supabase anon key, PostHog key, Sentry DSN.
- **In Edge Functions (secrets):** sports API key, Upstash, Pinecone, Supabase service-role key. The app calls the functions; it never holds their secrets.

### Clerk + Supabase RLS

Supabase's native third-party auth is used (the Clerk JWT-template approach is deprecated). Two consequences baked into the schema:

- RLS policies key off `auth.jwt()->>'sub'` — the Clerk user id, which is a **text** value. `auth.uid()` returns a UUID and will not match Clerk ids.
- The client is created with an `accessToken` getter (`lib/useSupabase.ts`) that returns the current Clerk session token on every request.

### Elo ranking

Games start at 1500. Each pairwise comparison updates both scores using standard Elo (K=32). The ranked list sorts descending by score. Adjacent-score pairs are preferred so each comparison is maximally informative.

### Manual game entries

Until the live-scores Edge Function is running, games can be created manually via the Log Game screen. These rows get an `id` prefixed with `manual-`, which is enforced by an RLS policy (`id like 'manual-%'`). The sports API upserts later overwrite with canonical data if the IDs match.

## Data model

| Table | Purpose |
|---|---|
| `profiles` | One row per Clerk user; `id` = Clerk user id (text) |
| `games` | Synced from sports API or manually created |
| `logs` | A user's watch entry for a game (reaction, review, spoiler flag) |
| `ranks` | Elo score per user × game; updated on each pairwise comparison |
| `friendships` | Directed graph; mutual when `status = 'accepted'` |

Full schema and RLS policies: [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql)

## Environment variable reference

| Variable | Where | Purpose |
|---|---|---|
| `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` | App bundle | Clerk auth |
| `EXPO_PUBLIC_SUPABASE_URL` | App bundle | Supabase endpoint |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | App bundle | Supabase anon role |
| `EXPO_PUBLIC_POSTHOG_KEY` | App bundle | PostHog analytics |
| `EXPO_PUBLIC_POSTHOG_HOST` | App bundle | PostHog ingestion host |
| `EXPO_PUBLIC_SENTRY_DSN` | App bundle | Sentry error reporting |
| `SENTRY_AUTH_TOKEN` | Build only | Source map upload |
| `SPORTS_API_KEY` | Edge Function | Sports data provider |
| `UPSTASH_REDIS_REST_URL` | Edge Function | Redis cache |
| `UPSTASH_REDIS_REST_TOKEN` | Edge Function | Redis auth |
| `PINECONE_API_KEY` | Edge Function | Vector search |
