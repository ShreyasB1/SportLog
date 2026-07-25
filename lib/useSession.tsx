import type { Session } from '@supabase/supabase-js'
import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from './supabase'

interface SessionState {
  session: Session | null
  isLoaded: boolean
}

const SessionContext = createContext<SessionState>({ session: null, isLoaded: false })

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<SessionState>({ session: null, isLoaded: false })

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setState({ session: data.session, isLoaded: true })
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setState({ session, isLoaded: true })
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  return <SessionContext.Provider value={state}>{children}</SessionContext.Provider>
}

export function useSession() {
  return useContext(SessionContext)
}

/** Convenience accessor for the signed-in user (null while signed out). */
export function useUser() {
  const { session } = useSession()
  return session?.user ?? null
}
