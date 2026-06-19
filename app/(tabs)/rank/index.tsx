import { useCallback, useEffect, useState } from 'react'
import {
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useSupabase } from '../../../lib/useSupabase'
import type { RankEntry, Watchlist } from '../../../lib/types'

export default function Rankings() {
  const supabase = useSupabase()
  const [ranks,       setRanks]       = useState<RankEntry[]>([])
  const [watchlist,   setWatchlist]   = useState<Watchlist[]>([])
  const [loading,     setLoading]     = useState(true)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [ranksRes, watchlistRes] = await Promise.all([
      supabase
        .from('ranks')
        .select('*, game:games(id, home_team, away_team, league, starts_at, home_score, away_score)')
        .order('score', { ascending: false }),
      supabase
        .from('watchlist')
        .select('*, game:games(*)')
        .order('created_at', { ascending: false }),
    ])
    setRanks((ranksRes.data as RankEntry[]) ?? [])
    setWatchlist((watchlistRes.data as Watchlist[]) ?? [])
    setLoading(false)
  }, [supabase])

  useEffect(() => { fetchAll() }, [fetchAll])

  const removeFromWatchlist = async (id: string) => {
    await supabase.from('watchlist').delete().eq('id', id)
    setWatchlist(prev => prev.filter(w => w.id !== id))
  }

  const minScore = ranks.length > 0 ? Math.min(...ranks.map(r => r.score)) : 1400
  const maxScore = ranks.length > 0 ? Math.max(...ranks.map(r => r.score)) : 1600
  const scoreRange = Math.max(maxScore - minScore, 1)

  return (
    <FlatList
      data={ranks}
      keyExtractor={item => item.id}
      style={styles.screen}
      refreshControl={
        <RefreshControl refreshing={loading} onRefresh={fetchAll} tintColor="#e94560" />
      }
      contentContainerStyle={[
        styles.list,
        ranks.length === 0 && styles.listEmpty,
      ]}
      ListHeaderComponent={
        <View>
          {/* ── Page header ── */}
          <View style={styles.pageHeader}>
            <Text style={styles.pageTitle}>Rankings</Text>
            {ranks.length >= 2 && (
              <TouchableOpacity
                style={styles.compareBtn}
                onPress={() => router.push('/log-game')}
              >
                <Ionicons name="git-compare-outline" size={15} color="#e94560" />
                <Text style={styles.compareBtnText}>Compare</Text>
              </TouchableOpacity>
            )}
          </View>

          {ranks.length > 0 && (
            <Text style={styles.rankCount}>
              {ranks.length} game{ranks.length !== 1 ? 's' : ''} ranked
            </Text>
          )}

          {/* ── Watchlist ── */}
          {watchlist.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionRow}>
                <Text style={styles.sectionTitle}>Watchlist</Text>
                <TouchableOpacity onPress={() => router.push('/')}>
                  <Text style={styles.sectionLink}>+ Add more</Text>
                </TouchableOpacity>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.watchlistScroll}
              >
                {watchlist.map(item => (
                  <View key={item.id} style={styles.watchCard}>
                    <Text style={styles.watchLeague}>{item.game.league}</Text>
                    <Text style={styles.watchMatchup} numberOfLines={3}>
                      {item.game.home_team}{'\n'}vs {item.game.away_team}
                    </Text>
                    <Text style={styles.watchDate}>
                      {new Date(item.game.starts_at).toLocaleDateString('en-US', {
                        month: 'short', day: 'numeric',
                      })}
                    </Text>
                    <TouchableOpacity
                      style={styles.watchRemoveBtn}
                      onPress={() => removeFromWatchlist(item.id)}
                    >
                      <Text style={styles.watchRemoveText}>Remove</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            </View>
          )}

          {/* ── My Rankings header ── */}
          {(ranks.length > 0 || !loading) && (
            <View style={styles.sectionRow}>
              <Text style={styles.sectionTitle}>My Rankings</Text>
            </View>
          )}
        </View>
      }
      ListEmptyComponent={
        !loading ? (
          <View style={styles.empty}>
            <View style={styles.emptyIconWrap}>
              <Text style={styles.emptyIcon}>🏆</Text>
            </View>
            <Text style={styles.emptyTitle}>No rankings yet</Text>
            <Text style={styles.emptySub}>
              Log a game and rate it to start building your all-time ranking
            </Text>
            <TouchableOpacity
              style={styles.emptyBtn}
              onPress={() => router.push('/log-game')}
            >
              <Ionicons name="add" size={16} color="#fff" />
              <Text style={styles.emptyBtnText}>Log a Game</Text>
            </TouchableOpacity>
          </View>
        ) : null
      }
      renderItem={({ item, index }) => (
        <RankCard
          entry={item}
          position={index + 1}
          barWidth={(item.score - minScore) / scoreRange}
        />
      )}
    />
  )
}

