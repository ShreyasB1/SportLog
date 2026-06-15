import { useAuth } from '@clerk/clerk-expo'
import { createClient } from '@supabase/supabase-js'
import { useMemo } from 'react'

// Supabase client authenticated as the current Clerk user.
// Uses Supabase's native third-party auth: the accessToken getter returns the
// Clerk session JWT, which Supabase verifies via Clerk's JWKS endpoint.
// RLS policies key off auth.jwt()->>'sub' (the Clerk user id, a TEXT string).
// auth.uid() does NOT work with Clerk because Clerk ids are not UUIDs.
export function useSupabase() {
  const { getToken } = useAuth()

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
          accessToken: async () => (await getToken()) ?? null,
        },
      ),
    [getToken],
  )
}
