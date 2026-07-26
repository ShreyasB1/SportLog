import { useCallback, useEffect, useState } from 'react'
import {
  FlatList,
  RefreshControl,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { router, useLocalSearchParams } from 'expo-router'
import { useSupabase } from '../../lib/useSupabase'
import { useUser } from '../../lib/useSession'
import { fetchAllGames } from '../../lib/espn'
import { buildShareText, computeDayStreak, gradePick, type PickOutcome } from '../../lib/points'
import type { Game, Log, Pick } from '../../lib/types'

const WATCHED_VIA_LABELS: Record<string, string> = {
  live:       '📺 Live TV',
  venue:      '🏟️ Venue',
  replay:     '⏪ Replay',
  highlights: '✂️ Highlights',
  bar:        '🍺 Bar',
}

export default function Logbook() {
  const supabase = useSupabase()
  const user = useUser()
  const params = useLocalSearchParams<{ tab?: string }>()
  const [mode,    setMode]    = useState<'diary' | 'picks'>(
    params.tab === 'picks' ? 'picks' : 'diary'
  )

  // Keep responding when the tab is re-focused with a new param
  useEffect(() => {
    if (params.tab === 'picks') setMode('picks')
    else if (params.tab === 'diary') setMode('diary')
  }, [params.tab])
  const [logs,    setLogs]    = useState<Log[]>([])
  const [picks,   setPicks]   = useState<Pick[]>([])
  const [loading, setLoading] = useState(true)

  // Both queries filter on user_id explicitly. RLS alone is not enough here:
  // logs are readable for anyone you follow, and picks are readable app-wide,
  // so an unfiltered select returns other people's rows into your own logbook.
  const fetchLogs = useCallback(async () => {
    if (!user) return
    const { data } = await supabase
      .from('logs')
      .select('*, game:games(*)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
    setLogs((data as Log[]) ?? [])
  }, [supabase, user])

  const fetchPicks = useCallback(async () => {
    if (!user) return
    const [{ data }, fresh] = await Promise.all([
      supabase
        .from('picks')
        .select('*, game:games(*)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false }),
      // Stored game rows go stale once a pick is made; overlay live ESPN data
      fetchAllGames().catch(() => [] as Game[]),
    ])
    const freshById = new Map(fresh.map(g => [g.id, g]))
    const merged = ((data as Pick[]) ?? []).map(p => {
      const f = freshById.get(p.game_id)
      return f ? { ...p, game: { ...p.game, ...f } } : p
    })
    setPicks(merged)

    // Persist newly-final scores so stats stay accurate app-wide
    const newlyFinal = merged.filter(
      p => p.game?.status === 'final' &&
        freshById.has(p.game_id) &&
        ((data as Pick[]) ?? []).find(o => o.id === p.id)?.game?.status !== 'final'
    )
    if (newlyFinal.length > 0) {
      supabase.from('games').upsert(
        newlyFinal.map(p => ({
          id: p.game.id,
          league: p.game.league,
          home_team: p.game.home_team,
          away_team: p.game.away_team,
          starts_at: p.game.starts_at,
          status: p.game.status,
          home_score: p.game.home_score,
          away_score: p.game.away_score,
          season: p.game.season,
          updated_at: new Date().toISOString(),
        }))
      ).then(() => {}, () => {})
    }
  }, [supabase, user])

  const fetchAll = useCallback(async () => {
    setLoading(true)
    await Promise.all([fetchLogs(), fetchPicks()])
    setLoading(false)
  }, [fetchLogs, fetchPicks])

  useEffect(() => { fetchAll() }, [fetchAll])

  // Header stats
  const leagues = new Set(logs.map(l => l.game?.league).filter(Boolean))
  const graded = picks.map(gradePick)
  const wins = graded.filter(o => o === 'correct').length
  const losses = graded.filter(o => o === 'incorrect').length
  const accuracy = wins + losses > 0 ? Math.round((wins / (wins + losses)) * 100) : null
  const streak = computeDayStreak(picks.map(p => p.created_at))

  const shareRecord = () => {
    Share.share({ message: buildShareText(picks, { streak }) }).catch(() => {})
  }

  const isDiary = mode === 'diary'

  return (
    <View style={styles.container}>
      <FlatList
        data={isDiary ? (logs as (Log | Pick)[]) : (picks as (Log | Pick)[])}
        keyExtractor={item => item.id}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={fetchAll} tintColor="#e94560" />
        }
        contentContainerStyle={[
          styles.list,
          (isDiary ? logs : picks).length === 0 && styles.listEmpty,
        ]}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.headerTop}>
              <Text style={styles.title}>Logbook</Text>
              <TouchableOpacity
                style={styles.addBtn}
                onPress={() => router.push('/log-game')}
              >
                <Ionicons name="add" size={16} color="#fff" />
                <Text style={styles.addBtnText}>Log Game</Text>
              </TouchableOpacity>
            </View>

            {/* Diary | Picks toggle */}
            <View style={styles.segment}>
              <TouchableOpacity
                style={[styles.segmentBtn, isDiary && styles.segmentBtnActive]}
                onPress={() => setMode('diary')}
              >
                <Text style={[styles.segmentText, isDiary && styles.segmentTextActive]}>
                  Diary
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.segmentBtn, !isDiary && styles.segmentBtnActive]}
                onPress={() => setMode('picks')}
              >
                <Text style={[styles.segmentText, !isDiary && styles.segmentTextActive]}>
                  Picks
                </Text>
              </TouchableOpacity>
            </View>

            {isDiary && logs.length > 0 && (
              <View style={styles.statsRow}>
                <StatChip icon="film-outline" value={`${logs.length}`} label="games" />
                <StatChip icon="trophy-outline" value={`${leagues.size}`} label="leagues" />
              </View>
            )}
            {!isDiary && picks.length > 0 && (
              <View style={styles.statsRow}>
                <StatChip icon="flash-outline" value={`${picks.length}`} label="picks" />
                <StatChip icon="checkmark-circle-outline" value={`${wins}–${losses}`} label="record" />
                {accuracy != null && (
                  <StatChip icon="analytics-outline" value={`${accuracy}%`} label="accuracy" />
                )}
                {streak > 1 && (
                  <StatChip icon="flame-outline" value={`${streak}`} label="day streak" />
                )}
                <TouchableOpacity style={styles.shareChip} onPress={shareRecord}>
                  <Ionicons name="share-outline" size={13} color="#e94560" />
                  <Text style={styles.shareChipText}>Share</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        }
        ListEmptyComponent={
          !loading ? (
            isDiary ? (
              <View style={styles.empty}>
                <View style={styles.emptyIconWrap}>
                  <Text style={styles.emptyIcon}>🏟️</Text>
                </View>
                <Text style={styles.emptyTitle}>No games logged yet</Text>
                <Text style={styles.emptySub}>Start building your sports diary</Text>
                <TouchableOpacity
                  style={styles.emptyBtn}
                  onPress={() => router.push('/log-game')}
                >
                  <Ionicons name="add" size={16} color="#fff" />
                  <Text style={styles.emptyBtnText}>Log Your First Game</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.empty}>
                <View style={styles.emptyIconWrap}>
                  <Text style={styles.emptyIcon}>⚡</Text>
                </View>
                <Text style={styles.emptyTitle}>No picks yet</Text>
                <Text style={styles.emptySub}>Swipe on matchups in the Picks tab</Text>
                <TouchableOpacity
                  style={styles.emptyBtn}
                  onPress={() => router.push('/(tabs)/picks')}
                >
                  <Ionicons name="flash" size={16} color="#fff" />
                  <Text style={styles.emptyBtnText}>Make Your First Pick</Text>
                </TouchableOpacity>
              </View>
            )
          ) : null
        }
        renderItem={({ item }) =>
          isDiary ? <LogCard log={item as Log} /> : <PickCard pick={item as Pick} />
        }
      />
    </View>
  )
}

