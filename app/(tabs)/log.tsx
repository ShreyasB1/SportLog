import { View } from 'react-native'

// This screen is never rendered — the tab button is overridden in _layout.tsx
// to open the log-game modal directly via tabBarButton.
export default function LogScreen() {
  return <View style={{ flex: 1, backgroundColor: '#0a0a0f' }} />
}
