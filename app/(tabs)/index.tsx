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
import { useSupabase } from '../../lib/useSupabase'
import type { Log } from '../../lib/types'

const WATCHED_VIA_LABELS: Record<string, string> = {
  live: '📺 Live TV',
  venue: '🏟️ At the venue',
  replay: '⏪ Replay',
  highlights: '✂️ Highlights',
  bar: '🍺 At a bar',
}

export default function Logbook() {
  const supabase = useSupabase()
  const [logs, setLogs] = useState<Log[]>([])
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

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Logbook</Text>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => router.push('/log-game')}
        >
          <Text style={styles.addBtnText}>+ Log Game</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={logs}
        keyExtractor={item => item.id}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={fetchLogs}
            tintColor="#e94560"
          />
        }
        contentContainerStyle={logs.length === 0 ? styles.emptyWrap : styles.list}
        ListEmptyComponent={
          !loading ? <EmptyState /> : null
        }
        renderItem={({ item }) => <LogCard log={item} />}
      />
    </View>
  )
}

function LogCard({ log }: { log: Log }) {
  const g = log.game
  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View style={styles.cardInfo}>
          <Text style={styles.matchup} numberOfLines={1}>
            {g.home_team} vs {g.away_team}
          </Text>
          <Text style={styles.meta}>
            {g.league}
            {g.starts_at ? ` · ${formatDate(g.starts_at)}` : ''}
          </Text>
        </View>
        {log.reaction ? (
          <Text style={styles.reaction}>{log.reaction}</Text>
        ) : null}
      </View>

      {log.review ? (
        <Text style={styles.review} numberOfLines={3}>{log.review}</Text>
      ) : null}

      <View style={styles.cardBottom}>
        {log.watched_via ? (
          <Text style={styles.watchedVia}>
            {WATCHED_VIA_LABELS[log.watched_via] ?? log.watched_via}
          </Text>
        ) : null}
        {log.spoiler_free ? (
          <View style={styles.spoilerBadge}>
            <Text style={styles.spoilerText}>No spoilers</Text>
          </View>
        ) : null}
      </View>
    </View>
  )
}

function EmptyState() {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyIcon}>🏟️</Text>
      <Text style={styles.emptyTitle}>No games logged yet</Text>
      <Text style={styles.emptySub}>Start tracking the games you watch</Text>
      <TouchableOpacity
        style={styles.emptyBtn}
        onPress={() => router.push('/log-game')}
      >
        <Text style={styles.emptyBtnText}>Log Your First Game</Text>
      </TouchableOpacity>
    </View>
  )
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
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
  addBtn: {
    backgroundColor: '#e94560',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  list: { paddingHorizontal: 16, paddingBottom: 110 },
  emptyWrap: { flex: 1 },
  card: {
    backgroundColor: '#111120',
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#1e1e38',
    gap: 8,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  cardInfo: { flex: 1, marginRight: 8 },
  matchup: { fontSize: 17, fontWeight: '700', color: '#fff' },
  meta: { fontSize: 12, color: '#555', marginTop: 3 },
  reaction: { fontSize: 26 },
  review: { fontSize: 14, color: '#aaa', lineHeight: 21 },
  cardBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  watchedVia: { fontSize: 12, color: '#555' },
  spoilerBadge: {
    borderWidth: 1,
    borderColor: '#e94560',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  spoilerText: { fontSize: 11, color: '#e94560', fontWeight: '600' },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    marginTop: 60,
    gap: 8,
  },
  emptyIcon: { fontSize: 52, marginBottom: 8 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: '#fff' },
  emptySub: { fontSize: 14, color: '#555', textAlign: 'center' },
  emptyBtn: {
    backgroundColor: '#e94560',
    borderRadius: 14,
    paddingHorizontal: 24,
    paddingVertical: 13,
    marginTop: 20,
  },
  emptyBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
})
