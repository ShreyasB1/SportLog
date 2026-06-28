import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useUser } from '@clerk/clerk-expo'
import { useSupabase } from '../lib/useSupabase'
import { fetchAllGames } from '../lib/espn'
import { INITIAL_SCORE, updateRatings } from '../lib/elo'
import type { Game, RankEntry } from '../lib/types'

const REACTIONS = ['🔥', '😱', '😤', '💤', '🏆', '💔', '🤯', '👏', '😴', '⚡', '🫶', '😬']

const WATCHED_VIA = [
  { key: 'live',       label: '📺 Live TV' },
  { key: 'venue',      label: '🏟️ Venue' },
  { key: 'replay',     label: '⏪ Replay' },
  { key: 'highlights', label: '✂️ Highlights' },
  { key: 'bar',        label: '🍺 Bar' },
]

const VIBES = [
  { key: 'fire',   emoji: '🔥', label: 'Fire',   delta: 100 },
  { key: 'solid',  emoji: '👍', label: 'Solid',  delta: 50 },
  { key: 'mid',    emoji: '😐', label: 'Mid',    delta: 0 },
  { key: 'snooze', emoji: '💤', label: 'Snooze', delta: -100 },
]

type Step      = 'search' | 'details' | 'rank'
type RankPhase = 'vibe' | 'compare' | 'done'

