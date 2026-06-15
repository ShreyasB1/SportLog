// live-scores Edge Function
// Fetch from the sports API, cache in Upstash Redis (30 s TTL) to protect the
// upstream rate limit, then upsert into Postgres using the service role key
// (which bypasses RLS, so game rows can be written server-side).
//
// Required secrets (set via `supabase secrets set`):
//   SPORTS_API_KEY, UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN
//   SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { Redis } from 'https://esm.sh/@upstash/redis'

const redis = new Redis({
  url: Deno.env.get('UPSTASH_REDIS_REST_URL')!,
  token: Deno.env.get('UPSTASH_REDIS_REST_TOKEN')!,
})

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

// Map the API-Sports payload shape to our `games` table columns.
// Adjust field paths to match whichever sports provider you use.
function normalize(payload: unknown) {
  const response = (payload as any)?.response ?? []
  return response.map((g: any) => ({
    id: String(g.id),
    league: g.league?.name ?? 'unknown',
    home_team: g.teams?.home?.name ?? '',
    away_team: g.teams?.away?.name ?? '',
    starts_at: g.date,
    status: g.status?.short ?? 'scheduled',
    home_score: g.scores?.home ?? null,
    away_score: g.scores?.away ?? null,
    season: String(g.league?.season ?? ''),
    updated_at: new Date().toISOString(),
  }))
}

Deno.serve(async (req) => {
  const league = new URL(req.url).searchParams.get('league') ?? 'NBA'
  const cacheKey = `scores:${league}`

  const cached = await redis.get(cacheKey)
  if (cached) {
    return Response.json({ source: 'cache', games: cached })
  }

  const res = await fetch(
    `https://v1.basketball.api-sports.io/games?league=${league}`,
    { headers: { 'x-apisports-key': Deno.env.get('SPORTS_API_KEY')! } },
  )
  const games = normalize(await res.json())

  const { error } = await supabase.from('games').upsert(games)
  if (error) console.error('upsert error', error)

  await redis.set(cacheKey, games, { ex: 30 })

  return Response.json({ source: 'api', games })
})
