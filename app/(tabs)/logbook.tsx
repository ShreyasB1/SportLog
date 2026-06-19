import { useCallback, useEffect, useState } from 'react'
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useSupabase } from '../../lib/useSupabase'
import type { Log } from '../../lib/types'

const WATCHED_VIA_LABELS: Record<string, string> = {
  live:       '📺 Live TV',
  venue:      '🏟️ Venue',
  replay:     '⏪ Replay',
  highlights: '✂️ Highlights',
  bar:        '🍺 Bar',
}

export default function Logbook() {
  const supabase = useSupabase()
  const [logs,    setLogs]    = useState<Log[]>([])
  const [loading, setLoading] = useState(true)

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('logs')
      .select('*, game:games(*)')
      .order('created_at', { ascending: false })
    setLogs((data as Log[]) ?? [])
    setLoading(false)
  }, [supabase])

  useEffect(() => { fetchLogs() }, [fetchLogs])

  // Compute a short stat line for the header
  const leagues = new Set(logs.map(l => l.game?.league).filter(Boolean))

  return (
    <View style={styles.container}>
      <FlatList
        data={logs}
        keyExtractor={item => item.id}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={fetchLogs} tintColor="#e94560" />
        }
        contentContainerStyle={[
          styles.list,
          logs.length === 0 && styles.listEmpty,
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
            {logs.length > 0 && (
              <View style={styles.statsRow}>
                <StatChip icon="film-outline" value={`${logs.length}`} label="games" />
                <StatChip icon="trophy-outline" value={`${leagues.size}`} label="leagues" />
              </View>
            )}
          </View>
        }
        ListEmptyComponent={
          !loading ? (
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
          ) : null
        }
        renderItem={({ item }) => <LogCard log={item} />}
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
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
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
