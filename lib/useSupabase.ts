import { useAuth } from '@clerk/clerk-expo'
import { createClient } from '@supabase/supabase-js'
import { useEffect, useMemo, useRef } from 'react'

export function useSupabase() {
  const { getToken } = useAuth()
  const getTokenRef = useRef(getToken)

  useEffect(() => {
    getTokenRef.current = getToken
  })

  return useMemo(
    () =>
      createClient(
        process.env.EXPO_PUBLIC_SUPABASE_URL!,
        process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
        {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
          },
          accessToken: async () => (await getTokenRef.current()) ?? null,
        },
      ),
    [],
  )
}
