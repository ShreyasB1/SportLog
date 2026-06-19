import { useAuth, useUser } from '@clerk/clerk-expo'
import { router } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import {
  FlatList,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useSupabase } from '../../lib/useSupabase'
import type { Log, Profile } from '../../lib/types'

export default function ProfileScreen() {
  const supabase = useSupabase()
  const { user } = useUser()
  const { signOut } = useAuth()

  const [profile, setProfile] = useState<Profile | null>(null)
  const [followersCount, setFollowersCount] = useState(0)
  const [followingCount, setFollowingCount] = useState(0)
  const [gamesWatched, setGamesWatched] = useState(0)
  const [watchlistCount, setWatchlistCount] = useState(0)
  const [recentLogs, setRecentLogs] = useState<Log[]>([])
  const [suggested, setSuggested] = useState<Profile[]>([])
  const [following, setFollowing] = useState<Set<string>>(new Set())
  const [editVisible, setEditVisible] = useState(false)
  const [loading, setLoading] = useState(true)

  // Edit form state
  const [editName, setEditName] = useState('')
  const [editFavTeam, setEditFavTeam] = useState('')
  const [editBio, setEditBio] = useState('')
  const [editSaving, setEditSaving] = useState(false)

  const fetchAll = useCallback(async () => {
    if (!user) return
    setLoading(true)
    const userId = user.id

    // Fetch or create profile
    let { data: profileData, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()

    if (!profileData) {
      const { data: created } = await supabase
        .from('profiles')
        .insert({
          id: userId,
          username: user.username ?? `user${userId.slice(-6)}`,
          display_name: user.fullName ?? user.username ?? null,
          avatar_url: user.imageUrl ?? null,
        })
        .select()
        .single()
      profileData = created
    }
    setProfile(profileData as Profile)

    // Parallel fetches
    const [
      logsCountRes,
      wlCountRes,
      recentRes,
      followersRes,
      followingRes,
      suggestedRes,
      followingListRes,
    ] = await Promise.all([
      supabase
        .from('logs')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId),
      supabase
        .from('watchlist')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId),
      supabase
        .from('logs')
        .select('*, game:games(*)')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(5),
      supabase
        .from('friendships')
        .select('*', { count: 'exact', head: true })
        .eq('addressee_id', userId)
        .eq('status', 'accepted'),
      supabase
        .from('friendships')
        .select('*', { count: 'exact', head: true })
        .eq('requester_id', userId)
        .eq('status', 'accepted'),
      supabase
        .from('profiles')
        .select('*')
        .neq('id', userId)
        .limit(10),
      supabase
        .from('friendships')
        .select('addressee_id')
        .eq('requester_id', userId),
    ])

    setGamesWatched(logsCountRes.count ?? 0)
    setWatchlistCount(wlCountRes.count ?? 0)
    setRecentLogs((recentRes.data as Log[]) ?? [])
    setFollowersCount(followersRes.count ?? 0)
    setFollowingCount(followingRes.count ?? 0)
    setSuggested((suggestedRes.data as Profile[]) ?? [])

    const followingIds = new Set(
      ((followingListRes.data ?? []) as any[]).map(f => f.addressee_id)
    )
    setFollowing(followingIds)
    setLoading(false)
  }, [supabase, user])

  useEffect(() => { fetchAll() }, [fetchAll])

  const openEdit = () => {
    setEditName(profile?.display_name ?? '')
    setEditFavTeam(profile?.favorite_team ?? '')
    setEditBio(profile?.bio ?? '')
    setEditVisible(true)
  }

  const saveEdit = async () => {
    if (!profile) return
    setEditSaving(true)
    const { data } = await supabase
      .from('profiles')
      .update({
        display_name: editName || null,
        favorite_team: editFavTeam || null,
        bio: editBio || null,
      })
      .eq('id', profile.id)
      .select()
      .single()
    setProfile(data as Profile)
    setEditSaving(false)
    setEditVisible(false)
  }

  const followUser = async (addresseeId: string) => {
    await supabase.from('friendships').insert({ addressee_id: addresseeId })
    setFollowing(prev => new Set(prev).add(addresseeId))
    setFollowingCount(c => c + 1)
  }

  const handleSignOut = async () => {
    await signOut()
    router.replace('/(auth)/sign-in')
  }

  const displayName =
    profile?.display_name ?? user?.fullName ?? profile?.username ?? '—'
  const username = profile?.username ?? user?.username ?? ''
  const avatarUrl = user?.imageUrl ?? profile?.avatar_url ?? null
  const initials = (displayName[0] ?? '?').toUpperCase()
  const joinedDate = profile
    ? new Date(profile.created_at).toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric',
      })
    : ''

  return (
    <>
      <FlatList
        data={recentLogs}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View>
            {/* ── Header buttons ── */}
            <View style={styles.topRow}>
              <TouchableOpacity style={styles.topBtn} onPress={openEdit}>
                <Text style={styles.topBtnText}>Edit Profile</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.topBtn} onPress={() => {}}>
                <Text style={styles.topBtnText}>Share</Text>
              </TouchableOpacity>
            </View>

            {/* ── Avatar + identity ── */}
            <View style={styles.identity}>
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={styles.avatar} />
              ) : (
                <View style={styles.avatarFallback}>
                  <Text style={styles.avatarInitials}>{initials}</Text>
                </View>
              )}
              <Text style={styles.displayName}>{displayName}</Text>
              {username ? <Text style={styles.username}>@{username}</Text> : null}
              {joinedDate ? (
                <Text style={styles.joined}>Joined {joinedDate}</Text>
              ) : null}
            </View>

            {/* ── Follow counts ── */}
            <View style={styles.followRow}>
              <View style={styles.followStat}>
                <Text style={styles.followNum}>{followersCount}</Text>
                <Text style={styles.followLabel}>Followers</Text>
              </View>
              <View style={styles.followDivider} />
              <View style={styles.followStat}>
                <Text style={styles.followNum}>{followingCount}</Text>
                <Text style={styles.followLabel}>Following</Text>
              </View>
            </View>

            {/* ── Favorite team ── */}
            {profile?.favorite_team ? (
              <View style={styles.favTeamRow}>
                <Text style={styles.favTeamLabel}>Favorite team</Text>
                <Text style={styles.favTeamValue}>{profile.favorite_team}</Text>
              </View>
            ) : null}

            {/* ── Bio ── */}
            {profile?.bio ? (
              <Text style={styles.bio}>{profile.bio}</Text>
            ) : null}

            {/* ── Stats ── */}
            <View style={styles.statsRow}>
              <View style={styles.statBox}>
                <Text style={styles.statNum}>{gamesWatched}</Text>
                <Text style={styles.statLabel}>Watched</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statNum}>{watchlistCount}</Text>
                <Text style={styles.statLabel}>Watchlist</Text>
              </View>
            </View>

            {/* ── Suggested for You ── */}
            {suggested.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Suggested for You</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.suggestedScroll}
                >
                  {suggested.map(p => {
                    const isFollowing = following.has(p.id)
                    const pInitials = (p.display_name ?? p.username ?? '?')[0].toUpperCase()
                    return (
                      <View key={p.id} style={styles.suggestedCard}>
                        {p.avatar_url ? (
                          <Image source={{ uri: p.avatar_url }} style={styles.suggestedAvatar} />
                        ) : (
                          <View style={styles.suggestedAvatarFallback}>
                            <Text style={styles.suggestedInitials}>{pInitials}</Text>
                          </View>
                        )}
                        <Text style={styles.suggestedName} numberOfLines={1}>
                          {p.display_name ?? p.username}
                        </Text>
                        <Text style={styles.suggestedUsername} numberOfLines={1}>
                          @{p.username}
                        </Text>
                        <TouchableOpacity
                          style={[
                            styles.followBtn,
                            isFollowing && styles.followBtnActive,
                          ]}
                          onPress={() => !isFollowing && followUser(p.id)}
                          disabled={isFollowing}
                        >
                          <Text
                            style={[
                              styles.followBtnText,
                              isFollowing && styles.followBtnTextActive,
                            ]}
                          >
                            {isFollowing ? 'Following' : 'Follow'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    )
                  })}
                </ScrollView>
              </View>
            )}

            {/* ── Recent games header ── */}
            {recentLogs.length > 0 && (
              <View style={styles.recentHeader}>
                <Text style={styles.sectionTitle}>Recent Games</Text>
              </View>
            )}
          </View>
        }
        ListEmptyComponent={
          !loading && recentLogs.length === 0 ? (
            <View style={styles.noRecent}>
              <Text style={styles.noRecentText}>No games logged yet</Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => {
          const g = item.game
          return (
            <View style={styles.recentCard}>
              <View style={styles.recentInfo}>
                <Text style={styles.recentMatchup} numberOfLines={1}>
                  {g.home_team} vs {g.away_team}
                </Text>
                <Text style={styles.recentMeta}>
                  {g.league} ·{' '}
                  {new Date(item.created_at).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                  })}
                </Text>
              </View>
              {item.reaction ? (
                <Text style={styles.recentReaction}>{item.reaction}</Text>
              ) : null}
            </View>
          )
        }}
        ListFooterComponent={
          <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
            <Text style={styles.signOutText}>Sign Out</Text>
          </TouchableOpacity>
        }
      />

      {/* ── Edit Profile Modal ── */}
      <Modal
        visible={editVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setEditVisible(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setEditVisible(false)}>
              <Text style={styles.modalCancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Edit Profile</Text>
            <TouchableOpacity onPress={saveEdit} disabled={editSaving}>
              <Text style={[styles.modalSave, editSaving && { opacity: 0.5 }]}>
                {editSaving ? 'Saving…' : 'Save'}
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.modalBody}>
            <Text style={styles.fieldLabel}>Display Name</Text>
            <TextInput
              style={styles.fieldInput}
              value={editName}
              onChangeText={setEditName}
              placeholder="Your name"
              placeholderTextColor="#444"
            />

            <Text style={styles.fieldLabel}>Favorite Team</Text>
            <TextInput
              style={styles.fieldInput}
              value={editFavTeam}
              onChangeText={setEditFavTeam}
              placeholder="e.g. San Francisco 49ers"
              placeholderTextColor="#444"
            />

            <Text style={styles.fieldLabel}>Bio</Text>
            <TextInput
              style={[styles.fieldInput, styles.fieldInputMulti]}
              value={editBio}
              onChangeText={setEditBio}
              placeholder="Tell people about yourself"
              placeholderTextColor="#444"
              multiline
              numberOfLines={3}
            />
          </ScrollView>
        </View>
      </Modal>
    </>
  )
}

