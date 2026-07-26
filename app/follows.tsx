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
import { useUser } from '../lib/useSession'
import { useSupabase } from '../lib/useSupabase'
import { removeFollower, unfollowUser } from '../lib/social'
import type { Profile } from '../lib/types'

export default function Follows() {
  const params = useLocalSearchParams<{ tab?: string }>()
  const supabase = useSupabase()
  const me = useUser()

  const [tab, setTab] = useState<'followers' | 'following'>(
    params.tab === 'followers' ? 'followers' : 'following'
  )
  const [followers, setFollowers] = useState<Profile[]>([])
  const [following, setFollowing] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)

  const fetchAll = useCallback(async () => {
    if (!me) return
    setLoading(true)
    // friendships has no FK into profiles, so join manually in two steps
    const [followersRes, followingRes] = await Promise.all([
      supabase
        .from('friendships')
        .select('requester_id')
        .eq('addressee_id', me.id)
        .eq('status', 'accepted'),
      supabase
        .from('friendships')
        .select('addressee_id')
        .eq('requester_id', me.id)
        .eq('status', 'accepted'),
    ])
    const followerIds = ((followersRes.data ?? []) as any[]).map(f => f.requester_id)
    const followingIds = ((followingRes.data ?? []) as any[]).map(f => f.addressee_id)
    const allIds = [...new Set([...followerIds, ...followingIds])]
    let profiles: Profile[] = []
    if (allIds.length > 0) {
      const { data } = await supabase.from('profiles').select('*').in('id', allIds)
      profiles = (data as Profile[]) ?? []
    }
    const byId = new Map(profiles.map(p => [p.id, p]))
    setFollowers(followerIds.map(id => byId.get(id)).filter(Boolean) as Profile[])
    setFollowing(followingIds.map(id => byId.get(id)).filter(Boolean) as Profile[])
    setLoading(false)
  }, [supabase, me])

  useEffect(() => { fetchAll() }, [fetchAll])

  const confirmRemoveFollower = (person: Profile) => {
    if (!me) return
    Alert.alert(
      'Remove follower?',
      `@${person.username} will no longer be able to see your logbook. They are not notified, and can follow you again unless you block them.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            const { error } = await removeFollower(supabase, me.id, person.id)
            if (error) return Alert.alert('Error', error)
            setFollowers(prev => prev.filter(p => p.id !== person.id))
          },
        },
      ],
    )
  }

  const confirmUnfollow = (person: Profile) => {
    if (!me) return
    Alert.alert(
      `Unfollow @${person.username}?`,
      'You will stop seeing their logbook.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unfollow',
          style: 'destructive',
          onPress: async () => {
            const { error } = await unfollowUser(supabase, me.id, person.id)
            if (error) return Alert.alert('Error', error)
            setFollowing(prev => prev.filter(p => p.id !== person.id))
          },
        },
      ],
    )
  }

  const data = tab === 'followers' ? followers : following

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.title}>Friends</Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.push('/search-users')}>
          <Ionicons name="person-add-outline" size={20} color="#e94560" />
        </TouchableOpacity>
      </View>

      <View style={styles.segment}>
        <TouchableOpacity
          style={[styles.segmentBtn, tab === 'followers' && styles.segmentBtnActive]}
          onPress={() => setTab('followers')}
        >
          <Text style={[styles.segmentText, tab === 'followers' && styles.segmentTextActive]}>
            Followers ({followers.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.segmentBtn, tab === 'following' && styles.segmentBtnActive]}
          onPress={() => setTab('following')}
        >
          <Text style={[styles.segmentText, tab === 'following' && styles.segmentTextActive]}>
            Following ({following.length})
          </Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={data}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyText}>
                {tab === 'followers'
                  ? 'No followers yet — share your profile!'
                  : "You aren't following anyone yet"}
              </Text>
              {tab === 'following' && (
                <TouchableOpacity
                  style={styles.findBtn}
                  onPress={() => router.push('/search-users')}
                >
                  <Text style={styles.findBtnText}>Find Friends</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : null
        }
        renderItem={({ item }) => {
          const name = item.display_name ?? item.username
          const initials = (name[0] ?? '?').toUpperCase()
          return (
            <TouchableOpacity
              style={styles.row}
              onPress={() => router.push({ pathname: '/user/[id]', params: { id: item.id } })}
            >
              {item.avatar_url ? (
                <Image source={{ uri: item.avatar_url }} style={styles.rowAvatar} />
              ) : (
                <View style={styles.rowAvatarFallback}>
                  <Text style={styles.rowInitials}>{initials}</Text>
                </View>
              )}
              <View style={styles.rowInfo}>
                <Text style={styles.rowName} numberOfLines={1}>{name}</Text>
                <Text style={styles.rowUsername} numberOfLines={1}>@{item.username}</Text>
              </View>
              <TouchableOpacity
                style={styles.rowAction}
                onPress={() =>
                  tab === 'followers'
                    ? confirmRemoveFollower(item)
                    : confirmUnfollow(item)
                }
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.rowActionText}>
                  {tab === 'followers' ? 'Remove' : 'Unfollow'}
                </Text>
              </TouchableOpacity>
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
    paddingTop: 60, paddingHorizontal: 12, paddingBottom: 10,
  },
  backBtn: { width: 40, alignItems: 'center' },
  title: { fontSize: 17, fontWeight: '800', color: '#fff' },
  segment: {
    flexDirection: 'row', backgroundColor: '#111120',
    borderRadius: 12, borderWidth: 1, borderColor: '#1e1e38',
    padding: 3, marginHorizontal: 16, marginBottom: 12,
  },
  segmentBtn: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 9 },
  segmentBtnActive: { backgroundColor: '#e94560' },
  segmentText: { fontSize: 13, fontWeight: '700', color: '#666' },
  segmentTextActive: { color: '#fff' },
  list: { paddingBottom: 40 },
  emptyWrap: { alignItems: 'center', gap: 14, marginTop: 40, paddingHorizontal: 32 },
  emptyText: { color: '#444', fontSize: 14, textAlign: 'center' },
  findBtn: {
    backgroundColor: '#e94560', borderRadius: 12,
    paddingHorizontal: 24, paddingVertical: 11,
  },
  findBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 10,
  },
  rowAvatar: { width: 44, height: 44, borderRadius: 22 },
  rowAvatarFallback: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: '#e94560',
    alignItems: 'center', justifyContent: 'center',
  },
  rowInitials: { color: '#fff', fontSize: 17, fontWeight: '700' },
  rowInfo: { flex: 1 },
  rowName: { color: '#fff', fontSize: 15, fontWeight: '700' },
  rowUsername: { color: '#555', fontSize: 13, marginTop: 1 },
  rowAction: {
    borderWidth: 1, borderColor: '#2a2a45', borderRadius: 9,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  rowActionText: { color: '#999', fontSize: 12, fontWeight: '700' },
})
