import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useUser } from '../../lib/useSession'
import { useSupabase } from '../../lib/useSupabase'
import { fetchAllGames, fetchLeagueGames, SPORT_LEAGUES } from '../../lib/espn'
import type { Game } from '../../lib/types'

const ALL_CATEGORIES = [
  { key: 'all', label: '🌐 All' },
  ...SPORT_LEAGUES.map(l => ({ key: l.key, label: l.label })),
]

export default function Explore() {
  const supabase = useSupabase()
  const user = useUser()
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [allGames, setAllGames] = useState<Game[]>([])
  const [watchlistIds, setWatchlistIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const prevCategory = useRef('all')

  // Load games from ESPN
  const loadGames = useCallback(async (cat: string) => {
    setLoading(true)
    const games = cat === 'all' ? await fetchAllGames() : await fetchLeagueGames(cat)
    setAllGames(games)
    setLoading(false)
  }, [])

  // Load user's current watchlist IDs
  const loadWatchlist = useCallback(async () => {
    const { data } = await supabase.from('watchlist').select('game_id')
    setWatchlistIds(new Set((data ?? []).map((w: any) => w.game_id)))
  }, [supabase])

  useEffect(() => {
    loadWatchlist()
    loadGames('all')
  }, [loadGames, loadWatchlist])

  useEffect(() => {
    if (category === prevCategory.current) return
    prevCategory.current = category
    setSearch('')
    loadGames(category)
  }, [category, loadGames])

  // Client-side search filter
  const displayed = search.trim()
    ? allGames.filter(g => {
        const q = search.toLowerCase()
        return (
          g.home_team.toLowerCase().includes(q) ||
          g.away_team.toLowerCase().includes(q) ||
          g.league.toLowerCase().includes(q)
        )
      })
    : allGames

  const logGame = async (game: Game) => {
    // Upsert game so log-game modal can reference it
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
    router.push({
      pathname: '/log-game',
      params: {
        prefillGameId: game.id,
        prefillHome: game.home_team,
        prefillAway: game.away_team,
        prefillLeague: game.league,
        prefillDate: game.starts_at,
      },
    })
  }

  const toggleWatchlist = async (game: Game) => {
    const inList = watchlistIds.has(game.id)
    setSavingId(game.id)
    if (inList) {
      await supabase.from('watchlist').delete().eq('game_id', game.id)
      setWatchlistIds(prev => {
        const next = new Set(prev)
        next.delete(game.id)
        return next
      })
    } else {
      // Upsert game first so the watchlist FK is satisfied
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
      await supabase.from('watchlist').insert({ game_id: game.id, user_id: user?.id })
      setWatchlistIds(prev => new Set(prev).add(game.id))
    }
    setSavingId(null)
  }

  return (
    <View style={styles.container}>
      {/* ── Sticky header ── */}
      <View style={styles.header}>
        <Text style={styles.title}>Explore</Text>
        <TextInput
          style={styles.searchBar}
          placeholder="Search teams or leagues…"
          placeholderTextColor="#555"
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
        />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
        >
          {ALL_CATEGORIES.map(cat => (
            <TouchableOpacity
              key={cat.key}
              style={[styles.chip, category === cat.key && styles.chipActive]}
              onPress={() => setCategory(cat.key)}
            >
              <Text style={[styles.chipText, category === cat.key && styles.chipTextActive]}>
                {cat.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* ── Game list ── */}
      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color="#e94560" size="large" />
          <Text style={styles.loadingText}>Loading games…</Text>
        </View>
      ) : (
        <FlatList
          data={displayed}
          keyExtractor={item => item.id}
          contentContainerStyle={
            displayed.length === 0 ? styles.emptyWrap : styles.list
          }
          ListHeaderComponent={
            displayed.length > 0 ? (
              <Text style={styles.resultCount}>
                {displayed.length} game{displayed.length !== 1 ? 's' : ''}
              </Text>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>📭</Text>
              <Text style={styles.emptyTitle}>No games found</Text>
              <Text style={styles.emptySub}>
                {search.trim()
                  ? 'Try a different search term'
                  : 'No games scheduled in the next 14 days for this sport'}
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <GameCard
              game={item}
              saved={watchlistIds.has(item.id)}
              saving={savingId === item.id}
              onToggle={() => toggleWatchlist(item)}
              onLog={() => logGame(item)}
            />
          )}
        />
      )}
    </View>
  )
}

function GameCard({
  game,
  saved,
  saving,
  onToggle,
  onLog,
}: {
  game: Game
  saved: boolean
  saving: boolean
  onToggle: () => void
  onLog: () => void
}) {
  const isLive = game.status === 'live'
  const isFinal = game.status === 'final'

  return (
    <View style={[styles.card, isLive && styles.cardLive]}>
      <View style={styles.cardTop}>
        {/* League badge */}
        <View style={styles.leagueBadge}>
          <Text style={styles.leagueBadgeText}>{game.league}</Text>
          {isLive && <View style={styles.liveDot} />}
        </View>

        {/* Score / date */}
        {isLive ? (
          <Text style={styles.liveScore}>
            {game.home_score ?? 0} – {game.away_score ?? 0}
          </Text>
        ) : isFinal && game.home_score != null ? (
          <Text style={styles.finalScore}>
            {game.home_score} – {game.away_score}
          </Text>
        ) : (
          <Text style={styles.dateText}>
            {formatGameDate(game.starts_at)}
          </Text>
        )}
      </View>

      <View style={styles.matchupRow}>
        <View style={styles.teamCol}>
          {game.home_logo ? (
            <Image source={{ uri: game.home_logo }} style={styles.teamLogo} resizeMode="contain" />
          ) : (
            <View style={styles.teamLogoPlaceholder} />
          )}
          <Text style={styles.teamName}>{game.home_abbr ?? game.home_team}</Text>
        </View>
        <Text style={styles.vsText}>vs</Text>
        <View style={styles.teamCol}>
          {game.away_logo ? (
            <Image source={{ uri: game.away_logo }} style={styles.teamLogo} resizeMode="contain" />
          ) : (
            <View style={styles.teamLogoPlaceholder} />
          )}
          <Text style={styles.teamName}>{game.away_abbr ?? game.away_team}</Text>
        </View>
      </View>

      <View style={styles.cardActions}>
        <TouchableOpacity
          style={[styles.actionBtn, saved && styles.actionBtnSaved]}
          onPress={onToggle}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#e94560" size="small" style={{ width: 16, height: 16 }} />
          ) : (
            <>
              <Ionicons
                name={saved ? 'bookmark' : 'bookmark-outline'}
                size={14}
                color={saved ? '#e94560' : '#555'}
              />
              <Text style={[styles.actionBtnText, saved && styles.actionBtnTextActive]}>
                {saved ? 'Saved' : 'Watchlist'}
              </Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.logBtn} onPress={onLog}>
          <Ionicons name="pencil" size={14} color="#fff" />
          <Text style={styles.logBtnText}>Log Game</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

function formatGameDate(iso: string): string {
  const d = new Date(iso)
  const today = new Date()
  const tomorrow = new Date()
  tomorrow.setDate(today.getDate() + 1)

  const isToday = d.toDateString() === today.toDateString()
  const isTomorrow = d.toDateString() === tomorrow.toDateString()

  if (isToday) {
    return `Today · ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
  }
  if (isTomorrow) {
    return `Tomorrow · ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
  }
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0f' },
  header: {
    paddingTop: 60,
    paddingBottom: 4,
    backgroundColor: '#0a0a0f',
    borderBottomWidth: 1,
    borderBottomColor: '#131320',
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.5,
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  searchBar: {
    backgroundColor: '#131320',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: '#fff',
    fontSize: 15,
    marginHorizontal: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#1e1e3a',
  },
  chips: { paddingHorizontal: 16, paddingBottom: 12, gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#131320',
    borderWidth: 1,
    borderColor: '#1e1e3a',
  },
  chipActive: { backgroundColor: '#e94560', borderColor: '#e94560' },
  chipText: { color: '#666', fontSize: 13, fontWeight: '600' },
  chipTextActive: { color: '#fff' },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
  },
  loadingText: { color: '#555', fontSize: 14 },
  list: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 110 },
  emptyWrap: { flex: 1 },
  resultCount: {
    fontSize: 12,
    color: '#444',
    fontWeight: '600',
    paddingBottom: 8,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    marginTop: 40,
    gap: 8,
  },
  emptyIcon: { fontSize: 48, marginBottom: 8 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: '#fff' },
  emptySub: { fontSize: 14, color: '#555', textAlign: 'center', lineHeight: 22 },
  card: {
    backgroundColor: '#111120',
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#1e1e38',
    gap: 10,
  },
  cardLive: { borderColor: '#2a0e1a', backgroundColor: '#140a10' },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  leagueBadge: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  leagueBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#555',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#e94560',
  },
  liveScore: { fontSize: 18, fontWeight: '800', color: '#e94560' },
  finalScore: { fontSize: 16, fontWeight: '700', color: '#888' },
  dateText: { fontSize: 12, color: '#444', fontWeight: '500' },
  matchupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  teamCol: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
  },
  teamLogo: {
    width: 44,
    height: 44,
  },
  teamLogoPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#1e1e38',
  },
  teamName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
  },
  vsText: { fontSize: 12, color: '#333', fontWeight: '600', marginTop: 10 },
  cardActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderWidth: 1,
    borderColor: '#1e1e38',
    borderRadius: 10,
    paddingVertical: 9,
  },
  actionBtnSaved: { borderColor: '#e94560', backgroundColor: '#1a0a10' },
  actionBtnText: { fontSize: 13, color: '#555', fontWeight: '600' },
  actionBtnTextActive: { color: '#e94560' },
  logBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: '#e94560',
    borderRadius: 10,
    paddingVertical: 9,
  },
  logBtnText: { fontSize: 13, color: '#fff', fontWeight: '700' },
})
