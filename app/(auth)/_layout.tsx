import { Redirect, Stack } from 'expo-router'
import { useSession } from '../../lib/useSession'

export default function AuthLayout() {
  const { session, isLoaded } = useSession()

  if (!isLoaded) return null
  if (session) return <Redirect href="/(tabs)" />

  return <Stack screenOptions={{ headerShown: false }} />
}
