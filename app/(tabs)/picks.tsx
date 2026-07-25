import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Animated,
  Dimensions,
  Image,
  PanResponder,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import * as Haptics from 'expo-haptics'
import { useUser } from '../../lib/useSession'
import { useSupabase } from '../../lib/useSupabase'
import { fetchAllGames, LEAGUE_SPORT, SPORT_FILTERS } from '../../lib/espn'
import { computeDayStreak } from '../../lib/points'
import type { Game } from '../../lib/types'

const SCREEN_W = Dimensions.get('window').width
const SWIPE_THRESHOLD = SCREEN_W * 0.3
const SWIPE_OUT_DURATION = 220

export default function Picks() {
  const supabase = useSupabase()
  const user = useUser()
  const [games, setGames] = useState<Game[]>([])
  const [pickedIds, setPickedIds] = useState<Set<string>>(new Set())
  const [pickDates, setPickDates] = useState<string[]>([])
  const [sessionPicks, setSessionPicks] = useState(0)
  const [sport, setSport] = useState('all')
  const [loading, setLoading] = useState(true)
  // game_id → how the community picked (null while loading, then counts)
  const [consensus, setConsensus] = useState<Map<string, { home: number; away: number }>>(new Map())

  const pan = useRef(new Animated.ValueXY()).current
  const animating = useRef(false)

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
    // Only show upcoming/live games, soonest first so picks stay relevant
    const upcoming = all
      .filter(g => g.status !== 'final')
      .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())
    setGames(upcoming)
    setLoading(false)
  }, [])

  const loadPickedIds = useCallback(async () => {
    const { data } = await supabase
      .from('picks')
      .select('game_id, created_at')
      .eq('user_id', user?.id ?? '')
    setPickedIds(new Set((data ?? []).map((p: any) => p.game_id)))
    setPickDates((data ?? []).map((p: any) => p.created_at))
  }, [supabase, user])

  useEffect(() => {
    loadGames()
    loadPickedIds()
  }, [loadGames, loadPickedIds])

  // Deck is derived: anything not yet picked, in the selected sport.
  // Removing a card = adding its id to pickedIds, so no index bookkeeping.
  const deck = games.filter(
    g => !pickedIds.has(g.id) && (sport === 'all' || LEAGUE_SPORT[g.league] === sport)
  )
  const current = deck[0]
  const next = deck[1]
  const streak = computeDayStreak(pickDates)

  // Community consensus for the card on top, fetched once per game
  useEffect(() => {
    const id = current?.id
    if (!id || consensus.has(id)) return
    let cancelled = false
    supabase
      .from('picks')
      .select('picked_team')
      .eq('game_id', id)
      .then(({ data }) => {
        if (cancelled || !current) return
        let home = 0
        let away = 0
        for (const p of (data ?? []) as any[]) {
          if (p.picked_team === current.home_team) home++
          else if (p.picked_team === current.away_team) away++
        }
        setConsensus(prev => new Map(prev).set(id, { home, away }))
      })
    return () => { cancelled = true }
  }, [current?.id, consensus, supabase]) // eslint-disable-line react-hooks/exhaustive-deps

  const persistPick = useCallback(async (game: Game, pickedTeam: string) => {
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
  }, [supabase, user])

  const swipeCard = useCallback((direction: 'left' | 'right') => {
    if (!current || animating.current) return
    animating.current = true
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {})
    const game = current
    const toX = direction === 'right' ? SCREEN_W * 1.5 : -SCREEN_W * 1.5
    Animated.timing(pan, {
      toValue: { x: toX, y: 0 },
      duration: SWIPE_OUT_DURATION,
      useNativeDriver: false,
    }).start(() => {
      // Advance the deck immediately; save in the background
      setPickedIds(prev => new Set(prev).add(game.id))
      setPickDates(prev => [...prev, new Date().toISOString()])
      setSessionPicks(n => n + 1)
      pan.setValue({ x: 0, y: 0 })
      animating.current = false
      persistPick(game, direction === 'right' ? game.home_team : game.away_team).catch(() => {})
    })
  }, [current, pan, persistPick])

  // Single PanResponder reading the latest swipeCard through a ref,
  // so gesture handlers never capture a stale closure.
  const swipeCardRef = useRef(swipeCard)
  swipeCardRef.current = swipeCard
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], {
        useNativeDriver: false,
      }),
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dx > SWIPE_THRESHOLD) {
          swipeCardRef.current('right')
        } else if (gesture.dx < -SWIPE_THRESHOLD) {
          swipeCardRef.current('left')
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

  const sportChips = (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.chipsRow}
      style={styles.chipsScroll}
    >
      {SPORT_FILTERS.map(f => (
        <TouchableOpacity
          key={f.key}
          style={[styles.chip, sport === f.key && styles.chipActive]}
          onPress={() => setSport(f.key)}
        >
          <Text style={[styles.chipText, sport === f.key && styles.chipTextActive]}>
            {f.label}
          </Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  )

  if (loading) {
    return (
      <View style={styles.centered}>
        <Text style={styles.loadingText}>Loading matchups…</Text>
      </View>
    )
  }

  const headerRow = (
    <View style={styles.header}>
      <View style={styles.headerLeft}>
        <Text style={styles.title}>Picks</Text>
        <Text style={styles.subtitle}>Swipe to pick a winner</Text>
      </View>
      {streak > 0 && (
        <View style={styles.streakBadge}>
          <Text style={styles.streakFlame}>🔥</Text>
          <Text style={styles.streakNum}>{streak}</Text>
          <Text style={styles.streakLabel}>day{streak !== 1 ? 's' : ''}</Text>
        </View>
      )}
    </View>
  )

  const challengeFriends = () => {
    Share.share({
      message:
        `I'm on a ${streak}-day pick streak on SportLog 🔥 ` +
        `Swipe on games, call the winners, and try to beat my score 🏆`,
    }).catch(() => {})
  }

  if (!current) {
    return (
      <View style={styles.container}>
        {headerRow}
        {sportChips}
        <View style={styles.centered}>
          <Text style={styles.doneIcon}>🏆</Text>
          <Text style={styles.doneTitle}>You're all caught up!</Text>
          <Text style={styles.doneSub}>
            {sessionPicks > 0
              ? `You made ${sessionPicks} pick${sessionPicks !== 1 ? 's' : ''} this session`
              : sport !== 'all'
                ? 'No upcoming games in this sport — try another'
                : 'No upcoming games to pick right now'}
          </Text>
          <TouchableOpacity style={styles.refreshBtn} onPress={() => { loadGames(); loadPickedIds() }}>
            <Text style={styles.refreshBtnText}>Refresh</Text>
          </TouchableOpacity>
          {streak > 0 && (
            <TouchableOpacity style={styles.challengeBtn} onPress={challengeFriends}>
              <Text style={styles.challengeBtnText}>Challenge Friends 🔥</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      {headerRow}

      {sportChips}

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
          {...panResponder.panHandlers}
        >
          {/* Home wins overlay */}
          <Animated.View style={[styles.swipeOverlay, styles.homeOverlay, { opacity: homeOpacity }]}>
            <Text style={styles.overlayLabel}>HOME WINS</Text>
          </Animated.View>

          {/* Away wins overlay */}
          <Animated.View style={[styles.swipeOverlay, styles.awayOverlay, { opacity: awayOpacity }]}>
            <Text style={styles.overlayLabel}>AWAY WINS</Text>
          </Animated.View>

          <MatchupCardContent game={current} consensus={consensus.get(current.id)} />
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
        {deck.length} game{deck.length !== 1 ? 's' : ''} left · {sessionPicks} pick{sessionPicks !== 1 ? 's' : ''} this session
      </Text>
    </View>
  )
}

function MatchupCardContent({
  game,
  consensus,
}: {
  game: Game
  consensus?: { home: number; away: number }
}) {
  const isLive = game.status === 'live'
  const votes = (consensus?.home ?? 0) + (consensus?.away ?? 0)
  const awayPct = votes > 0 ? Math.round(((consensus?.away ?? 0) / votes) * 100) : 0
  return (
    <View style={styles.cardInner}>
      <View style={styles.cardLeague}>
        <Text style={styles.cardLeagueText}>{game.league}</Text>
        {isLive && <View style={styles.liveDot} />}
      </View>

      {/* Away on the left, home on the right, matching the swipe
          directions and the buttons below the deck. */}
      <View style={styles.teamsRow}>
        <View style={styles.teamBlock}>
          {game.away_logo ? (
            <Image source={{ uri: game.away_logo }} style={styles.logo} resizeMode="contain" />
          ) : (
            <View style={styles.logoPlaceholder} />
          )}
          <Text style={styles.teamLabel}>{game.away_team}</Text>
          <Text style={styles.teamRole}>Away</Text>
        </View>

        <View style={styles.vsDivider}>
          {isLive ? (
            <Text style={styles.liveScore}>
              {game.away_score ?? 0}–{game.home_score ?? 0}
            </Text>
          ) : (
            <Text style={styles.vsLabel}>@</Text>
          )}
          <Text style={styles.gameDate}>{formatDate(game.starts_at)}</Text>
        </View>

        <View style={styles.teamBlock}>
          {game.home_logo ? (
            <Image source={{ uri: game.home_logo }} style={styles.logo} resizeMode="contain" />
          ) : (
            <View style={styles.logoPlaceholder} />
          )}
          <Text style={styles.teamLabel}>{game.home_team}</Text>
          <Text style={styles.teamRole}>Home</Text>
        </View>
      </View>

      {/* Community consensus, shown once at least 3 users have picked */}
      {votes >= 3 && (
        <View style={styles.consensusWrap}>
          <View style={styles.consensusBar}>
            <View style={[styles.consensusAway, { flex: Math.max(awayPct, 4) }]} />
            <View style={[styles.consensusHome, { flex: Math.max(100 - awayPct, 4) }]} />
          </View>
          <Text style={styles.consensusText}>
            {awayPct >= 50
              ? `${awayPct}% of SportLog takes ${game.away_abbr ?? game.away_team}`
              : `${100 - awayPct}% of SportLog takes ${game.home_abbr ?? game.home_team}`}
          </Text>
        </View>
      )}
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

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 60, paddingHorizontal: 20, paddingBottom: 4,
  },
  headerLeft: {},
  title: { fontSize: 30, fontWeight: '800', color: '#fff', letterSpacing: -0.5 },
  subtitle: { fontSize: 13, color: '#444', marginTop: 2 },
  streakBadge: {
    flexDirection: 'row', alignItems: 'baseline', gap: 3,
    backgroundColor: '#241d08', borderWidth: 1, borderColor: '#4a3a10',
    borderRadius: 14, paddingHorizontal: 12, paddingVertical: 7,
  },
  streakFlame: { fontSize: 16 },
  streakNum: { fontSize: 18, fontWeight: '800', color: '#f5a623' },
  streakLabel: { fontSize: 11, color: '#8a6d1f', fontWeight: '600' },
  challengeBtn: {
    marginTop: 8, borderWidth: 1, borderColor: '#e94560',
    paddingHorizontal: 28, paddingVertical: 12, borderRadius: 12,
  },
  challengeBtnText: { color: '#e94560', fontWeight: '700', fontSize: 15 },

  chipsScroll: { flexGrow: 0, marginTop: 12 },
  chipsRow: { paddingHorizontal: 16, gap: 8 },
  chip: {
    backgroundColor: '#111120',
    borderWidth: 1,
    borderColor: '#1e1e38',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  chipActive: { backgroundColor: '#e94560', borderColor: '#e94560' },
  chipText: { fontSize: 13, color: '#888', fontWeight: '600' },
  chipTextActive: { color: '#fff' },

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

  consensusWrap: { gap: 6 },
  consensusBar: {
    flexDirection: 'row', height: 5, borderRadius: 3,
    overflow: 'hidden', gap: 2,
  },
  consensusAway: { backgroundColor: '#3a5aff', borderRadius: 3 },
  consensusHome: { backgroundColor: '#2ecc71', borderRadius: 3 },
  consensusText: { fontSize: 11, color: '#555', fontWeight: '600', textAlign: 'center' },

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
