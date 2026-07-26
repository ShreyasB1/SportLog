import { router, useLocalSearchParams } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import {
  Alert,
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
import {
  blockUser,
  isMuted,
  muteUser,
  removeFollower,
  unmuteUser,
} from '../../lib/social'
import type { Log, Profile } from '../../lib/types'

export default function UserProfile() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const supabase = useSupabase()
  const me = useUser()

  const [profile, setProfile] = useState<Profile | null>(null)
  const [isFollowing, setIsFollowing] = useState(false)
  const [followsMe, setFollowsMe] = useState(false)
  const [muted, setMuted] = useState(false)
  const [followBusy, setFollowBusy] = useState(false)
  const [logs, setLogs] = useState<Log[]>([])
  const [record, setRecord] = useState<PickRecord | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchAll = useCallback(async () => {
    if (!id || !me) return
    setLoading(true)
    const [profileRes, followRes, followerRes, logsRes, picksRes, mutedRes] =
      await Promise.all([
        supabase.from('profiles').select('*').eq('id', id).maybeSingle(),
        supabase
          .from('friendships')
          .select('id')
          .eq('requester_id', me.id)
          .eq('addressee_id', id)
          .limit(1),
        // Do they follow me? Determines whether "Remove follower" is offered.
        supabase
          .from('friendships')
          .select('id')
          .eq('requester_id', id)
          .eq('addressee_id', me.id)
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
        isMuted(supabase, me.id, id),
      ])
    setProfile((profileRes.data as Profile) ?? null)
    setIsFollowing(((followRes.data ?? []) as any[]).length > 0)
    setFollowsMe(((followerRes.data ?? []) as any[]).length > 0)
    setLogs((logsRes.data as Log[]) ?? [])
    setRecord(computePickRecord((picksRes.data ?? []) as any[]))
    setMuted(mutedRes)
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

  const handleToggleMute = async () => {
    if (!me || !id) return
    const fn = muted ? unmuteUser : muteUser
    const { error } = await fn(supabase, me.id, id)
    if (error) return Alert.alert('Error', error)
    setMuted(!muted)
  }

  const handleRemoveFollower = () => {
    if (!me || !id) return
    Alert.alert(
      'Remove follower?',
      `@${profile?.username ?? 'This account'} will no longer be able to see your logbook. They are not notified, and can follow you again unless you block them.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            const { error } = await removeFollower(supabase, me.id, id)
            if (error) return Alert.alert('Error', error)
            setFollowsMe(false)
          },
        },
      ],
    )
  }

  const handleBlock = () => {
    if (!me || !id) return
    Alert.alert(
      `Block @${profile?.username ?? ''}?`,
      'You will no longer see each other, and neither of you can follow the other. Any existing follow is removed. They are not notified.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block',
          style: 'destructive',
          onPress: async () => {
            const { error } = await blockUser(supabase, me.id, id)
            if (error) return Alert.alert('Error', error)
            // Their profile is hidden from us now, so this screen has nothing
            // left to show. Manage the block from Profile > Blocked accounts.
            router.back()
          },
        },
      ],
    )
  }

  const openActions = () => {
    if (!profile) return
    const buttons: Parameters<typeof Alert.alert>[2] = []
    if (followsMe) {
      buttons.push({ text: 'Remove follower', onPress: handleRemoveFollower })
    }
    buttons.push({
      text: muted ? 'Unmute' : 'Mute',
      onPress: handleToggleMute,
    })
    buttons.push({ text: 'Block', style: 'destructive', onPress: handleBlock })
    buttons.push({ text: 'Cancel', style: 'cancel' })
    Alert.alert(
      `@${profile.username}`,
      muted
        ? 'You have muted this account. They can still see and follow you.'
        : 'Muting hides someone from your leaderboard and suggestions. They are not told.',
      buttons,
    )
  }

  const name = profile?.display_name || profile?.username || '—'
  const initials = (name[0] ?? '?').toUpperCase()

  // Either the account is gone, or it has blocked us -- RLS hides the row
  // either way, and we deliberately do not distinguish the two.
  if (!loading && !profile) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle} />
          <View style={styles.backBtn} />
        </View>
        <View style={styles.emptyWrap}>
          <Ionicons name="person-remove-outline" size={26} color="#3a3a5a" />
          <Text style={styles.emptyText}>This account is unavailable.</Text>
        </View>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {profile ? `@${profile.username}` : ''}
        </Text>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={openActions}
          disabled={!profile}
          accessibilityLabel="More options"
        >
          <Ionicons
            name="ellipsis-horizontal"
            size={20}
            color={profile ? '#fff' : 'transparent'}
          />
        </TouchableOpacity>
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

              {muted && (
                <View style={styles.mutedPill}>
                  <Ionicons name="volume-mute-outline" size={12} color="#888" />
                  <Text style={styles.mutedPillText}>Muted</Text>
                </View>
              )}
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
  mutedPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 10,
    backgroundColor: '#111120', borderRadius: 8,
    borderWidth: 1, borderColor: '#1e1e38',
    paddingHorizontal: 10, paddingVertical: 5,
  },
  mutedPillText: { color: '#888', fontSize: 11, fontWeight: '700' },

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
