import { useLocalSearchParams, useRouter } from 'expo-router'
import { useState } from 'react'
import {
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { supabase } from '../../lib/supabase'

export default function VerifyEmail() {
  const router = useRouter()
  const { email } = useLocalSearchParams<{ email: string }>()
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)

  const onVerify = async () => {
    if (!email) return
    setLoading(true)
    const { error } = await supabase.auth.verifyOtp({
      email,
      token: code,
      type: 'signup',
    })
    setLoading(false)
    if (error) {
      Alert.alert('Verification failed', error.message)
      return
    }
    // verifyOtp establishes a session; (auth)/_layout redirects, but replace
    // explicitly so back navigation doesn't return here.
    router.replace('/(tabs)')
  }

  const onResend = async () => {
    if (!email) return
    const { error } = await supabase.auth.resend({ type: 'signup', email })
    if (error) {
      Alert.alert('Error', error.message)
    } else {
      Alert.alert('Code resent', 'Check your email for a new code.')
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Check your email</Text>
      <Text style={styles.subtitle}>
        We sent a 6-digit code to {email ?? 'your email'}.
      </Text>

      <TextInput
        style={styles.codeInput}
        placeholder="000000"
        placeholderTextColor="#333"
        value={code}
        onChangeText={setCode}
        keyboardType="number-pad"
        maxLength={6}
        textAlign="center"
        returnKeyType="done"
        onSubmitEditing={onVerify}
        autoFocus
      />

      <TouchableOpacity
        style={[styles.button, (loading || code.length < 6) && styles.buttonDisabled]}
        onPress={onVerify}
        disabled={loading || code.length < 6}
      >
        <Text style={styles.buttonText}>{loading ? 'Verifying…' : 'Verify'}</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={onResend}>
        <Text style={styles.link}>Didn't get it? <Text style={styles.linkAccent}>Resend code</Text></Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0f',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    gap: 14,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#fff',
  },
  subtitle: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 22,
  },
  codeInput: {
    width: '100%',
    backgroundColor: '#131320',
    borderRadius: 14,
    paddingVertical: 20,
    color: '#fff',
    fontSize: 36,
    fontWeight: '700',
    letterSpacing: 14,
    borderWidth: 1,
    borderColor: '#1e1e3a',
  },
  button: {
    width: '100%',
    backgroundColor: '#e94560',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  link: {
    color: '#555',
    fontSize: 14,
  },
  linkAccent: {
    color: '#e94560',
    fontWeight: '600',
  },
  backBtn: {
    marginTop: 8,
  },
  backText: {
    color: '#555',
    fontSize: 14,
  },
})
