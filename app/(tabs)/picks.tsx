import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Animated,
  Dimensions,
  Image,
  PanResponder,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useUser } from '@clerk/clerk-expo'
import { useSupabase } from '../../lib/useSupabase'
import { fetchAllGames } from '../../lib/espn'
import type { Game } from '../../lib/types'

const SCREEN_W = Dimensions.get('window').width
const SWIPE_THRESHOLD = SCREEN_W * 0.3
const SWIPE_OUT_DURATION = 220

export default function Picks() {
  const supabase = useSupabase()
  const { user } = useUser()
  const [games, setGames] = useState<Game[]>([])
  const [index, setIndex] = useState(0)
  const [pickedIds, setPickedIds] = useState<Set<string>>(new Set())
  const [sessionPicks, setSessionPicks] = useState(0)
  const [loading, setLoading] = useState(true)

  const pan = useRef(new Animated.ValueXY()).current
  const swipeAnim = useRef(new Animated.Value(0)).current

  const rotate = pan.x.interpolate({
    inputRange: [-SCREEN_W / 2, 0, SCREEN_W / 2],
    outputRange: ['-8deg', '0deg', '8deg'],
    extrapolate: 'clamp',
  })
  const homeOpacity = pan.x.interpolate({
    inputRange: [20, SWIPE_THRESHOLD],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  })
  const awayOpacity = pan.x.interpolate({
    inputRange: [-SWIPE_THRESHOLD, -20],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  })

  const loadGames = useCallback(async () => {
    setLoading(true)
    const all = await fetchAllGames()
    // Only show upcoming/live games that haven't been picked
    const upcoming = all.filter(g => g.status !== 'final')
    setGames(upcoming)
    setLoading(false)
  }, [])

  const loadPickedIds = useCallback(async () => {
    const { data } = await supabase.from('picks').select('game_id')
    setPickedIds(new Set((data ?? []).map((p: any) => p.game_id)))
  }, [supabase])

  useEffect(() => {
    loadGames()
    loadPickedIds()
  }, [loadGames, loadPickedIds])

  const unpicked = games.filter(g => !pickedIds.has(g.id))
  const current = unpicked[index]
  const next = unpicked[index + 1]

  const savePick = useCallback(async (game: Game, pickedTeam: string) => {
    await supabase.from('games').upsert({
      id: game.id,
      league: game.league,
      home_team: game.home_team,
      away_team: game.away_team,
      starts_at: game.starts_at,
      status: game.status,
      home_score: game.home_score,
      away_score: game.away_score,
      season: game.season,
      updated_at: game.updated_at,
    })
    await supabase.from('picks').upsert(
      { game_id: game.id, user_id: user?.id, picked_team: pickedTeam },
      { onConflict: 'user_id,game_id' }
    )
    setPickedIds(prev => new Set(prev).add(game.id))
    setSessionPicks(n => n + 1)
  }, [supabase, user])

  const swipeCard = useCallback((direction: 'left' | 'right') => {
    if (!current) return
    const toX = direction === 'right' ? SCREEN_W * 1.5 : -SCREEN_W * 1.5
    Animated.timing(pan, {
      toValue: { x: toX, y: 0 },
      duration: SWIPE_OUT_DURATION,
      useNativeDriver: false,
    }).start(() => {
      savePick(current, direction === 'right' ? current.home_team : current.away_team)
      pan.setValue({ x: 0, y: 0 })
      setIndex(i => i + 1)
    })
  }, [current, pan, savePick])

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], {
        useNativeDriver: false,
      }),
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dx > SWIPE_THRESHOLD) {
          swipeCard('right')
        } else if (gesture.dx < -SWIPE_THRESHOLD) {
          swipeCard('left')
        } else {
          Animated.spring(pan, {
            toValue: { x: 0, y: 0 },
            useNativeDriver: false,
            friction: 5,
          }).start()
        }
      },
    })
  ).current

  // Rebuild pan responder when swipeCard changes
  const panResponderRef = useRef(panResponder)
  useEffect(() => {
    panResponderRef.current = PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], {
        useNativeDriver: false,
      }),
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dx > SWIPE_THRESHOLD) {
          swipeCard('right')
        } else if (gesture.dx < -SWIPE_THRESHOLD) {
          swipeCard('left')
        } else {
          Animated.spring(pan, {
            toValue: { x: 0, y: 0 },
            useNativeDriver: false,
            friction: 5,
          }).start()
        }
      },
    })
  }, [swipeCard, pan])

  if (loading) {
    return (
      <View style={styles.centered}>
        <Text style={styles.loadingText}>Loading matchups…</Text>
      </View>
    )
  }

  if (!current) {
    return (
      <View style={styles.centered}>
        <Text style={styles.doneIcon}>🏆</Text>
        <Text style={styles.doneTitle}>You're all caught up!</Text>
        <Text style={styles.doneSub}>
          {sessionPicks > 0
            ? `You made ${sessionPicks} pick${sessionPicks !== 1 ? 's' : ''} this session`
            : 'No upcoming games to pick right now'}
        </Text>
        <TouchableOpacity style={styles.refreshBtn} onPress={() => { setIndex(0); loadGames(); loadPickedIds() }}>
          <Text style={styles.refreshBtnText}>Refresh</Text>
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Picks</Text>
        <Text style={styles.subtitle}>Swipe to pick a winner</Text>
      </View>

      <View style={styles.hint}>
        <Text style={styles.hintLeft}>← Away wins</Text>
        <Text style={styles.hintRight}>Home wins →</Text>
      </View>

      <View style={styles.deck}>
        {/* Background card (next) */}
        {next && (
          <View style={[styles.card, styles.cardBehind]}>
            <MatchupCardContent game={next} />
          </View>
        )}

        {/* Top swipeable card */}
        <Animated.View
          style={[
            styles.card,
            {
              transform: [
                { translateX: pan.x },
                { translateY: pan.y },
                { rotate },
              ],
            },
          ]}
          {...panResponderRef.current.panHandlers}
        >
          {/* Home wins overlay */}
          <Animated.View style={[styles.swipeOverlay, styles.homeOverlay, { opacity: homeOpacity }]}>
            <Text style={styles.overlayLabel}>HOME WINS</Text>
          </Animated.View>

          {/* Away wins overlay */}
          <Animated.View style={[styles.swipeOverlay, styles.awayOverlay, { opacity: awayOpacity }]}>
            <Text style={styles.overlayLabel}>AWAY WINS</Text>
          </Animated.View>

          <MatchupCardContent game={current} />
        </Animated.View>
      </View>

      {/* Manual buttons */}
      <View style={styles.buttons}>
        <TouchableOpacity style={styles.awayBtn} onPress={() => swipeCard('left')}>
          <Text style={styles.awayBtnText}>{current.away_abbr ?? current.away_team}</Text>
          <Text style={styles.btnSub}>Away wins</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.homeBtn} onPress={() => swipeCard('right')}>
          <Text style={styles.homeBtnText}>{current.home_abbr ?? current.home_team}</Text>
          <Text style={styles.btnSub}>Home wins</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.counter}>
        {sessionPicks} pick{sessionPicks !== 1 ? 's' : ''} made this session
      </Text>
    </View>
  )
}