function StatChip({ icon, value, label }: { icon: any; value: string; label: string }) {
  return (
    <View style={styles.statChip}>
      <Ionicons name={icon} size={13} color="#555" />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  )
}

const OUTCOME_META: Record<PickOutcome, { label: string; color: string; bg: string }> = {
  correct:   { label: '✓ Correct',   color: '#2ecc71', bg: '#0d2a1a' },
  incorrect: { label: '✗ Missed',    color: '#e94560', bg: '#2a0e1a' },
  draw:      { label: '— Draw',      color: '#888',    bg: '#1e1e38' },
  pending:   { label: '⏳ Pending',  color: '#c9a227', bg: '#241d08' },
}

function PickCard({ pick }: { pick: Pick }) {
  const g = pick.game
  const outcome = gradePick(pick)
  const meta = OUTCOME_META[outcome]
  const isFinal = g?.status === 'final' && g.home_score != null

  return (
    <View style={styles.card}>
      <View style={styles.cardTopRow}>
        <View style={styles.leaguePill}>
          <Text style={styles.leaguePillText}>{g?.league}</Text>
        </View>
        <View style={[styles.outcomeBadge, { backgroundColor: meta.bg }]}>
          <Text style={[styles.outcomeText, { color: meta.color }]}>{meta.label}</Text>
        </View>
      </View>

      <Text style={styles.matchup}>{g?.home_team} vs {g?.away_team}</Text>

      {isFinal ? (
        <Text style={styles.finalScore}>Final · {g.home_score} – {g.away_score}</Text>
      ) : (
        <Text style={styles.finalScore}>
          {g?.status === 'live' ? 'Live now' : g ? new Date(g.starts_at).toLocaleDateString('en-US', {
            weekday: 'short', month: 'short', day: 'numeric',
          }) : ''}
        </Text>
      )}

      <View style={styles.cardFooter}>
        <Text style={styles.pickedLine}>
          Your pick: <Text style={styles.pickedTeam}>{pick.picked_team}</Text>
        </Text>
        <Text style={styles.dateText}>
          {new Date(pick.created_at).toLocaleDateString('en-US', {
            month: 'short', day: 'numeric',
          })}
        </Text>
      </View>
    </View>
  )
}

