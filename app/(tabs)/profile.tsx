import { useAuth, useUser } from '@clerk/clerk-expo'
import { router } from 'expo-router'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'

export default function Profile() {
  const { user } = useUser()
  const { signOut } = useAuth()

  const handleSignOut = async () => {
    await signOut()
    router.replace('/(auth)/sign-in')
  }

  const initials = (
    user?.username ??
    user?.emailAddresses[0]?.emailAddress ??
    '?'
  )[0].toUpperCase()

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Profile</Text>

      <View style={styles.card}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <Text style={styles.username}>{user?.username ?? 'Anonymous'}</Text>
        <Text style={styles.email}>
          {user?.emailAddresses[0]?.emailAddress}
        </Text>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0f' },
  title: {
    fontSize: 30,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.5,
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 24,
  },
  card: {
    alignItems: 'center',
    paddingVertical: 32,
    marginHorizontal: 16,
    backgroundColor: '#111120',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#1e1e38',
    gap: 6,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#e94560',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  avatarText: { fontSize: 34, fontWeight: '800', color: '#fff' },
  username: { fontSize: 22, fontWeight: '700', color: '#fff' },
  email: { fontSize: 14, color: '#555' },
  actions: { margin: 16, marginTop: 24 },
  signOutBtn: {
    backgroundColor: '#111120',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1e1e38',
  },
  signOutText: { color: '#e94560', fontSize: 16, fontWeight: '700' },
})
