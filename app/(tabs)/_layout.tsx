import { useAuth } from '@clerk/clerk-expo'
import { Ionicons } from '@expo/vector-icons'
import { Redirect, Tabs, router } from 'expo-router'
import { TouchableOpacity, View } from 'react-native'

export default function TabsLayout() {
  const { isSignedIn, isLoaded } = useAuth()

  if (!isLoaded) return null
  if (!isSignedIn) return <Redirect href="/(auth)/sign-in" />

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#0d0d1a',
          borderTopColor: '#1a1a2e',
          borderTopWidth: 1,
          height: 82,
          paddingBottom: 22,
          paddingTop: 10,
        },
        tabBarActiveTintColor: '#e94560',
        tabBarInactiveTintColor: '#3a3a5a',
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          letterSpacing: 0.2,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Explore',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'search' : 'search-outline'} size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="rank"
        options={{
          title: 'Rankings',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'trophy' : 'trophy-outline'} size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="log"
        options={{
          title: '',
          tabBarIcon: () => (
            <View
              style={{
                width: 50,
                height: 50,
                borderRadius: 25,
                backgroundColor: '#e94560',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 18,
                shadowColor: '#e94560',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.5,
                shadowRadius: 8,
                elevation: 8,
              }}
            >
              <Ionicons name="add" size={30} color="#fff" />
            </View>
          ),
          tabBarButton: props => (
            <TouchableOpacity
              style={props.style as any}
              onPress={() => router.push('/log-game')}
              activeOpacity={0.75}
            >
              {props.children}
            </TouchableOpacity>
          ),
        }}
      />
      <Tabs.Screen
        name="logbook"
        options={{
          title: 'Logbook',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'journal' : 'journal-outline'} size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'person' : 'person-outline'} size={22} color={color} />
          ),
        }}
      />
    </Tabs>
  )
}
