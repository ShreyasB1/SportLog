import { router } from 'expo-router'
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
import {
  fetchBlockedProfiles,
  fetchMutedIds,
  unblockUser,
  unmuteUser,
  type BlockedProfile,
} from '../lib/social'
import type { Profile } from '../lib/types'

type Row = BlockedProfile

export default function BlockedAndMuted() {
  const supabase = useSupabase()
  const me = useUser()

  const [tab, setTab] = useState<'blocked' | 'muted'>('blocked')
  const [blocked, setBlocked] = useState<Row[]>([])
  const [muted, setMuted] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)

  const fetchAll = useCallback(async () => {
    if (!me) return
    setLoading(true)

    // Blocked accounts come from an RPC -- blocking hides the two profiles
    // from each other, so a plain profiles select would return nothing.
    const blockedRows = await fetchBlockedProfiles(supabase)

    // Muted accounts are not hidden, so they read from profiles normally.
    const mutedIds = [...(await fetchMutedIds(supabase, me.id))]
    let mutedRows: Row[] = []
    if (mutedIds.length > 0) {
      const { data } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url')
        .in('id', mutedIds)
      mutedRows = ((data ?? []) as Profile[]).map(p => ({
        id: p.id,
        username: p.username,
        display_name: p.display_name,
        avatar_url: p.avatar_url,
      }))
    }

    setBlocked(blockedRows)
    setMuted(mutedRows)
    setLoading(false)
  }, [supabase, me])

  useEffect(() => { fetchAll() }, [fetchAll])

  const confirmUnblock = (person: Row) => {
    if (!me) return
    Alert.alert(
      `Unblock @${person.username}?`,
      'They will be able to find and follow you again. Any follow removed when you blocked them is not restored.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unblock',
          onPress: async () => {
            const { error } = await unblockUser(supabase, me.id, person.id)
            if (error) return Alert.alert('Error', error)
            setBlocked(prev => prev.filter(p => p.id !== person.id))
          },
        },
      ],
    )
  }

  const handleUnmute = async (person: Row) => {
    if (!me) return
    const { error } = await unmuteUser(supabase, me.id, person.id)
    if (error) return Alert.alert('Error', error)
    setMuted(prev => prev.filter(p => p.id !== person.id))
  }

  const data = tab === 'blocked' ? blocked : muted

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.title}>Blocked & Muted</Text>
        <View style={styles.backBtn} />
      </View>

      <View style={styles.segment}>
        <TouchableOpacity
          style={[styles.segmentBtn, tab === 'blocked' && styles.segmentBtnActive]}
          onPress={() => setTab('blocked')}
        >
          <Text style={[styles.segmentText, tab === 'blocked' && styles.segmentTextActive]}>
            Blocked ({blocked.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.segmentBtn, tab === 'muted' && styles.segmentBtnActive]}
          onPress={() => setTab('muted')}
        >
          <Text style={[styles.segmentText, tab === 'muted' && styles.segmentTextActive]}>
            Muted ({muted.length})
          </Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.explainer}>
        {tab === 'blocked'
          ? 'Blocked accounts cannot follow you or see your logbook, and you will not see each other anywhere in SportLog. They are not told.'
          : 'Muted accounts are hidden from your leaderboard and suggestions. They can still follow you and see your logbook, and they are not told.'}
      </Text>

      <FlatList
        data={data}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyText}>
                {tab === 'blocked'
                  ? "You haven't blocked anyone."
                  : "You haven't muted anyone."}
              </Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => {
          const name = item.display_name ?? item.username
          const initials = (name[0] ?? '?').toUpperCase()
          return (
            <View style={styles.row}>
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
                  tab === 'blocked' ? confirmUnblock(item) : handleUnmute(item)
                }
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.rowActionText}>
                  {tab === 'blocked' ? 'Unblock' : 'Unmute'}
                </Text>
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
  segment: {
    flexDirection: 'row', backgroundColor: '#111120',
    borderRadius: 12, borderWidth: 1, borderColor: '#1e1e38',
    padding: 3, marginHorizontal: 16, marginBottom: 12,
  },
  segmentBtn: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 9 },
  segmentBtnActive: { backgroundColor: '#e94560' },
  segmentText: { fontSize: 13, fontWeight: '700', color: '#666' },
  segmentTextActive: { color: '#fff' },
  explainer: {
    color: '#555', fontSize: 12, lineHeight: 18,
    paddingHorizontal: 20, paddingBottom: 12,
  },
  list: { paddingBottom: 40 },
  emptyWrap: { alignItems: 'center', marginTop: 40, paddingHorizontal: 32 },
  emptyText: { color: '#444', fontSize: 14, textAlign: 'center' },
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
