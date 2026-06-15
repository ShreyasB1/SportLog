import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { router } from 'expo-router'
import { useSupabase } from '../../../lib/useSupabase'
import { updateRatings } from '../../../lib/elo'
import type { RankEntry } from '../../../lib/types'

export default function Compare() {
  const supabase = useSupabase()
  const [allRanks, setAllRanks] = useState<RankEntry[]>([])
  const [pair, setPair] = useState<[RankEntry, RankEntry] | null>(null)
  const [loading, setLoading] = useState(true)
  const [comparing, setComparing] = useState(false)
  const [done, setDone] = useState(0)

  const loadRanks = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('ranks')
      .select('*, game:games(id, home_team, away_team, league, starts_at)')
    const ranks = (data as RankEntry[]) ?? []
    setAllRanks(ranks)
    pickPair(ranks)
    setLoading(false)
  }, [supabase])

  useEffect(() => { loadRanks() }, [loadRanks])

  function pickPair(ranks: RankEntry[]) {
    if (ranks.length < 2) { setPair(null); return }
    // Prefer matchups between games with similar scores for more informative comparisons.
    const sorted = [...ranks].sort((a, b) => a.score - b.score)
    // Pick a random adjacent pair (scores within range of each other)
    const idx = Math.floor(Math.random() * (sorted.length - 1))
    // Shuffle left/right order so the better-rated game isn't always on the left
    const flip = Math.random() < 0.5
    setPair(flip ? [sorted[idx], sorted[idx + 1]] : [sorted[idx + 1], sorted[idx]])
  }

  const pick = async (winner: RankEntry, loser: RankEntry) => {
    setComparing(true)
    const { winner: wScore, loser: lScore } = updateRatings(winner.score, loser.score)

    const updated = allRanks.map(r => {
      if (r.id === winner.id) return { ...r, score: wScore }
      if (r.id === loser.id) return { ...r, score: lScore }
      return r
    })
    setAllRanks(updated)
    setDone(d => d + 1)

    await Promise.all([
      supabase.from('ranks').update({ score: wScore }).eq('id', winner.id),
      supabase.from('ranks').update({ score: lScore }).eq('id', loser.id),
    ])

    pickPair(updated)
    setComparing(false)
  }

  const skip = () => pickPair(allRanks)

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#e94560" size="large" />
      </View>
    )
  }

  if (!pair) {
    return (
      <View style={styles.center}>
        <Text style={styles.needMoreIcon}>🏀</Text>
        <Text style={styles.needMoreTitle}>Need at least 2 games</Text>
        <Text style={styles.needMoreSub}>Log more games to start comparing</Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>← Back to Rankings</Text>
        </TouchableOpacity>
      </View>
    )
  }

  const [a, b] = pair

  return (
    <View style={styles.container}>
      {/* header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.back}>← Rankings</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Which was better?</Text>
          {done > 0 && (
            <Text style={styles.doneCount}>{done} comparison{done !== 1 ? 's' : ''}</Text>
          )}
        </View>
        <TouchableOpacity onPress={skip} hitSlop={12}>
          <Text style={styles.skipLink}>Skip</Text>
        </TouchableOpacity>
      </View>

      {/* cards */}
      <View style={styles.arena}>
        <GameCard entry={a} onPress={() => !comparing && pick(a, b)} disabled={comparing} />
        <View style={styles.vsContainer}>
          <Text style={styles.vs}>VS</Text>
        </View>
        <GameCard entry={b} onPress={() => !comparing && pick(b, a)} disabled={comparing} />
      </View>

      <Text style={styles.hint}>Tap the game you enjoyed more</Text>
    </View>
  )
}

function GameCard({
  entry,
  onPress,
  disabled,
}: {
  entry: RankEntry
  onPress: () => void
  disabled: boolean
}) {
  const g = entry.game
  return (
    <TouchableOpacity
      style={[styles.card, disabled && styles.cardDisabled]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <Text style={styles.cardLeague}>{g.league}</Text>
      <Text style={styles.cardTeam}>{g.home_team}</Text>
      <Text style={styles.cardVs}>vs</Text>
      <Text style={styles.cardTeam}>{g.away_team}</Text>
      <View style={styles.cardScoreRow}>
        <Text style={styles.cardScore}>{Math.round(entry.score)} pts</Text>
      </View>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0f' },
  center: {
    flex: 1,
    backgroundColor: '#0a0a0f',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 10,
  },
  needMoreIcon: { fontSize: 52, marginBottom: 8 },
  needMoreTitle: { fontSize: 20, fontWeight: '700', color: '#fff' },
  needMoreSub: { fontSize: 14, color: '#555', textAlign: 'center' },
  backBtn: {
    marginTop: 20,
    borderWidth: 1,
    borderColor: '#1e1e38',
    borderRadius: 14,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  backBtnText: { color: '#888', fontSize: 15 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 12,
  },
  back: { color: '#666', fontSize: 15 },
  headerCenter: { alignItems: 'center' },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#fff' },
  doneCount: { fontSize: 12, color: '#e94560', marginTop: 2, fontWeight: '600' },
  skipLink: { color: '#444', fontSize: 15 },
  arena: {
    flex: 1,
    paddingHorizontal: 16,
    paddingBottom: 20,
    gap: 0,
    justifyContent: 'center',
  },
  card: {
    flex: 1,
    backgroundColor: '#111120',
    borderRadius: 22,
    padding: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#1e1e38',
    gap: 4,
    marginVertical: 6,
  },
  cardDisabled: { opacity: 0.6 },
  cardLeague: {
    fontSize: 11,
    color: '#555',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  cardTeam: { fontSize: 24, fontWeight: '800', color: '#fff', textAlign: 'center' },
  cardVs: { fontSize: 13, color: '#333', fontWeight: '600', marginVertical: 2 },
  cardScoreRow: {
    marginTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#1e1e38',
    paddingTop: 10,
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  cardScore: { fontSize: 13, color: '#444', fontWeight: '600' },
  vsContainer: {
    alignItems: 'center',
    zIndex: 10,
  },
  vs: {
    fontSize: 14,
    fontWeight: '900',
    color: '#333',
    letterSpacing: 3,
    backgroundColor: '#0a0a0f',
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  hint: {
    textAlign: 'center',
    color: '#333',
    fontSize: 13,
    paddingBottom: 30,
  },
})
