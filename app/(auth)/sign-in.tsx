import { useSignIn } from '@clerk/clerk-expo'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'

export default function SignIn() {
  const { signIn, setActive, isLoaded } = useSignIn()
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const onSignIn = async () => {
    if (!isLoaded) return
    setLoading(true)
    setError('')
    try {
      const result = await signIn.create({ identifier: email, password })
      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId })
        router.replace('/(tabs)/')
      }
    } catch (err: any) {
      setError(err.errors?.[0]?.message ?? err.message ?? 'Sign in failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}
    >
      <View style={styles.inner}>
        <Text style={styles.wordmark}>SportLog</Text>
        <Text style={styles.tagline}>Track every game you watch</Text>

        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor="#555"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          returnKeyType="next"
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor="#555"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          returnKeyType="done"
          onSubmitEditing={onSignIn}
        />

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={onSignIn}
          disabled={loading}
        >
          <Text style={styles.buttonText}>{loading ? 'Signing in…' : 'Sign In'}</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.push('/(auth)/sign-up')}>
          <Text style={styles.link}>
            Don't have an account? <Text style={styles.linkAccent}>Sign up</Text>
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0f',
  },
  inner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    gap: 12,
  },
  wordmark: {
    fontSize: 40,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: -1.5,
    marginBottom: 4,
  },
  tagline: {
    fontSize: 15,
    color: '#666',
    marginBottom: 28,
  },
  input: {
    width: '100%',
    backgroundColor: '#131320',
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 16,
    color: '#fff',
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#1e1e3a',
  },
  errorText: {
    color: '#e94560',
    fontSize: 14,
    textAlign: 'center',
    width: '100%',
  },
  button: {
    width: '100%',
    backgroundColor: '#e94560',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 6,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  link: {
    color: '#555',
    fontSize: 14,
    marginTop: 6,
  },
  linkAccent: {
    color: '#e94560',
    fontWeight: '600',
  },
})
