import { supabase } from './supabase'

// Kept as a hook for API compatibility with existing screens; the client is
// a stable singleton so it never causes re-renders or effect re-runs.
export function useSupabase() {
  return supabase
}