function MatchupCardContent({ game }: { game: Game }) {
  const isLive = game.status === 'live'
  return (
    <View style={styles.cardInner}>
      <View style={styles.cardLeague}>
        <Text style={styles.cardLeagueText}>{game.league}</Text>
        {isLive && <View style={styles.liveDot} />}
      </View>

      <View style={styles.teamsRow}>
        {/* Home team */}
        <View style={styles.teamBlock}>
          {game.home_logo ? (
            <Image source={{ uri: game.home_logo }} style={styles.logo} resizeMode="contain" />
          ) : (
            <View style={styles.logoPlaceholder} />
          )}
          <Text style={styles.teamLabel}>{game.home_team}</Text>
          <Text style={styles.teamRole}>Home</Text>
        </View>

        <View style={styles.vsDivider}>
          {isLive ? (
            <Text style={styles.liveScore}>
              {game.home_score ?? 0}–{game.away_score ?? 0}
            </Text>
          ) : (
            <Text style={styles.vsLabel}>VS</Text>
          )}
          <Text style={styles.gameDate}>{formatDate(game.starts_at)}</Text>
        </View>

        {/* Away team */}
        <View style={styles.teamBlock}>
          {game.away_logo ? (
            <Image source={{ uri: game.away_logo }} style={styles.logo} resizeMode="contain" />
          ) : (
            <View style={styles.logoPlaceholder} />
          )}
          <Text style={styles.teamLabel}>{game.away_team}</Text>
          <Text style={styles.teamRole}>Away</Text>
        </View>
      </View>
    </View>
  )
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  const today = new Date()
  const tomorrow = new Date()
  tomorrow.setDate(today.getDate() + 1)
  if (d.toDateString() === today.toDateString()) {
    return `Today · ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
  }
  if (d.toDateString() === tomorrow.toDateString()) {
    return `Tomorrow · ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
  }
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0f' },
  centered: { flex: 1, backgroundColor: '#0a0a0f', alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  loadingText: { color: '#555', fontSize: 15 },
  doneIcon: { fontSize: 52, marginBottom: 8 },
  doneTitle: { fontSize: 22, fontWeight: '800', color: '#fff' },
  doneSub: { fontSize: 14, color: '#555', textAlign: 'center' },
  refreshBtn: { marginTop: 16, backgroundColor: '#e94560', paddingHorizontal: 28, paddingVertical: 12, borderRadius: 12 },
  refreshBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  header: { paddingTop: 60, paddingHorizontal: 20, paddingBottom: 4 },
  title: { fontSize: 30, fontWeight: '800', color: '#fff', letterSpacing: -0.5 },
  subtitle: { fontSize: 13, color: '#444', marginTop: 2 },

  hint: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 24, marginTop: 10 },
  hintLeft: { fontSize: 12, color: '#3a5aff', fontWeight: '600' },
  hintRight: { fontSize: 12, color: '#2ecc71', fontWeight: '600' },

  deck: { flex: 1, alignItems: 'center', justifyContent: 'center', marginTop: 8 },

  card: {
    width: SCREEN_W - 32,
    backgroundColor: '#111120',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#1e1e38',
    overflow: 'hidden',
    position: 'absolute',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 10,
  },
  cardBehind: {
    transform: [{ scale: 0.94 }, { translateY: 16 }],
    opacity: 0.7,
  },

  swipeOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    borderRadius: 24,
  },
  homeOverlay: { backgroundColor: 'rgba(46,204,113,0.3)' },
  awayOverlay: { backgroundColor: 'rgba(58,90,255,0.3)' },
  overlayLabel: { fontSize: 28, fontWeight: '900', color: '#fff', letterSpacing: 2 },

  cardInner: { padding: 24, gap: 24 },
  cardLeague: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardLeagueText: { fontSize: 11, fontWeight: '700', color: '#555', textTransform: 'uppercase', letterSpacing: 1 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#e94560' },

  teamsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  teamBlock: { flex: 1, alignItems: 'center', gap: 10 },
  logo: { width: 80, height: 80 },
  logoPlaceholder: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#1e1e38' },
  teamLabel: { fontSize: 13, fontWeight: '700', color: '#fff', textAlign: 'center' },
  teamRole: { fontSize: 11, color: '#444', fontWeight: '500' },

  vsDivider: { alignItems: 'center', gap: 6, paddingHorizontal: 8 },
  vsLabel: { fontSize: 20, fontWeight: '900', color: '#2a2a4a' },
  liveScore: { fontSize: 22, fontWeight: '800', color: '#e94560' },
  gameDate: { fontSize: 11, color: '#444', fontWeight: '500', textAlign: 'center' },

  buttons: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingBottom: 12 },
  awayBtn: {
    flex: 1,
    backgroundColor: '#0d1433',
    borderWidth: 1,
    borderColor: '#3a5aff',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    gap: 2,
  },
  homeBtn: {
    flex: 1,
    backgroundColor: '#0d2a1a',
    borderWidth: 1,
    borderColor: '#2ecc71',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    gap: 2,
  },
  awayBtnText: { fontSize: 15, fontWeight: '800', color: '#3a5aff' },
  homeBtnText: { fontSize: 15, fontWeight: '800', color: '#2ecc71' },
  btnSub: { fontSize: 11, color: '#555', fontWeight: '500' },

  counter: { textAlign: 'center', color: '#333', fontSize: 12, paddingBottom: 16 },
})
