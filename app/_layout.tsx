import 'react-native-get-random-values'
import { Stack } from 'expo-router'
import { SessionProvider } from '../lib/useSession'

export default function RootLayout() {
  return (
    <SessionProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="log-game" options={{ presentation: 'modal' }} />
      </Stack>
    </SessionProvider>
  )
}
