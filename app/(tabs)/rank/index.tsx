import { useCallback, useEffect, useState } from 'react'
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { router } from 'expo-router'
import { useSupabase } from '../../../lib/useSupabase'
import type { RankEntry } from '../../../lib/types'

export default function Rankings() {
  const supabase = useSupabase()
  const [ranks, setRanks] = useState<RankEntry[]>([])
  const [loading, setLoading] = useState(true)

  const fetchRanks = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('ranks')
      .select('*, game:games(id, home_team, away_team, league, starts_at)')
      .order('score', { ascending: false })
    setRanks((data as RankEntry[]) ?? [])
    setLoading(false)
  }, [supabase])

  useEffect(() => { fetchRanks() }, [fetchRanks])

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Rankings</Text>
          {ranks.length > 0 && (
            <Text style={styles.subtitle}>{ranks.length} game{ranks.length !== 1 ? 's' : ''} ranked</Text>
          )}
        </View>
        {ranks.length >= 2 && (
          <TouchableOpacity
            style={styles.compareBtn}
            onPress={() => router.push('/(tabs)/rank/compare')}
          >
            <Text style={styles.compareBtnText}>⚡ Compare</Text>
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={ranks}
        keyExtractor={item => item.id}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={fetchRanks}
            tintColor="#e94560"
          />
        }
        contentContainerStyle={ranks.length === 0 ? styles.emptyWrap : styles.list}
        ListEmptyComponent={!loading ? <EmptyState /> : null}
        renderItem={({ item, index }) => (
          <RankRow entry={item} position={index + 1} />
        )}
      />
    </View>
  )
}

function RankRow({ entry, position }: { entry: RankEntry; position: number }) {
  const g = entry.game
  const isTop3 = position <= 3
  const medal = position === 1 ? '🥇' : position === 2 ? '🥈' : position === 3 ? '🥉' : null

  return (
    <View style={[styles.row, isTop3 && styles.rowHighlight]}>
      <View style={styles.positionWrap}>
        {medal ? (
          <Text style={styles.medal}>{medal}</Text>
        ) : (
          <Text style={styles.position}>{position}</Text>
        )}
      </View>

      <View style={styles.gameInfo}>
        <Text style={styles.matchup} numberOfLines={1}>
          {g.home_team} vs {g.away_team}
        </Text>
        <Text style={styles.league}>{g.league}</Text>
      </View>

      <View style={styles.scoreWrap}>
        <Text style={[styles.score, isTop3 && styles.scoreTop]}>{Math.round(entry.score)}</Text>
        <Text style={styles.scoreLabel}>pts</Text>
      </View>
    </View>
  )
}

function EmptyState() {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyIcon}>🏆</Text>
      <Text style={styles.emptyTitle}>No rankings yet</Text>
      <Text style={styles.emptySub}>
        Log games to build your all-time ranking. Once you have two or more, use Compare to rank them against each other.
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0f' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
  },
  title: { fontSize: 30, fontWeight: '800', color: '#fff', letterSpacing: -0.5 },
  subtitle: { fontSize: 13, color: '#555', marginTop: 2 },
  compareBtn: {
    borderWidth: 1,
    borderColor: '#e94560',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  compareBtnText: { color: '#e94560', fontWeight: '700', fontSize: 14 },
  list: { paddingHorizontal: 16, paddingBottom: 110 },
  emptyWrap: { flex: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111120',
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#1e1e38',
  },
  rowHighlight: { borderColor: '#2a1a30' },
  positionWrap: { width: 38, alignItems: 'center' },
  position: { fontSize: 17, fontWeight: '800', color: '#333' },
  medal: { fontSize: 22 },
  gameInfo: { flex: 1, marginHorizontal: 12 },
  matchup: { fontSize: 15, fontWeight: '700', color: '#fff' },
  league: { fontSize: 12, color: '#555', marginTop: 2 },
  scoreWrap: { alignItems: 'flex-end' },
  score: { fontSize: 16, fontWeight: '800', color: '#555', fontVariant: ['tabular-nums'] },
  scoreTop: { color: '#e94560' },
  scoreLabel: { fontSize: 10, color: '#333', fontWeight: '600' },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    marginTop: 60,
    gap: 10,
  },
  emptyIcon: { fontSize: 52, marginBottom: 8 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: '#fff' },
  emptySub: { fontSize: 14, color: '#555', textAlign: 'center', lineHeight: 22 },
})