export default function LogGame() {
  const supabase = useSupabase()
  const { user } = useUser()
  const params = useLocalSearchParams<{
    prefillGameId?: string
    prefillHome?: string
    prefillAway?: string
    prefillLeague?: string
    prefillDate?: string
  }>()

  const isPrefilled = !!params.prefillGameId

  const prefillGame: Game | null = isPrefilled
    ? {
        id: params.prefillGameId!,
        home_team: params.prefillHome ?? '',
        away_team: params.prefillAway ?? '',
        league: params.prefillLeague ?? '',
        starts_at: params.prefillDate ?? new Date().toISOString(),
        status: 'final',
        home_score: null,
        away_score: null,
        season: null,
        updated_at: new Date().toISOString(),
      }
    : null

  // ── Navigation state ──
  const [step, setStep] = useState<Step>(isPrefilled ? 'details' : 'search')

  // ── Search state ──
  const [allGames, setAllGames]       = useState<Game[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [searchLoading, setSearchLoading] = useState(false)
  const [selectedGame, setSelectedGame]   = useState<Game | null>(prefillGame)

  // ── Log form state ──
  const [watchedVia,  setWatchedVia]  = useState<string | null>(null)
  const [reaction,    setReaction]    = useState<string | null>(null)
  const [review,      setReview]      = useState('')
  const [spoilerFree, setSpoilerFree] = useState(true)
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState('')
  const [alreadyLogged, setAlreadyLogged] = useState(false)

  // ── Rank step state ──
  const [rankPhase,       setRankPhase]       = useState<RankPhase>('vibe')
  const [rankScore,       setRankScore]       = useState(INITIAL_SCORE)
  const [compareGames,    setCompareGames]    = useState<RankEntry[]>([])
  const [compareIdx,      setCompareIdx]      = useState(0)
  const [selectedSide,    setSelectedSide]    = useState<'new' | 'old' | null>(null)
  const [picking,         setPicking]         = useState(false)

  useEffect(() => {
    if (isPrefilled) return
    setSearchLoading(true)
    fetchAllGames().then(games => {
      const sorted = [...games].sort((a, b) => {
        const rank = (g: Game) => g.status === 'live' ? 0 : g.status === 'scheduled' ? 1 : 2
        return rank(a) - rank(b) || new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime()
      })
      setAllGames(sorted)
      setSearchLoading(false)
    })
  }, [isPrefilled])

  const searchResults = useCallback(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return allGames.slice(0, 30)
    return allGames
      .filter(g =>
        g.home_team.toLowerCase().includes(q) ||
        g.away_team.toLowerCase().includes(q) ||
        g.league.toLowerCase().includes(q)
      )
      .slice(0, 30)
  }, [allGames, searchQuery])

  const selectGame = (game: Game) => {
    setSelectedGame(game)
    setStep('details')
  }

  const onSave = async () => {
    if (!selectedGame) return
    if (!user?.id) {
      setError('Not signed in. Please sign out and back in.')
      return
    }
    setError('')
    setSaving(true)
    try {
      const { error: gameErr } = await supabase.from('games').upsert({
        id: selectedGame.id,
        league: selectedGame.league,
        home_team: selectedGame.home_team,
        away_team: selectedGame.away_team,
        starts_at: selectedGame.starts_at,
        status: selectedGame.status,
        home_score: selectedGame.home_score,
        away_score: selectedGame.away_score,
        season: selectedGame.season,
        updated_at: selectedGame.updated_at,
      })
      if (gameErr) throw gameErr

      const { error: logErr } = await supabase.from('logs').insert({
        user_id: user.id,
        game_id: selectedGame.id,
        watched_via: watchedVia,
        review: review.trim() || null,
        reaction,
        spoiler_free: spoilerFree,
      })
      if (logErr) {
        if (logErr.code === '23505') {
          setAlreadyLogged(true)
          setSaving(false)
          return
        }
        throw logErr
      }

      await supabase.from('ranks').upsert(
        { game_id: selectedGame.id, user_id: user.id, score: INITIAL_SCORE },
        { onConflict: 'user_id,game_id', ignoreDuplicates: true },
      )

      // Load other ranked games for comparison (shuffled, up to 3)
      const { data: existing } = await supabase
        .from('ranks')
        .select('*, game:games(*)')
        .neq('game_id', selectedGame.id)
        .order('score', { ascending: false })
        .limit(10)

      const pool = (existing ?? []) as RankEntry[]
      const shuffled = [...pool].sort(() => 0.5 - Math.random()).slice(0, 3)
      setCompareGames(shuffled)
      setRankScore(INITIAL_SCORE)
      setStep('rank')
    } catch (err: any) {
      setError(err.message ?? 'Could not save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const pickVibe = async (delta: number) => {
    const newScore = INITIAL_SCORE + delta
    setRankScore(newScore)
    if (delta !== 0) {
      await supabase.from('ranks')
        .update({ score: newScore })
        .eq('game_id', selectedGame!.id)
        .eq('user_id', user!.id)
    }
    if (compareGames.length === 0) {
      setRankPhase('done')
    } else {
      setRankPhase('compare')
    }
  }

  const pickWinner = async (newGameWins: boolean) => {
    if (picking || !selectedGame || !user) return
    setPicking(true)
    setSelectedSide(newGameWins ? 'new' : 'old')

    const opponent = compareGames[compareIdx]
    const newScore = rankScore
    const oppScore = opponent.score

    const { winner, loser } = updateRatings(
      newGameWins ? newScore : oppScore,
      newGameWins ? oppScore : newScore,
    )

    const [myNew, myOpp] = newGameWins ? [winner, loser] : [loser, winner]
    setRankScore(myNew)

    await Promise.all([
      supabase.from('ranks').update({ score: myNew }).eq('game_id', selectedGame.id).eq('user_id', user.id),
      supabase.from('ranks').update({ score: myOpp }).eq('game_id', opponent.game_id).eq('user_id', user.id),
    ])

    setTimeout(() => {
      setSelectedSide(null)
      if (compareIdx + 1 >= compareGames.length) {
        setRankPhase('done')
      } else {
        setCompareIdx(prev => prev + 1)
      }
      setPicking(false)
    }, 350)
  }

  // ── STEP 1: Game search ──
  if (step === 'search') {
    const results = searchResults()
    return (
      <View style={styles.container}>
        <View style={styles.searchHeader}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
            <Text style={styles.cancel}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Select a Game</Text>
          <View style={{ width: 56 }} />
        </View>

        <View style={styles.searchBarWrap}>
          <Ionicons name="search-outline" size={18} color="#555" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search teams, leagues…"
            placeholderTextColor="#444"
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="while-editing"
          />
        </View>

        {searchLoading ? (
          <View style={styles.center}>
            <ActivityIndicator color="#e94560" size="large" />
            <Text style={styles.loadingText}>Loading games from ESPN…</Text>
          </View>
        ) : (
          <FlatList
            data={results}
            keyExtractor={item => item.id}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.resultsList}
            ListHeaderComponent={
              <Text style={styles.resultsLabel}>
                {searchQuery.trim()
                  ? `${results.length} result${results.length !== 1 ? 's' : ''}`
                  : 'Recent & upcoming games'}
              </Text>
            }
            ListEmptyComponent={
              <View style={styles.emptySearch}>
                <Text style={styles.emptySearchIcon}>🔍</Text>
                <Text style={styles.emptySearchText}>No games found</Text>
                <Text style={styles.emptySearchSub}>Try a different team or league name</Text>
              </View>
            }
            renderItem={({ item }) => <GameRow game={item} onSelect={selectGame} />}
          />
        )}
      </View>
    )
  }

  // ── STEP 3: Rank ──
  if (step === 'rank') {
    // Phase A: Vibe
    if (rankPhase === 'vibe') {
      return (
        <View style={styles.container}>
          <View style={styles.rankHeader}>
            <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
              <Text style={styles.rankSkip}>Skip</Text>
            </TouchableOpacity>
            <Text style={styles.rankHeaderTitle}>Rank It</Text>
            <View style={{ width: 40 }} />
          </View>

          <View style={styles.rankBody}>
            <View style={styles.successBadge}>
              <Ionicons name="checkmark-circle" size={20} color="#22c55e" />
              <Text style={styles.successText}>Game logged!</Text>
            </View>

            {selectedGame && (
              <View style={styles.rankedGameCard}>
                <Text style={styles.rankedLeague}>{selectedGame.league}</Text>
                <Text style={styles.rankedMatchup}>
                  {selectedGame.home_team} vs {selectedGame.away_team}
                </Text>
                {selectedGame.home_score != null && (
                  <Text style={styles.rankedFinalScore}>
                    {selectedGame.home_score} – {selectedGame.away_score}
                  </Text>
                )}
                <Text style={styles.rankedDate}>{formatDate(selectedGame.starts_at)}</Text>
              </View>
            )}

            <Text style={styles.vibeQuestion}>How was it?</Text>

            <View style={styles.vibeRow}>
              {VIBES.map(v => (
                <TouchableOpacity
                  key={v.key}
                  style={styles.vibeBtn}
                  onPress={() => pickVibe(v.delta)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.vibeEmoji}>{v.emoji}</Text>
                  <Text style={styles.vibeLabel}>{v.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {compareGames.length > 0 && (
              <Text style={styles.vibeHint}>
                Then compare against {compareGames.length} of your games
              </Text>
            )}
          </View>
        </View>
      )
    }

    // Phase B: Compare
    if (rankPhase === 'compare' && compareGames[compareIdx]) {
      const opponent = compareGames[compareIdx]
      return (
        <View style={styles.container}>
          <View style={styles.rankHeader}>
            <TouchableOpacity onPress={() => setRankPhase('done')} hitSlop={12}>
              <Text style={styles.rankSkip}>Skip</Text>
            </TouchableOpacity>
            <Text style={styles.rankHeaderTitle}>Which was better?</Text>
            <View style={{ width: 40 }} />
          </View>

          <View style={styles.rankBody}>
            <View style={styles.compareRow}>
              {/* New game */}
              <TouchableOpacity
                style={[
                  styles.compareCard,
                  selectedSide === 'new' && styles.compareCardSelected,
                ]}
                onPress={() => pickWinner(true)}
                disabled={picking}
                activeOpacity={0.75}
              >
                <View style={styles.newBadge}>
                  <Text style={styles.newBadgeText}>Just watched</Text>
                </View>
                <Text style={styles.compareLeague}>{selectedGame!.league}</Text>
                <Text style={styles.compareMatchup}>
                  {selectedGame!.home_team}{'\n'}vs{'\n'}{selectedGame!.away_team}
                </Text>
                {selectedGame!.home_score != null && (
                  <Text style={styles.compareScoreText}>
                    {selectedGame!.home_score}–{selectedGame!.away_score}
                  </Text>
                )}
              </TouchableOpacity>

              <View style={styles.vsCol}>
                <View style={styles.vsCircle}>
                  <Text style={styles.vsText}>VS</Text>
                </View>
              </View>

              {/* Opponent */}
              <TouchableOpacity
                style={[
                  styles.compareCard,
                  selectedSide === 'old' && styles.compareCardSelected,
                ]}
                onPress={() => pickWinner(false)}
                disabled={picking}
                activeOpacity={0.75}
              >
                <View style={[styles.newBadge, styles.oldBadge]}>
                  <Text style={[styles.newBadgeText, styles.oldBadgeText]}>
                    {Math.round(opponent.score)} pts
                  </Text>
                </View>
                <Text style={styles.compareLeague}>{opponent.game.league}</Text>
                <Text style={styles.compareMatchup}>
                  {opponent.game.home_team}{'\n'}vs{'\n'}{opponent.game.away_team}
                </Text>
                {opponent.game.home_score != null && (
                  <Text style={styles.compareScoreText}>
                    {opponent.game.home_score}–{opponent.game.away_score}
                  </Text>
                )}
              </TouchableOpacity>
            </View>

            {/* Progress dots */}
            <View style={styles.dots}>
              {compareGames.map((_, i) => (
                <View
                  key={i}
                  style={[
                    styles.dot,
                    i < compareIdx  && styles.dotDone,
                    i === compareIdx && styles.dotActive,
                  ]}
                />
              ))}
            </View>

            <Text style={styles.compareHint}>
              Tap the game you enjoyed more
            </Text>
          </View>
        </View>
      )
    }

    // Phase C: Done
    return (
      <View style={[styles.container, styles.doneWrap]}>
        <Text style={styles.doneEmoji}>🏆</Text>
        <Text style={styles.doneTitle}>Rankings updated!</Text>
        <Text style={styles.doneSub}>
          Check your Rankings tab to see where it lands
        </Text>
        <TouchableOpacity style={styles.doneBtn} onPress={() => router.back()}>
          <Text style={styles.doneBtnText}>Done</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.doneSecondary}
          onPress={() => {
            router.back()
            setTimeout(() => router.push('/(tabs)/rank'), 100)
          }}
        >
          <Text style={styles.doneSecondaryText}>View Rankings →</Text>
        </TouchableOpacity>
      </View>
    )
  }

  // ── STEP 2: Log details ──
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => isPrefilled ? router.back() : setStep('search')}
            hitSlop={12}
          >
            <Text style={styles.cancel}>{isPrefilled ? 'Cancel' : '← Back'}</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Log Game</Text>
          <TouchableOpacity onPress={onSave} disabled={saving} hitSlop={12}>
            <Text style={[styles.save, saving && styles.saveDisabled]}>
              {saving ? 'Saving…' : 'Save'}
            </Text>
          </TouchableOpacity>
        </View>

        {selectedGame && (
          <View style={styles.gameBanner}>
            <View style={styles.gameBannerInfo}>
              <Text style={styles.gameBannerLeague}>{selectedGame.league}</Text>
              <Text style={styles.gameBannerMatchup}>
                {selectedGame.home_team} vs {selectedGame.away_team}
              </Text>
              <Text style={styles.gameBannerDate}>
                {formatDate(selectedGame.starts_at)}
              </Text>
            </View>
            {!isPrefilled && (
              <TouchableOpacity
                style={styles.changeBtn}
                onPress={() => setStep('search')}
              >
                <Text style={styles.changeBtnText}>Change</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        <Text style={styles.sectionLabel}>How did you watch?</Text>
        <View style={styles.chips}>
          {WATCHED_VIA.map(w => (
            <TouchableOpacity
              key={w.key}
              style={[styles.chip, watchedVia === w.key && styles.chipActive]}
              onPress={() => setWatchedVia(watchedVia === w.key ? null : w.key)}
            >
              <Text style={[styles.chipText, watchedVia === w.key && styles.chipTextActive]}>
                {w.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.sectionLabel}>Reaction</Text>
        <View style={styles.reactionGrid}>
          {REACTIONS.map(r => (
            <TouchableOpacity
              key={r}
              style={[styles.reactionBtn, reaction === r && styles.reactionBtnActive]}
              onPress={() => setReaction(reaction === r ? null : r)}
            >
              <Text style={styles.reactionEmoji}>{r}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.sectionLabel}>Review</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder="What made this game memorable? Atmosphere, key moments, the result…"
          placeholderTextColor="#444"
          value={review}
          onChangeText={setReview}
          multiline
          numberOfLines={5}
          textAlignVertical="top"
        />

        <View style={styles.toggleRow}>
          <View>
            <Text style={styles.toggleLabel}>Spoiler-free</Text>
            <Text style={styles.toggleHint}>Hide the score in your friends' feed</Text>
          </View>
          <Switch
            value={spoilerFree}
            onValueChange={setSpoilerFree}
            trackColor={{ false: '#1e1e38', true: '#e94560' }}
            thumbColor="#fff"
          />
        </View>

        {alreadyLogged && (
          <View style={styles.alreadyBox}>
            <View style={styles.alreadyBoxTop}>
              <Ionicons name="checkmark-circle" size={18} color="#f59e0b" />
              <Text style={styles.alreadyTitle}>Already in your logbook</Text>
            </View>
            <Text style={styles.alreadySub}>
              You've logged this game before. Head to your Logbook to update it.
            </Text>
            <TouchableOpacity
              style={styles.alreadyBtn}
              onPress={() => { router.back(); setTimeout(() => router.push('/(tabs)/logbook'), 50) }}
            >
              <Text style={styles.alreadyBtnText}>View Logbook →</Text>
            </TouchableOpacity>
          </View>
        )}

        {error ? (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle" size={16} color="#e94560" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

function GameRow({ game, onSelect }: { game: Game; onSelect: (g: Game) => void }) {
  const isLive  = game.status === 'live'
  const isFinal = game.status === 'final'

  return (
    <TouchableOpacity style={styles.gameRow} onPress={() => onSelect(game)} activeOpacity={0.7}>
      <View style={styles.gameRowLeft}>
        <View style={styles.gameRowLeagueRow}>
          <Text style={styles.gameRowLeague}>{game.league}</Text>
          {isLive && (
            <View style={styles.liveChip}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>LIVE</Text>
            </View>
          )}
        </View>
        <Text style={styles.gameRowMatchup}>{game.home_team} vs {game.away_team}</Text>
        <Text style={styles.gameRowDate}>{formatDate(game.starts_at)}</Text>
      </View>
      <View style={styles.gameRowRight}>
        {isFinal && game.home_score != null ? (
          <Text style={styles.gameRowScore}>{game.home_score}–{game.away_score}</Text>
        ) : isLive && game.home_score != null ? (
          <Text style={styles.gameRowScoreLive}>{game.home_score}–{game.away_score}</Text>
        ) : null}
        <Ionicons name="chevron-forward" size={16} color="#333" />
      </View>
    </TouchableOpacity>
  )
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  const today     = new Date()
  const tomorrow  = new Date()
  const yesterday = new Date()
  tomorrow.setDate(today.getDate() + 1)
  yesterday.setDate(today.getDate() - 1)

  if (d.toDateString() === today.toDateString())
    return `Today · ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
  if (d.toDateString() === tomorrow.toDateString())
    return `Tomorrow · ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0f' },

  // ── Search step ──
  searchHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  searchBarWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111120',
    borderRadius: 14,
    marginHorizontal: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#1e1e38',
    paddingHorizontal: 14,
  },
  searchIcon: { marginRight: 8 },
  searchInput: {
    flex: 1,
    color: '#fff',
    fontSize: 16,
    paddingVertical: 14,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
  loadingText: { color: '#555', fontSize: 14 },
  resultsList: { paddingHorizontal: 16, paddingBottom: 40 },
  resultsLabel: { fontSize: 12, color: '#444', fontWeight: '600', paddingVertical: 8 },
  emptySearch: { alignItems: 'center', paddingTop: 60, gap: 8 },
  emptySearchIcon: { fontSize: 40 },
  emptySearchText: { fontSize: 18, fontWeight: '700', color: '#fff' },
  emptySearchSub: { fontSize: 13, color: '#555' },
  gameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111120',
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#1e1e38',
  },
  gameRowLeft: { flex: 1 },
  gameRowLeagueRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 3 },
  gameRowLeague: {
    fontSize: 10, fontWeight: '700', color: '#555',
    textTransform: 'uppercase', letterSpacing: 0.8,
  },
  liveChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#1a0a10', borderRadius: 4,
    paddingHorizontal: 5, paddingVertical: 2,
    borderWidth: 1, borderColor: '#e94560',
  },
  liveDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: '#e94560' },
  liveText: { fontSize: 9, fontWeight: '800', color: '#e94560', letterSpacing: 0.5 },
  gameRowMatchup: { fontSize: 15, fontWeight: '700', color: '#fff' },
  gameRowDate: { fontSize: 12, color: '#444', marginTop: 3 },
  gameRowRight: { flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 10 },
  gameRowScore: { fontSize: 14, fontWeight: '700', color: '#888' },
  gameRowScoreLive: { fontSize: 14, fontWeight: '800', color: '#e94560' },

  // ── Details step ──
  content: { paddingHorizontal: 20, paddingBottom: 60 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 16, paddingBottom: 20,
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#fff' },
  cancel: { fontSize: 16, color: '#666' },
  save: { fontSize: 16, fontWeight: '700', color: '#e94560' },
  saveDisabled: { opacity: 0.4 },
  gameBanner: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#140a10', borderRadius: 16,
    borderWidth: 1, borderColor: '#2a0e1a',
    padding: 16, marginBottom: 6, gap: 12,
  },
  gameBannerInfo: { flex: 1 },
  gameBannerLeague: {
    fontSize: 10, fontWeight: '700', color: '#e94560',
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4,
  },
  gameBannerMatchup: { fontSize: 16, fontWeight: '800', color: '#fff' },
  gameBannerDate: { fontSize: 12, color: '#666', marginTop: 3 },
  changeBtn: { borderWidth: 1, borderColor: '#2a0e1a', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  changeBtnText: { fontSize: 12, color: '#e94560', fontWeight: '600' },
  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: '#555', letterSpacing: 0.8,
    textTransform: 'uppercase', marginTop: 22, marginBottom: 10,
  },
  input: {
    backgroundColor: '#111120', borderRadius: 14,
    paddingHorizontal: 16, paddingVertical: 14,
    color: '#fff', fontSize: 15,
    borderWidth: 1, borderColor: '#1e1e38', marginBottom: 10,
  },
  textArea: { height: 120, marginBottom: 0 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderRadius: 20, borderWidth: 1, borderColor: '#1e1e38',
    paddingHorizontal: 14, paddingVertical: 9, backgroundColor: '#111120',
  },
  chipActive: { backgroundColor: '#e94560', borderColor: '#e94560' },
  chipText: { color: '#666', fontSize: 14 },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  reactionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  reactionBtn: {
    width: 52, height: 52, borderRadius: 14,
    backgroundColor: '#111120', borderWidth: 1, borderColor: '#1e1e38',
    alignItems: 'center', justifyContent: 'center',
  },
  reactionBtnActive: { backgroundColor: '#1e0a1e', borderColor: '#e94560' },
  reactionEmoji: { fontSize: 24 },
  toggleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: 22, backgroundColor: '#111120', borderRadius: 14,
    padding: 16, borderWidth: 1, borderColor: '#1e1e38',
  },
  toggleLabel: { fontSize: 15, fontWeight: '600', color: '#fff' },
  toggleHint: { fontSize: 12, color: '#555', marginTop: 3 },
  alreadyBox: {
    marginTop: 16, backgroundColor: '#1c1500', borderRadius: 14,
    padding: 14, borderWidth: 1, borderColor: '#3d2e00', gap: 6,
  },
  alreadyBoxTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  alreadyTitle: { fontSize: 15, fontWeight: '700', color: '#f59e0b' },
  alreadySub: { fontSize: 13, color: '#a37a1a', lineHeight: 19 },
  alreadyBtn: { alignSelf: 'flex-start', marginTop: 4 },
  alreadyBtnText: { fontSize: 13, fontWeight: '700', color: '#f59e0b' },
  errorBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginTop: 16, backgroundColor: '#1a0a10', borderRadius: 12,
    padding: 14, borderWidth: 1, borderColor: '#2a0e1a',
  },
  errorText: { color: '#e94560', fontSize: 14, flex: 1 },

  // ── Rank step shared ──
  rankHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8,
  },
  rankHeaderTitle: { fontSize: 17, fontWeight: '700', color: '#fff' },
  rankSkip: { fontSize: 16, color: '#444' },
  rankBody: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 24, paddingBottom: 40,
  },

  // ── Vibe phase ──
  successBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#0a1f12', borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 7,
    borderWidth: 1, borderColor: '#155e2d',
    marginBottom: 24,
  },
  successText: { color: '#22c55e', fontWeight: '700', fontSize: 14 },
  rankedGameCard: {
    width: '100%', backgroundColor: '#111120', borderRadius: 20,
    borderWidth: 1, borderColor: '#1e1e38', padding: 20,
    alignItems: 'center', marginBottom: 32, gap: 4,
  },
  rankedLeague: {
    fontSize: 11, fontWeight: '700', color: '#e94560',
    textTransform: 'uppercase', letterSpacing: 1,
  },
  rankedMatchup: {
    fontSize: 22, fontWeight: '800', color: '#fff',
    textAlign: 'center', marginTop: 4, lineHeight: 28,
  },
  rankedFinalScore: { fontSize: 16, fontWeight: '700', color: '#888', marginTop: 2 },
  rankedDate: { fontSize: 13, color: '#444', marginTop: 2 },
  vibeQuestion: {
    fontSize: 15, fontWeight: '700', color: '#fff',
    marginBottom: 16, textAlign: 'center',
  },
  vibeRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  vibeBtn: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#111120', borderRadius: 18,
    borderWidth: 1, borderColor: '#1e1e38',
    paddingVertical: 18,
  },
  vibeEmoji: { fontSize: 30 },
  vibeLabel: { fontSize: 12, fontWeight: '700', color: '#666', marginTop: 6 },
  vibeHint: { fontSize: 13, color: '#444', textAlign: 'center' },

  // ── Compare phase ──
  compareRow: {
    flexDirection: 'row', alignItems: 'center',
    width: '100%', gap: 0,
  },
  compareCard: {
    flex: 1, backgroundColor: '#111120', borderRadius: 20,
    borderWidth: 1.5, borderColor: '#1e1e38',
    padding: 16, minHeight: 200,
    alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  compareCardSelected: {
    borderColor: '#e94560',
    backgroundColor: '#1a0a10',
  },
  newBadge: {
    backgroundColor: '#e94560', borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 3, marginBottom: 4,
  },
  newBadgeText: { fontSize: 10, fontWeight: '800', color: '#fff', letterSpacing: 0.5 },
  oldBadge: { backgroundColor: '#1e1e38' },
  oldBadgeText: { color: '#888' },
  compareLeague: {
    fontSize: 10, fontWeight: '700', color: '#555',
    textTransform: 'uppercase', letterSpacing: 0.8,
  },
  compareMatchup: {
    fontSize: 15, fontWeight: '800', color: '#fff',
    textAlign: 'center', lineHeight: 21,
  },
  compareScoreText: { fontSize: 14, fontWeight: '700', color: '#666' },
  vsCol: { width: 40, alignItems: 'center' },
  vsCircle: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: '#1e1e38',
    alignItems: 'center', justifyContent: 'center',
  },
  vsText: { fontSize: 10, fontWeight: '900', color: '#444', letterSpacing: 0.5 },
  dots: { flexDirection: 'row', gap: 8, marginTop: 28 },
  dot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: '#1e1e38',
  },
  dotActive: { backgroundColor: '#e94560', width: 24 },
  dotDone: { backgroundColor: '#3a3a5a' },
  compareHint: { fontSize: 13, color: '#444', marginTop: 14 },

  // ── Done phase ──
  doneWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  doneEmoji: { fontSize: 64, marginBottom: 16 },
  doneTitle: { fontSize: 26, fontWeight: '800', color: '#fff', textAlign: 'center' },
  doneSub: { fontSize: 15, color: '#555', textAlign: 'center', marginTop: 8, lineHeight: 22 },
  doneBtn: {
    backgroundColor: '#e94560', borderRadius: 16,
    paddingHorizontal: 40, paddingVertical: 16, marginTop: 32,
  },
  doneBtnText: { color: '#fff', fontWeight: '800', fontSize: 17 },
  doneSecondary: { marginTop: 16 },
  doneSecondaryText: { color: '#e94560', fontSize: 15, fontWeight: '600' },
})
