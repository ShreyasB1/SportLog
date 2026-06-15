import { useState } from 'react'
import {
  Alert,
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
import { router } from 'expo-router'
import { useUser } from '@clerk/clerk-expo'
import { useSupabase } from '../lib/useSupabase'
import { INITIAL_SCORE } from '../lib/elo'

const REACTIONS = ['🔥', '😱', '😤', '💤', '🏆', '💔', '🤯', '👏', '😴', '⚡', '🫶', '😬']

const WATCHED_VIA = [
  { key: 'live', label: '📺 Live TV' },
  { key: 'venue', label: '🏟️ Venue' },
  { key: 'replay', label: '⏪ Replay' },
  { key: 'highlights', label: '✂️ Highlights' },
  { key: 'bar', label: '🍺 Bar' },
]

export default function LogGame() {
  const supabase = useSupabase()
  const { user } = useUser()

  const [homeTeam, setHomeTeam] = useState('')
  const [awayTeam, setAwayTeam] = useState('')
  const [league, setLeague] = useState('')
  const [date, setDate] = useState('')
  const [watchedVia, setWatchedVia] = useState<string | null>(null)
  const [reaction, setReaction] = useState<string | null>(null)
  const [review, setReview] = useState('')
  const [spoilerFree, setSpoilerFree] = useState(true)
  const [loading, setLoading] = useState(false)

  const onSave = async () => {
    if (!homeTeam.trim() || !awayTeam.trim() || !league.trim()) {
      Alert.alert('Missing info', 'League, home team, and away team are required.')
      return
    }

    setLoading(true)
    try {
      const slug = [league, homeTeam, awayTeam, date || 'nd']
        .map(s => s.toLowerCase().replace(/\s+/g, '-'))
        .join('_')
      const gameId = `manual-${slug}`
      const startsAt = date
        ? new Date(date).toISOString()
        : new Date().toISOString()

      // Insert the game (policy: authenticated users may insert rows where id starts with 'manual-')
      const { error: gameErr } = await supabase.from('games').upsert({
        id: gameId,
        league: league.trim(),
        home_team: homeTeam.trim(),
        away_team: awayTeam.trim(),
        starts_at: startsAt,
        status: 'final',
        updated_at: new Date().toISOString(),
      })
      if (gameErr) throw gameErr

      // Create the log entry (user_id filled by DB default auth.jwt()->>'sub')
      const { error: logErr } = await supabase.from('logs').insert({
        game_id: gameId,
        watched_via: watchedVia,
        review: review.trim() || null,
        reaction,
        spoiler_free: spoilerFree,
      })
      if (logErr) throw logErr

      // Seed rank with initial Elo score (upsert in case they re-log a game)
      await supabase.from('ranks').upsert(
        { game_id: gameId, user_id: user?.id, score: INITIAL_SCORE },
        { onConflict: 'user_id,game_id', ignoreDuplicates: true },
      )

      router.back()
    } catch (err: any) {
      Alert.alert('Could not save', err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {/* header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
            <Text style={styles.cancel}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Log Game</Text>
          <TouchableOpacity onPress={onSave} disabled={loading} hitSlop={12}>
            <Text style={[styles.save, loading && styles.saveDisabled]}>
              {loading ? 'Saving…' : 'Save'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* game details */}
        <Text style={styles.sectionLabel}>Game</Text>
        <TextInput
          style={styles.input}
          placeholder="League  (NBA, NFL, EPL…)"
          placeholderTextColor="#444"
          value={league}
          onChangeText={setLeague}
        />
        <View style={styles.row}>
          <TextInput
            style={[styles.input, styles.half]}
            placeholder="Home team"
            placeholderTextColor="#444"
            value={homeTeam}
            onChangeText={setHomeTeam}
          />
          <TextInput
            style={[styles.input, styles.half]}
            placeholder="Away team"
            placeholderTextColor="#444"
            value={awayTeam}
            onChangeText={setAwayTeam}
          />
        </View>
        <TextInput
          style={styles.input}
          placeholder="Date  (YYYY-MM-DD, optional)"
          placeholderTextColor="#444"
          value={date}
          onChangeText={setDate}
          keyboardType="numbers-and-punctuation"
        />

        {/* how did you watch */}
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

        {/* reaction */}
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

        {/* review */}
        <Text style={styles.sectionLabel}>Review  (optional)</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder="What made this game memorable?"
          placeholderTextColor="#444"
          value={review}
          onChangeText={setReview}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
        />

        {/* spoiler toggle */}
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
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0f' },
  content: { paddingHorizontal: 20, paddingBottom: 60 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 16,
    paddingBottom: 24,
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#fff' },
  cancel: { fontSize: 16, color: '#666' },
  save: { fontSize: 16, fontWeight: '700', color: '#e94560' },
  saveDisabled: { opacity: 0.4 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#555',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginTop: 22,
    marginBottom: 10,
  },
  input: {
    backgroundColor: '#111120',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#fff',
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#1e1e38',
    marginBottom: 10,
  },
  row: { flexDirection: 'row', gap: 10 },
  half: { flex: 1 },
  textArea: { height: 110, marginBottom: 0 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#1e1e38',
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: '#111120',
  },
  chipActive: { backgroundColor: '#e94560', borderColor: '#e94560' },
  chipText: { color: '#666', fontSize: 14 },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  reactionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  reactionBtn: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: '#111120',
    borderWidth: 1,
    borderColor: '#1e1e38',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reactionBtnActive: { backgroundColor: '#1e0a1e', borderColor: '#e94560' },
  reactionEmoji: { fontSize: 24 },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 22,
    backgroundColor: '#111120',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1e1e38',
  },
  toggleLabel: { fontSize: 15, fontWeight: '600', color: '#fff' },
  toggleHint: { fontSize: 12, color: '#555', marginTop: 3 },
})
