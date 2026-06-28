import 'react-native-get-random-values'
import { ClerkProvider } from '@clerk/clerk-expo'
import { Stack } from 'expo-router'
import { tokenCache } from '../lib/tokenCache'

export default function RootLayout() {
  return (
    <ClerkProvider
      publishableKey={process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!}
      tokenCache={tokenCache}
    >
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="log-game" options={{ presentation: 'modal' }} />
      </Stack>
    </ClerkProvider>
  )
}
