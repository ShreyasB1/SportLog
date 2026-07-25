import { router } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import {
  FlatList,
  Image,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useUser } from '../lib/useSession'
import { useSupabase } from '../lib/useSupabase'
import { computePickRecord, type PickRecord } from '../lib/points'
import type { Profile } from '../lib/types'

interface Entry {
  profile: Profile
  record: PickRecord
  isMe: boolean
}

const MEDALS = ['🥇', '🥈', '🥉']

export default function Leaderboard() {
  const supabase = useSupabase()
  const me = useUser()
  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)

  const fetchAll = useCallback(async () => {
    if (!me) return
    setLoading(true)

    // Friends = anyone connected by an accepted follow, either direction
    const { data: friendRows } = await supabase
      .from('friendships')
      .select('requester_id, addressee_id')
      .eq('status', 'accepted')
      .or(`requester_id.eq.${me.id},addressee_id.eq.${me.id}`)
    const friendIds = new Set<string>()
    for (const f of (friendRows ?? []) as any[]) {
      friendIds.add(f.requester_id === me.id ? f.addressee_id : f.requester_id)
    }
    const ids = [me.id, ...friendIds]

    const [profilesRes, picksRes] = await Promise.all([
      supabase.from('profiles').select('*').in('id', ids),
      supabase
        .from('picks')
        .select('user_id, picked_team, game:games(home_team, away_team, home_score, away_score, status)')
        .in('user_id', ids),
    ])

    const picksByUser = new Map<string, any[]>()
    for (const p of (picksRes.data ?? []) as any[]) {
      const arr = picksByUser.get(p.user_id) ?? []
      arr.push(p)
      picksByUser.set(p.user_id, arr)
    }

    const ranked: Entry[] = (((profilesRes.data ?? []) as Profile[]))
      .map(profile => ({
        profile,
        record: computePickRecord(picksByUser.get(profile.id) ?? []),
        isMe: profile.id === me.id,
      }))
      .sort(
        (a, b) =>
          b.record.points - a.record.points ||
          (b.record.accuracy ?? -1) - (a.record.accuracy ?? -1) ||
          b.record.total - a.record.total
      )
    setEntries(ranked)
    setLoading(false)
  }, [supabase, me])

  useEffect(() => { fetchAll() }, [fetchAll])

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.title}>Friends Leaderboard</Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.push('/search-users')}>
          <Ionicons name="person-add-outline" size={20} color="#e94560" />
        </TouchableOpacity>
      </View>
      <Text style={styles.subtitle}>10 points per correct pick — swipe on Picks to score</Text>

      <FlatList
        data={entries}
        keyExtractor={item => item.profile.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={fetchAll} tintColor="#e94560" />
        }
        ListEmptyComponent={
          !loading ? (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyIcon}>🏆</Text>
              <Text style={styles.emptyText}>
                Follow friends to compete on pick accuracy
              </Text>
              <TouchableOpacity
                style={styles.findBtn}
                onPress={() => router.push('/search-users')}
              >
                <Text style={styles.findBtnText}>Find Friends</Text>
              </TouchableOpacity>
            </View>
          ) : null
        }
        renderItem={({ item, index }) => {
          const name = item.profile.display_name ?? item.profile.username
          const initials = (name[0] ?? '?').toUpperCase()
          return (
            <TouchableOpacity
              style={[styles.row, item.isMe && styles.rowMe]}
              disabled={item.isMe}
              onPress={() =>
                router.push({ pathname: '/user/[id]', params: { id: item.profile.id } })
              }
            >
              <Text style={styles.rank}>
                {index < 3 ? MEDALS[index] : `${index + 1}`}
              </Text>
              {item.profile.avatar_url ? (
                <Image source={{ uri: item.profile.avatar_url }} style={styles.rowAvatar} />
              ) : (
                <View style={styles.rowAvatarFallback}>
                  <Text style={styles.rowInitials}>{initials}</Text>
                </View>
              )}
              <View style={styles.rowInfo}>
                <Text style={styles.rowName} numberOfLines={1}>
                  {name}{item.isMe ? ' (you)' : ''}
                </Text>
                <Text style={styles.rowRecord}>
                  {item.record.wins}–{item.record.losses}
                  {item.record.accuracy != null ? ` · ${item.record.accuracy}%` : ''}
                  {item.record.pending > 0 ? ` · ${item.record.pending} pending` : ''}
                </Text>
              </View>
              <View style={styles.pointsWrap}>
                <Text style={styles.points}>{item.record.points}</Text>
                <Text style={styles.pointsLabel}>pts</Text>
              </View>
            </TouchableOpacity>
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
    paddingTop: 60, paddingHorizontal: 12, paddingBottom: 2,
  },
  backBtn: { width: 40, alignItems: 'center' },
  title: { fontSize: 17, fontWeight: '800', color: '#fff' },
  subtitle: {
    fontSize: 12, color: '#444', textAlign: 'center',
    paddingHorizontal: 24, paddingBottom: 12,
  },
  list: { paddingBottom: 40 },
  emptyWrap: { alignItems: 'center', gap: 14, marginTop: 48, paddingHorizontal: 32 },
  emptyIcon: { fontSize: 44 },
  emptyText: { color: '#555', fontSize: 14, textAlign: 'center' },
  findBtn: {
    backgroundColor: '#e94560', borderRadius: 12,
    paddingHorizontal: 24, paddingVertical: 11,
  },
  findBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#111120', borderRadius: 16,
    borderWidth: 1, borderColor: '#1e1e38',
    paddingHorizontal: 14, paddingVertical: 12,
    marginHorizontal: 16, marginBottom: 8,
  },
  rowMe: { borderColor: '#e94560' },
  rank: { width: 30, fontSize: 16, fontWeight: '800', color: '#888', textAlign: 'center' },
  rowAvatar: { width: 40, height: 40, borderRadius: 20 },
  rowAvatarFallback: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: '#e94560',
    alignItems: 'center', justifyContent: 'center',
  },
  rowInitials: { color: '#fff', fontSize: 15, fontWeight: '700' },
  rowInfo: { flex: 1 },
  rowName: { color: '#fff', fontSize: 15, fontWeight: '700' },
  rowRecord: { color: '#555', fontSize: 12, marginTop: 1 },
  pointsWrap: { alignItems: 'center' },
  points: { color: '#e94560', fontSize: 20, fontWeight: '800' },
  pointsLabel: { color: '#555', fontSize: 10, fontWeight: '600' },
})
