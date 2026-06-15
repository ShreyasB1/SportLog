import { useSignUp } from '@clerk/clerk-expo'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import {
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'

export default function VerifyEmail() {
  const { signUp, setActive, isLoaded } = useSignUp()
  const router = useRouter()
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)

  const onVerify = async () => {
    if (!isLoaded) return
    setLoading(true)
    try {
      const result = await signUp.attemptEmailAddressVerification({ code })
      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId })
        router.replace('/(tabs)/')
      }
    } catch (err: any) {
      Alert.alert('Verification failed', err.errors?.[0]?.message ?? err.message)
    } finally {
      setLoading(false)
    }
  }

  const onResend = async () => {
    if (!isLoaded) return
    try {
      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' })
      Alert.alert('Code resent', 'Check your email for a new code.')
    } catch (err: any) {
      Alert.alert('Error', err.errors?.[0]?.message ?? err.message)
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Check your email</Text>
      <Text style={styles.subtitle}>
        We sent a 6-digit code to verify your account.
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