const styles = StyleSheet.create({
  list: { paddingBottom: 110, backgroundColor: '#0a0a0f' },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 8,
  },
  topBtn: {
    borderWidth: 1,
    borderColor: '#1e1e38',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  topBtnText: { color: '#aaa', fontSize: 13, fontWeight: '600' },
  identity: { alignItems: 'center', paddingVertical: 20, gap: 4 },
  avatar: {
    width: 90,
    height: 90,
    borderRadius: 45,
    marginBottom: 8,
  },
  avatarFallback: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: '#e94560',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  avatarInitials: { fontSize: 36, fontWeight: '800', color: '#fff' },
  displayName: { fontSize: 26, fontWeight: '800', color: '#fff', letterSpacing: -0.5 },
  username: { fontSize: 15, color: '#555' },
  joined: { fontSize: 13, color: '#333', marginTop: 2 },
  followRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 16,
    marginHorizontal: 40,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#131320',
    gap: 32,
  },
  followStat: { alignItems: 'center', gap: 2 },
  followNum: { fontSize: 22, fontWeight: '800', color: '#fff' },
  followLabel: { fontSize: 12, color: '#555', fontWeight: '600' },
  followDivider: { width: 1, height: 32, backgroundColor: '#1e1e38' },
  favTeamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    gap: 6,
  },
  favTeamLabel: { fontSize: 13, color: '#555' },
  favTeamValue: { fontSize: 13, color: '#fff', fontWeight: '700' },
  bio: {
    fontSize: 14,
    color: '#aaa',
    textAlign: 'center',
    paddingHorizontal: 32,
    lineHeight: 22,
    paddingBottom: 8,
  },
  statsRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    gap: 12,
  },
  statBox: {
    flex: 1,
    backgroundColor: '#111120',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1e1e38',
    gap: 4,
  },
  statNum: { fontSize: 28, fontWeight: '800', color: '#fff' },
  statLabel: { fontSize: 12, color: '#555', fontWeight: '600' },
  section: { paddingTop: 20, paddingBottom: 4 },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#fff',
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  suggestedScroll: { paddingHorizontal: 16, gap: 10 },
  suggestedCard: {
    width: 120,
    backgroundColor: '#111120',
    borderRadius: 16,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1e1e38',
    gap: 4,
  },
  suggestedAvatar: { width: 44, height: 44, borderRadius: 22, marginBottom: 4 },
  suggestedAvatarFallback: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#e94560',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  suggestedInitials: { color: '#fff', fontSize: 18, fontWeight: '700' },
  suggestedName: { fontSize: 13, fontWeight: '700', color: '#fff', textAlign: 'center' },
  suggestedUsername: { fontSize: 11, color: '#555', textAlign: 'center' },
  followBtn: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: '#e94560',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 5,
  },
  followBtnActive: { backgroundColor: '#1a0a10' },
  followBtnText: { fontSize: 12, color: '#e94560', fontWeight: '700' },
  followBtnTextActive: { color: '#e94560' },
  recentHeader: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8 },
  recentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111120',
    borderRadius: 14,
    padding: 14,
    marginHorizontal: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#1e1e38',
  },
  recentInfo: { flex: 1 },
  recentMatchup: { fontSize: 14, fontWeight: '700', color: '#fff' },
  recentMeta: { fontSize: 12, color: '#555', marginTop: 2 },
  recentReaction: { fontSize: 22, marginLeft: 8 },
  noRecent: { paddingHorizontal: 20, paddingTop: 8 },
  noRecentText: { color: '#333', fontSize: 14, textAlign: 'center' },
  signOutBtn: {
    marginHorizontal: 16,
    marginTop: 28,
    backgroundColor: '#111120',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1e1e38',
  },
  signOutText: { color: '#e94560', fontSize: 16, fontWeight: '700' },
  modalContainer: { flex: 1, backgroundColor: '#0a0a0f' },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#131320',
  },
  modalCancel: { color: '#666', fontSize: 15 },
  modalTitle: { fontSize: 16, fontWeight: '700', color: '#fff' },
  modalSave: { color: '#e94560', fontSize: 15, fontWeight: '700' },
  modalBody: { padding: 20, gap: 6 },
  fieldLabel: { fontSize: 12, color: '#555', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 12 },
  fieldInput: {
    backgroundColor: '#111120',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#fff',
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#1e1e38',
    marginTop: 6,
  },
  fieldInputMulti: { height: 90, textAlignVertical: 'top', paddingTop: 14 },
})
