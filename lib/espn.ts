import type { Game } from './types'

const BASE = 'https://site.api.espn.com/apis/site/v2/sports'

export const SPORT_LEAGUES = [
  { key: 'NBA',               sport: 'basketball', league: 'nba',                     label: '🏀 NBA' },
  { key: 'WNBA',              sport: 'basketball', league: 'wnba',                    label: '🏀 WNBA' },
  { key: 'NFL',               sport: 'football',   league: 'nfl',                     label: '🏈 NFL' },
  { key: 'NCAAF',             sport: 'football',   league: 'college-football',        label: '🏈 NCAAF' },
  { key: 'MLB',               sport: 'baseball',   league: 'mlb',                     label: '⚾ MLB' },
  { key: 'NHL',               sport: 'hockey',     league: 'nhl',                     label: '🏒 NHL' },
  { key: 'MLS',               sport: 'soccer',     league: 'usa.1',                   label: '⚽ MLS' },
  { key: 'Premier League',    sport: 'soccer',     league: 'eng.1',                   label: '⚽ EPL' },
  { key: 'La Liga',           sport: 'soccer',     league: 'esp.1',                   label: '⚽ La Liga' },
  { key: 'Bundesliga',        sport: 'soccer',     league: 'ger.1',                   label: '⚽ Bundesliga' },
  { key: 'Serie A',           sport: 'soccer',     league: 'ita.1',                   label: '⚽ Serie A' },
  { key: 'Ligue 1',           sport: 'soccer',     league: 'fra.1',                   label: '⚽ Ligue 1' },
  { key: 'Champions League',  sport: 'soccer',     league: 'uefa.champions',          label: '🏆 UCL' },
  { key: 'Europa League',     sport: 'soccer',     league: 'uefa.europa',             label: '🏆 UEL' },
  // World Cup 2026 & qualifying
  { key: 'World Cup',         sport: 'soccer',     league: 'fifa.world',              label: '🌍 World Cup' },
  { key: 'WCQ CONCACAF',      sport: 'soccer',     league: 'fifa.worldq.concacaf',    label: '🌍 CONCACAF WCQ' },
  { key: 'WCQ UEFA',          sport: 'soccer',     league: 'fifa.worldq.uefa',        label: '🌍 UEFA WCQ' },
  { key: 'WCQ CONMEBOL',      sport: 'soccer',     league: 'fifa.worldq.conmebol',    label: '🌍 CONMEBOL WCQ' },
  { key: 'WCQ AFC',           sport: 'soccer',     league: 'fifa.worldq.afc',         label: '🌍 AFC WCQ' },
]

// ESPN scoreboard supports a date range: ?dates=YYYYMMDD-YYYYMMDD
// Fetch 7 days back and 14 days ahead so we show recent results + upcoming fixtures.
function dateRange(): string {
  const start = new Date()
  start.setDate(start.getDate() - 7)
  const end = new Date()
  end.setDate(end.getDate() + 14)
  const fmt = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '')
  return `${fmt(start)}-${fmt(end)}`
}

function normalizeEvent(event: any, leagueKey: string): Game | null {
  try {
    const comp = event.competitions?.[0]
    const competitors: any[] = comp?.competitors ?? []
    const home = competitors.find((c: any) => c.homeAway === 'home')
    const away = competitors.find((c: any) => c.homeAway === 'away')
    if (!home || !away) return null

    const state: string = event.status?.type?.state ?? 'pre'
    const status = state === 'in' ? 'live' : state === 'post' ? 'final' : 'scheduled'

    return {
      id: `espn-${event.id}`,
      league: leagueKey,
      home_team: home.team?.displayName ?? '',
      away_team: away.team?.displayName ?? '',
      starts_at: event.date,
      status,
      home_score: status !== 'scheduled' ? Number(home.score) || 0 : null,
      away_score: status !== 'scheduled' ? Number(away.score) || 0 : null,
      season: null,
      updated_at: new Date().toISOString(),
    }
  } catch {
    return null
  }
}

export async function fetchLeagueGames(leagueKey: string): Promise<Game[]> {
  const def = SPORT_LEAGUES.find(l => l.key === leagueKey)
  if (!def) return []
  try {
    const res = await fetch(
      `${BASE}/${def.sport}/${def.league}/scoreboard?dates=${dateRange()}&limit=100`
    )
    if (!res.ok) return []
    const json = await res.json()
    return (json.events ?? [])
      .map((e: any) => normalizeEvent(e, def.key))
      .filter(Boolean) as Game[]
  } catch {
    return []
  }
}

export async function fetchAllGames(): Promise<Game[]> {
  const results = await Promise.allSettled(
    SPORT_LEAGUES.map(l => fetchLeagueGames(l.key))
  )
  return results
    .flatMap(r => (r.status === 'fulfilled' ? r.value : []))
    .sort((a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime())
}
