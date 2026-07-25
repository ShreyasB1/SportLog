import { router, useLocalSearchParams } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import {
  FlatList,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useUser } from '../../lib/useSession'
import { useSupabase } from '../../lib/useSupabase'
import { computePickRecord, type PickRecord } from '../../lib/points'
import type { Log, Profile } from '../../lib/types'

export default function UserProfile() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const supabase = useSupabase()
  const me = useUser()

  const [profile, setProfile] = useState<Profile | null>(null)
  const [isFollowing, setIsFollowing] = useState(false)
  const [followBusy, setFollowBusy] = useState(false)
  const [logs, setLogs] = useState<Log[]>([])
  const [record, setRecord] = useState<PickRecord | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchAll = useCallback(async () => {
    if (!id || !me) return
    setLoading(true)
    const [profileRes, followRes, logsRes, picksRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', id).single(),
      supabase
        .from('friendships')
        .select('id')
        .eq('requester_id', me.id)
        .eq('addressee_id', id)
        .limit(1),
      // RLS only returns their logs if an accepted friendship exists
      supabase
        .from('logs')
        .select('*, game:games(*)')
        .eq('user_id', id)
        .order('created_at', { ascending: false })
        .limit(30),
      supabase
        .from('picks')
        .select('picked_team, game:games(home_team, away_team, home_score, away_score, status)')
        .eq('user_id', id),
    ])
    setProfile((profileRes.data as Profile) ?? null)
    setIsFollowing(((followRes.data ?? []) as any[]).length > 0)
    setLogs((logsRes.data as Log[]) ?? [])
    setRecord(computePickRecord((picksRes.data ?? []) as any[]))
    setLoading(false)
  }, [supabase, id, me])

  useEffect(() => { fetchAll() }, [fetchAll])

  const toggleFollow = async () => {
    if (!me || !id || followBusy) return
    setFollowBusy(true)
    if (isFollowing) {
      await supabase
        .from('friendships')
        .delete()
        .eq('requester_id', me.id)
        .eq('addressee_id', id)
      setIsFollowing(false)
      setLogs([]) // their diary is friends-only
    } else {
      await supabase
        .from('friendships')
        .insert({ addressee_id: id, status: 'accepted' })
      setIsFollowing(true)
      fetchAll() // diary becomes visible
    }
    setFollowBusy(false)
  }

  const name = profile?.display_name || profile?.username || '—'
  const initials = (name[0] ?? '?').toUpperCase()

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {profile ? `@${profile.username}` : ''}
        </Text>
        <View style={styles.backBtn} />
      </View>

      <FlatList
        data={logs}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View>
            <View style={styles.identity}>
              {profile?.avatar_url ? (
                <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
              ) : (
                <View style={styles.avatarFallback}>
                  <Text style={styles.avatarInitials}>{initials}</Text>
                </View>
              )}
              <Text style={styles.displayName}>{name}</Text>
              {profile?.favorite_team ? (
                <Text style={styles.favTeam}>🏟️ {profile.favorite_team}</Text>
              ) : null}
              {profile?.bio ? <Text style={styles.bio}>{profile.bio}</Text> : null}

              <TouchableOpacity
                style={[styles.followBtn, isFollowing && styles.followBtnActive]}
                onPress={toggleFollow}
                disabled={followBusy}
              >
                <Text style={[styles.followBtnText, isFollowing && styles.followBtnTextActive]}>
                  {followBusy ? '…' : isFollowing ? 'Following ✓' : 'Follow'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Pick record (visible to everyone) */}
            {record && (
              <View style={styles.statsRow}>
                <View style={styles.statBox}>
                  <Text style={styles.statNum}>{record.total}</Text>
                  <Text style={styles.statLabel}>Picks</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statNum}>{record.points}</Text>
                  <Text style={styles.statLabel}>Points</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statNum}>
                    {record.accuracy != null ? `${record.accuracy}%` : '—'}
                  </Text>
                  <Text style={styles.statLabel}>
                    {record.wins + record.losses > 0
                      ? `Accuracy (${record.wins}–${record.losses})`
                      : 'Accuracy'}
                  </Text>
                </View>
              </View>
            )}

            {logs.length > 0 && (
              <Text style={styles.sectionTitle}>Logbook</Text>
            )}
          </View>
        }
        ListEmptyComponent={
          !loading ? (
            <View style={styles.emptyWrap}>
              {isFollowing ? (
                <Text style={styles.emptyText}>No games logged yet</Text>
              ) : (
                <>
                  <Ionicons name="lock-closed-outline" size={22} color="#3a3a5a" />
                  <Text style={styles.emptyText}>
                    Follow {profile?.username ? `@${profile.username}` : 'them'} to see their logbook
                  </Text>
                </>
              )}
            </View>
          ) : null
        }
        renderItem={({ item }) => {
          const g = item.game
          return (
            <View style={styles.logCard}>
              <View style={styles.logTopRow}>
                <View style={styles.leaguePill}>
                  <Text style={styles.leaguePillText}>{g?.league}</Text>
                </View>
                {item.reaction ? <Text style={styles.reaction}>{item.reaction}</Text> : null}
              </View>
              <Text style={styles.matchup}>{g?.home_team} vs {g?.away_team}</Text>
              {g?.home_score != null && (
                <Text style={styles.score}>{g.home_score} – {g.away_score}</Text>
              )}
              {item.review ? (
                <Text style={styles.review} numberOfLines={3}>{item.review}</Text>
              ) : null}
              <Text style={styles.dateText}>
                {new Date(item.created_at).toLocaleDateString('en-US', {
                  month: 'short', day: 'numeric', year: 'numeric',
                })}
              </Text>
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
    paddingTop: 60, paddingHorizontal: 12, paddingBottom: 6,
  },
  backBtn: { width: 40, alignItems: 'center' },
  headerTitle: { flex: 1, fontSize: 15, fontWeight: '700', color: '#555', textAlign: 'center' },
  list: { paddingBottom: 60 },

  identity: { alignItems: 'center', paddingVertical: 16, gap: 4, paddingHorizontal: 24 },
  avatar: { width: 84, height: 84, borderRadius: 42, marginBottom: 8 },
  avatarFallback: {
    width: 84, height: 84, borderRadius: 42, backgroundColor: '#e94560',
    alignItems: 'center', justifyContent: 'center', marginBottom: 8,
  },
  avatarInitials: { fontSize: 32, fontWeight: '800', color: '#fff' },
  displayName: { fontSize: 24, fontWeight: '800', color: '#fff', letterSpacing: -0.5 },
  favTeam: { fontSize: 13, color: '#888', marginTop: 2 },
  bio: { fontSize: 14, color: '#aaa', textAlign: 'center', lineHeight: 21, marginTop: 6 },
  followBtn: {
    marginTop: 14, backgroundColor: '#e94560', borderRadius: 12,
    paddingHorizontal: 36, paddingVertical: 11,
  },
  followBtnActive: {
    backgroundColor: 'transparent', borderWidth: 1, borderColor: '#e94560',
  },
  followBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  followBtnTextActive: { color: '#e94560' },

  statsRow: { flexDirection: 'row', marginHorizontal: 16, marginTop: 8, gap: 10 },
  statBox: {
    flex: 1, backgroundColor: '#111120', borderRadius: 14, padding: 14,
    alignItems: 'center', borderWidth: 1, borderColor: '#1e1e38', gap: 3,
  },
  statNum: { fontSize: 22, fontWeight: '800', color: '#fff' },
  statLabel: { fontSize: 11, color: '#555', fontWeight: '600', textAlign: 'center' },

  sectionTitle: {
    fontSize: 18, fontWeight: '800', color: '#fff',
    paddingHorizontal: 20, paddingTop: 22, paddingBottom: 10,
  },
  emptyWrap: { alignItems: 'center', gap: 8, marginTop: 32, paddingHorizontal: 32 },
  emptyText: { color: '#444', fontSize: 14, textAlign: 'center' },

  logCard: {
    backgroundColor: '#111120', borderRadius: 18,
    paddingHorizontal: 16, paddingVertical: 13,
    marginHorizontal: 16, marginBottom: 10,
    borderWidth: 1, borderColor: '#1e1e38', gap: 6,
  },
  logTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  leaguePill: { backgroundColor: '#1e1e38', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  leaguePillText: {
    fontSize: 10, fontWeight: '700', color: '#888',
    textTransform: 'uppercase', letterSpacing: 0.8,
  },
  reaction: { fontSize: 20 },
  matchup: { fontSize: 16, fontWeight: '800', color: '#fff' },
  score: { fontSize: 14, fontWeight: '700', color: '#666' },
  review: { fontSize: 13, color: '#999', lineHeight: 20 },
  dateText: { fontSize: 11, color: '#444', marginTop: 2 },
})
