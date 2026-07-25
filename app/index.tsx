import { Redirect } from 'expo-router'
import { ActivityIndicator, View } from 'react-native'
import { useSession } from '../lib/useSession'

export default function Index() {
  const { session, isLoaded } = useSession()

  if (!isLoaded) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0a0a0f', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#e94560" size="large" />
      </View>
    )
  }

  return <Redirect href={session ? '/(tabs)' : '/(auth)/sign-in'} />
}
