import 'react-native-get-random-values'
import * as Sentry from '@sentry/react-native'
import { ClerkProvider } from '@clerk/clerk-expo'
import { Stack } from 'expo-router'
import { tokenCache } from '../lib/tokenCache'

Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  sendDefaultPii: false,
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,
})

function RootLayout() {
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

export default Sentry.wrap(RootLayout)