function RankCard({
  entry,
  position,
  barWidth,
}: {
  entry: RankEntry
  position: number
  barWidth: number
}) {
  const g = entry.game
  const medal =
    position === 1 ? '🥇' :
    position === 2 ? '🥈' :
    position === 3 ? '🥉' : null
  const isTop = position <= 3

  return (
    <View style={[styles.rankCard, isTop && styles.rankCardTop]}>
      {/* Position */}
      <View style={styles.posWrap}>
        {medal ? (
          <Text style={styles.medal}>{medal}</Text>
        ) : (
          <Text style={styles.posNum}>{position}</Text>
        )}
      </View>

      {/* Game info */}
      <View style={styles.rankInfo}>
        <Text style={styles.rankMatchup} numberOfLines={1}>
          {g.home_team} vs {g.away_team}
        </Text>
        <Text style={styles.rankMeta}>
          {g.league}
          {g.home_score != null ? `  ·  ${g.home_score}–${g.away_score}` : ''}
        </Text>

        {/* Score bar */}
        <View style={styles.barTrack}>
          <View style={[styles.barFill, { width: `${Math.max(barWidth * 100, 4)}%` as any }]} />
        </View>
      </View>

      {/* Score */}
      <View style={styles.scoreWrap}>
        <Text style={[styles.scoreNum, isTop && styles.scoreNumTop]}>
          {Math.round(entry.score)}
        </Text>
        <Text style={styles.scorePts}>pts</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0a0a0f' },
  list: { paddingBottom: 110 },
  listEmpty: { flexGrow: 1 },

  // Header
  pageHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 60, paddingBottom: 4,
  },
  pageTitle: { fontSize: 30, fontWeight: '800', color: '#fff', letterSpacing: -0.5 },
  compareBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#1a0a10', borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 8,
    borderWidth: 1, borderColor: '#2a0e1a',
  },
  compareBtnText: { color: '#e94560', fontWeight: '700', fontSize: 13 },
  rankCount: { fontSize: 13, color: '#444', paddingHorizontal: 20, marginBottom: 4 },

  // Section
  section: { marginBottom: 4 },
  sectionRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 10,
  },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: '#fff' },
  sectionLink: { fontSize: 13, color: '#e94560', fontWeight: '600' },

  // Watchlist
  watchlistScroll: { paddingHorizontal: 16, paddingBottom: 12, gap: 10 },
  watchCard: {
    width: 140, backgroundColor: '#111120', borderRadius: 16,
    padding: 14, borderWidth: 1, borderColor: '#1e1e38', gap: 4,
  },
  watchLeague: {
    fontSize: 9, color: '#e94560', fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: 0.8,
  },
  watchMatchup: { fontSize: 13, fontWeight: '700', color: '#fff', lineHeight: 18, marginTop: 2 },
  watchDate: { fontSize: 11, color: '#444', marginTop: 2 },
  watchRemoveBtn: { marginTop: 6 },
  watchRemoveText: { fontSize: 11, color: '#555', fontWeight: '600' },

  // Rank cards
  rankCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#111120', borderRadius: 18,
    padding: 14, marginBottom: 8,
    marginHorizontal: 16, borderWidth: 1, borderColor: '#1e1e38',
  },
  rankCardTop: { borderColor: '#1e1030' },
  posWrap: { width: 40, alignItems: 'center', marginRight: 4 },
  medal: { fontSize: 24 },
  posNum: { fontSize: 16, fontWeight: '800', color: '#333' },
  rankInfo: { flex: 1, marginRight: 12 },
  rankMatchup: { fontSize: 15, fontWeight: '700', color: '#fff' },
  rankMeta: { fontSize: 12, color: '#444', marginTop: 2, marginBottom: 8 },
  barTrack: {
    height: 4, backgroundColor: '#1e1e38', borderRadius: 2, overflow: 'hidden',
  },
  barFill: {
    height: 4, backgroundColor: '#e94560', borderRadius: 2,
  },
  scoreWrap: { alignItems: 'flex-end', minWidth: 44 },
  scoreNum: { fontSize: 17, fontWeight: '800', color: '#444', fontVariant: ['tabular-nums'] },
  scoreNumTop: { color: '#e94560' },
  scorePts: { fontSize: 10, color: '#333', fontWeight: '600', marginTop: 1 },

  // Empty
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
  emptySub: {
    fontSize: 14, color: '#555', textAlign: 'center',
    lineHeight: 22, marginTop: 8,
  },
  emptyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#e94560', borderRadius: 14,
    paddingHorizontal: 24, paddingVertical: 13, marginTop: 24,
  },
  emptyBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
})