function LogCard({ log }: { log: Log }) {
  const g = log.game
  const isFinal = g.home_score != null

  return (
    <View style={styles.card}>
      {/* Top row: league + reaction */}
      <View style={styles.cardTopRow}>
        <View style={styles.leaguePill}>
          <Text style={styles.leaguePillText}>{g.league}</Text>
        </View>
        <View style={styles.cardTopRight}>
          {log.watched_via && (
            <Text style={styles.watchedViaBadge}>
              {WATCHED_VIA_LABELS[log.watched_via] ?? log.watched_via}
            </Text>
          )}
          {log.reaction && <Text style={styles.reactionEmoji}>{log.reaction}</Text>}
        </View>
      </View>

      {/* Matchup */}
      <Text style={styles.matchup}>{g.home_team} vs {g.away_team}</Text>

      {/* Score line */}
      {isFinal && (
        <Text style={styles.finalScore}>{g.home_score} – {g.away_score}</Text>
      )}

      {/* Review */}
      {log.review ? (
        <Text style={styles.review} numberOfLines={3}>{log.review}</Text>
      ) : null}

      {/* Footer */}
      <View style={styles.cardFooter}>
        <Text style={styles.dateText}>
          {new Date(log.created_at).toLocaleDateString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric',
          })}
        </Text>
        {log.spoiler_free && (
          <View style={styles.spoilerBadge}>
            <Ionicons name="eye-off-outline" size={10} color="#e94560" />
            <Text style={styles.spoilerText}>No spoilers</Text>
          </View>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0f' },
  list: { paddingBottom: 110 },
  listEmpty: { flexGrow: 1 },

  // Header
  header: {
    paddingTop: 60, paddingHorizontal: 20, paddingBottom: 8,
  },
  headerTop: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 14,
  },
  title: { fontSize: 30, fontWeight: '800', color: '#fff', letterSpacing: -0.5 },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#e94560', borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 8,
  },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  segment: {
    flexDirection: 'row', backgroundColor: '#111120',
    borderRadius: 12, borderWidth: 1, borderColor: '#1e1e38',
    padding: 3, marginBottom: 12,
  },
  segmentBtn: {
    flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 9,
  },
  segmentBtnActive: { backgroundColor: '#e94560' },
  segmentText: { fontSize: 13, fontWeight: '700', color: '#666' },
  segmentTextActive: { color: '#fff' },

  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  shareChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#2a0e1a', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 6,
    borderWidth: 1, borderColor: '#e94560',
  },
  shareChipText: { fontSize: 12, fontWeight: '700', color: '#e94560' },
  statChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#111120', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 6,
    borderWidth: 1, borderColor: '#1e1e38',
  },
  statValue: { fontSize: 13, fontWeight: '800', color: '#fff' },
  statLabel: { fontSize: 12, color: '#555' },

  // Cards
  card: {
    backgroundColor: '#111120', borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 14,
    marginHorizontal: 16, marginBottom: 10,
    borderWidth: 1, borderColor: '#1e1e38', gap: 8,
  },
  cardTopRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
  },
  leaguePill: {
    backgroundColor: '#1e1e38', borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  leaguePillText: {
    fontSize: 10, fontWeight: '700', color: '#888',
    textTransform: 'uppercase', letterSpacing: 0.8,
  },
  cardTopRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  watchedViaBadge: { fontSize: 12, color: '#444' },
  reactionEmoji: { fontSize: 22 },
  matchup: { fontSize: 18, fontWeight: '800', color: '#fff', lineHeight: 24 },
  finalScore: { fontSize: 15, fontWeight: '700', color: '#666' },
  review: { fontSize: 14, color: '#999', lineHeight: 21 },
  cardFooter: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginTop: 2,
  },
  dateText: { fontSize: 12, color: '#444' },
  spoilerBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderWidth: 1, borderColor: '#2a0e1a',
    borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3,
  },
  spoilerText: { fontSize: 10, color: '#e94560', fontWeight: '600' },

  outcomeBadge: {
    borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4,
  },
  outcomeText: { fontSize: 11, fontWeight: '800' },
  pickedLine: { fontSize: 13, color: '#666' },
  pickedTeam: { color: '#fff', fontWeight: '700' },

  // Empty state
  empty: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    padding: 40, marginTop: 20,
  },
  emptyIconWrap: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: '#111120', borderWidth: 1, borderColor: '#1e1e38',
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  emptyIcon: { fontSize: 36 },
  emptyTitle: { fontSize: 20, fontWeight: '800', color: '#fff' },
  emptySub: { fontSize: 14, color: '#555', textAlign: 'center', marginTop: 6 },
  emptyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#e94560', borderRadius: 14,
    paddingHorizontal: 24, paddingVertical: 13, marginTop: 24,
  },
  emptyBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
})
