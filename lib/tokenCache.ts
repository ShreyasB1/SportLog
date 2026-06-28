import * as SecureStore from 'expo-secure-store'
import { Platform } from 'react-native'

export const tokenCache =
  Platform.OS === 'web'
    ? {
        async getToken(key: string) {
          return localStorage.getItem(key)
        },
        async saveToken(key: string, value: string) {
          localStorage.setItem(key, value)
        },
      }
    : {
        async getToken(key: string) {
          try {
            return await SecureStore.getItemAsync(key)
          } catch {
            return null
          }
        },
        async saveToken(key: string, value: string) {
          try {
            await SecureStore.setItemAsync(key, value)
          } catch {
            // ignore write failures — auth will re-prompt
          }
        },
      }
