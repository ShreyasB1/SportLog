import type { Game } from './types'

// One place for pick grading + scoring so profile, logbook, friend pages
// and the leaderboard always agree.
export const POINTS_PER_CORRECT = 10

export type PickOutcome = 'correct' | 'incorrect' | 'draw' | 'pending'

export interface GradablePick {
  picked_team: string
  result?: string | null
  game?: Pick<Game, 'home_team' | 'away_team' | 'home_score' | 'away_score' | 'status'> | null
}

export function gradePick(p: GradablePick): PickOutcome {
  if (p.result === 'correct' || p.result === 'incorrect') return p.result
  const g = p.game
  if (g?.status !== 'final' || g.home_score == null || g.away_score == null) return 'pending'
  if (g.home_score === g.away_score) return 'draw'
  const winner = g.home_score > g.away_score ? g.home_team : g.away_team
  return winner === p.picked_team ? 'correct' : 'incorrect'
}

export interface PickRecord {
  total: number
  wins: number
  losses: number
  pending: number
  points: number
  accuracy: number | null // 0–100, null until at least one graded pick
}

// Consecutive calendar days (ending today or yesterday) with at least one
// pick. Yesterday counts so the streak doesn't read 0 before today's picks.
export function computeDayStreak(createdAts: string[]): number {
  if (createdAts.length === 0) return 0
  const days = new Set(
    createdAts.map(iso => {
      const d = new Date(iso)
      return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
    })
  )
  const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
  const cursor = new Date()
  if (!days.has(dayKey(cursor))) {
    cursor.setDate(cursor.getDate() - 1)
    if (!days.has(dayKey(cursor))) return 0
  }
  let streak = 0
  while (days.has(dayKey(cursor))) {
    streak++
    cursor.setDate(cursor.getDate() - 1)
  }
  return streak
}

// Wordle-style share text: emoji grid of the most recent graded picks
// plus the headline record. `picks` should be newest-first.
export function buildShareText(
  picks: (GradablePick & { created_at?: string })[],
  opts?: { streak?: number; username?: string }
): string {
  const graded = picks
    .map(p => gradePick(p))
    .filter(o => o === 'correct' || o === 'incorrect' || o === 'draw')
    .slice(0, 10)
  const grid = graded
    .reverse() // oldest → newest reads left to right
    .map(o => (o === 'correct' ? '🟩' : o === 'incorrect' ? '🟥' : '⬜'))
    .join('')
  const record = computePickRecord(picks)
  const lines = [
    `SportLog Picks${opts?.username ? ` · @${opts.username}` : ''}`,
    `${record.wins}–${record.losses}${record.accuracy != null ? ` · ${record.accuracy}% accuracy` : ''} · ${record.points} pts`,
  ]
  if (opts?.streak && opts.streak > 1) lines.push(`🔥 ${opts.streak}-day streak`)
  if (grid) lines.push('', `Last ${graded.length}: ${grid}`)
  lines.push('', 'Think you can beat me? 🏆')
  return lines.join('\n')
}

export function computePickRecord(picks: GradablePick[]): PickRecord {
  let wins = 0
  let losses = 0
  let pending = 0
  for (const p of picks) {
    const outcome = gradePick(p)
    if (outcome === 'correct') wins++
    else if (outcome === 'incorrect') losses++
    else if (outcome === 'pending') pending++
  }
  return {
    total: picks.length,
    wins,
    losses,
    pending,
    points: wins * POINTS_PER_CORRECT,
    accuracy: wins + losses > 0 ? Math.round((wins / (wins + losses)) * 100) : null,
  }
}
