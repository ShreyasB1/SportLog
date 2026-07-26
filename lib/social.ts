import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Blocking, muting, and follower removal.
 *
 * Blocks are enforced by RLS (migration 0009): a blocked user cannot follow
 * you, and disappears from your profile and pick queries entirely. The client
 * never needs to filter them out.
 *
 * Mutes are the opposite -- deliberately invisible to the muted user, so there
 * is nothing for the database to hide. Screens that list people call
 * fetchMutedIds and filter locally.
 */

/** Ids this user has muted. Blocks are handled by RLS and are not included. */
export async function fetchMutedIds(
  supabase: SupabaseClient,
  meId: string,
): Promise<Set<string>> {
  const { data } = await supabase.from('mutes').select('muted_id').eq('muter_id', meId)
  return new Set(((data ?? []) as { muted_id: string }[]).map(m => m.muted_id))
}

export interface BlockedProfile {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
}

/**
 * Accounts this user has blocked, for the management screen.
 *
 * Goes through an RPC rather than selecting from profiles: blocking hides the
 * two accounts from each other, so a plain profiles query would return nothing
 * and you could never see who you had blocked.
 */
export async function fetchBlockedProfiles(
  supabase: SupabaseClient,
): Promise<BlockedProfile[]> {
  const { data } = await supabase.rpc('blocked_profiles')
  return (data ?? []) as BlockedProfile[]
}

export async function isBlocked(
  supabase: SupabaseClient,
  meId: string,
  otherId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from('blocks')
    .select('blocked_id')
    .eq('blocker_id', meId)
    .eq('blocked_id', otherId)
    .limit(1)
  return ((data ?? []) as unknown[]).length > 0
}

export async function isMuted(
  supabase: SupabaseClient,
  meId: string,
  otherId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from('mutes')
    .select('muted_id')
    .eq('muter_id', meId)
    .eq('muted_id', otherId)
    .limit(1)
  return ((data ?? []) as unknown[]).length > 0
}

/**
 * Sever the follow edge in both directions, then record the block.
 *
 * Order matters: the insert must come last. RLS refuses a follow between
 * blocked users, but the rows already in the table are not retroactively
 * removed, so dropping them first avoids leaving an edge that outlives the
 * block and grants access again if it is ever lifted.
 */
export async function blockUser(
  supabase: SupabaseClient,
  meId: string,
  otherId: string,
): Promise<{ error: string | null }> {
  await removeFollower(supabase, meId, otherId)
  await unfollowUser(supabase, meId, otherId)
  const { error } = await supabase
    .from('blocks')
    .insert({ blocker_id: meId, blocked_id: otherId })
  return { error: error ? 'Could not block this account.' : null }
}

export async function unblockUser(
  supabase: SupabaseClient,
  meId: string,
  otherId: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('blocks')
    .delete()
    .eq('blocker_id', meId)
    .eq('blocked_id', otherId)
  return { error: error ? 'Could not unblock this account.' : null }
}

export async function muteUser(
  supabase: SupabaseClient,
  meId: string,
  otherId: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('mutes')
    .insert({ muter_id: meId, muted_id: otherId })
  return { error: error ? 'Could not mute this account.' : null }
}

export async function unmuteUser(
  supabase: SupabaseClient,
  meId: string,
  otherId: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('mutes')
    .delete()
    .eq('muter_id', meId)
    .eq('muted_id', otherId)
  return { error: error ? 'Could not unmute this account.' : null }
}

/** Drop someone's follow of you, revoking their logbook access. */
export async function removeFollower(
  supabase: SupabaseClient,
  meId: string,
  followerId: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('friendships')
    .delete()
    .eq('requester_id', followerId)
    .eq('addressee_id', meId)
  return { error: error ? 'Could not remove this follower.' : null }
}

/** Stop following someone. */
export async function unfollowUser(
  supabase: SupabaseClient,
  meId: string,
  otherId: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('friendships')
    .delete()
    .eq('requester_id', meId)
    .eq('addressee_id', otherId)
  return { error: error ? 'Could not unfollow this account.' : null }
}
