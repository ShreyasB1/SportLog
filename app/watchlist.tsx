import { router } from 'expo-router'
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
import { useSupabase } from '../lib/useSupabase'
import type { Watchlist as WatchlistItem } from '../lib/types'

export default function WatchlistScreen() {
  const supabase = useSupabase()
  const [items, setItems] = useState<WatchlistItem[]>([])
  const [loading, setLoading] = useState(true)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('watchlist')
      .select('*, game:games(*)')
      .order('created_at', { ascending: false })
    setItems((data as WatchlistItem[]) ?? [])
    setLoading(false)
  }, [supabase])

  useEffect(() => { fetchAll() }, [fetchAll])

  const remove = async (id: string) => {
    setItems(prev => prev.filter(i => i.id !== id))
    await supabase.from('watchlist').delete().eq('id', id)
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.title}>Watchlist</Text>
        <View style={styles.backBtn} />
      </View>

      <FlatList
        data={items}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={fetchAll} tintColor="#e94560" />
        }
        ListEmptyComponent={
          !loading ? (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyIcon}>👀</Text>
              <Text style={styles.emptyText}>
                Nothing saved — bookmark games from the Explore tab
              </Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => {
          const g = item.game
          const isFinal = g?.status === 'final'
          const isLive = g?.status === 'live'
          return (
            <View style={styles.card}>
              <View style={styles.cardInfo}>
                <View style={styles.topRow}>
                  <View style={styles.leaguePill}>
                    <Text style={styles.leaguePillText}>{g?.league}</Text>
                  </View>
                  {isLive && <View style={styles.liveDot} />}
                </View>
                <Text style={styles.matchup} numberOfLines={1}>
                  {g?.home_team} vs {g?.away_team}
                </Text>
                <Text style={styles.meta}>
                  {isFinal && g?.home_score != null
                    ? `Final · ${g.home_score} – ${g.away_score}`
                    : isLive
                      ? `Live · ${g?.home_score ?? 0} – ${g?.away_score ?? 0}`
                      : g
                        ? new Date(g.starts_at).toLocaleDateString('en-US', {
                            weekday: 'short', month: 'short', day: 'numeric',
                            hour: 'numeric', minute: '2-digit',
                          })
                        : ''}
                </Text>
              </View>
              <TouchableOpacity style={styles.removeBtn} onPress={() => remove(item.id)}>
                <Ionicons name="bookmark" size={18} color="#e94560" />
              </TouchableOpacity>
            </View>
          )
        }}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0f' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 60, paddingHorizontal: 12, paddingBottom: 10,
  },
  backBtn: { width: 40, alignItems: 'center' },
  title: { fontSize: 17, fontWeight: '800', color: '#fff' },
  list: { paddingBottom: 40 },
  emptyWrap: { alignItems: 'center', gap: 10, marginTop: 48, paddingHorizontal: 32 },
  emptyIcon: { fontSize: 40 },
  emptyText: { color: '#555', fontSize: 14, textAlign: 'center' },
  card: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#111120', borderRadius: 16,
    borderWidth: 1, borderColor: '#1e1e38',
    paddingHorizontal: 14, paddingVertical: 12,
    marginHorizontal: 16, marginBottom: 8,
  },
  cardInfo: { flex: 1, gap: 4 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  leaguePill: { backgroundColor: '#1e1e38', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  leaguePillText: {
    fontSize: 10, fontWeight: '700', color: '#888',
    textTransform: 'uppercase', letterSpacing: 0.8,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#e94560' },
  matchup: { fontSize: 15, fontWeight: '700', color: '#fff' },
  meta: { fontSize: 12, color: '#555' },
  removeBtn: { padding: 8 },
})
