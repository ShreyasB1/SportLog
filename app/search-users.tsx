import { router } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  FlatList,
  Image,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useUser } from '../lib/useSession'
import { useSupabase } from '../lib/useSupabase'
import type { Profile } from '../lib/types'

export default function SearchUsers() {
  const supabase = useSupabase()
  const user = useUser()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Profile[]>([])
  const [searched, setSearched] = useState(false)
  const searchSeq = useRef(0)

  const runSearch = useCallback(async (q: string) => {
    const seq = ++searchSeq.current
    const trimmed = q.trim()
    if (trimmed.length < 2) {
      setResults([])
      setSearched(false)
      return
    }
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .or(`username.ilike.%${trimmed}%,display_name.ilike.%${trimmed}%`)
      .neq('id', user?.id ?? '')
      .limit(25)
    if (seq !== searchSeq.current) return // stale response
    setResults((data as Profile[]) ?? [])
    setSearched(true)
  }, [supabase, user])

  // Debounced search-as-you-type
  useEffect(() => {
    const t = setTimeout(() => runSearch(query), 300)
    return () => clearTimeout(t)
  }, [query, runSearch])

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.title}>Find Friends</Text>
        <View style={styles.backBtn} />
      </View>

      <View style={styles.searchBox}>
        <Ionicons name="search" size={16} color="#555" />
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Search by username or name"
          placeholderTextColor="#444"
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery('')}>
            <Ionicons name="close-circle" size={16} color="#555" />
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={results}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          searched ? (
            <Text style={styles.emptyText}>No users match “{query.trim()}”</Text>
          ) : (
            <Text style={styles.emptyText}>Type at least 2 characters to search</Text>
          )
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
              <Ionicons name="chevron-forward" size={16} color="#3a3a5a" />
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
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginBottom: 10,
    backgroundColor: '#111120', borderWidth: 1, borderColor: '#1e1e38',
    borderRadius: 12, paddingHorizontal: 12,
  },
  searchInput: { flex: 1, color: '#fff', fontSize: 15, paddingVertical: 12 },
  list: { paddingBottom: 40 },
  emptyText: { color: '#444', fontSize: 14, textAlign: 'center', marginTop: 32 },
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
})
