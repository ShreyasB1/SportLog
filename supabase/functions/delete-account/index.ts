// delete-account Edge Function
// Deletes the calling user's auth account. The on_auth_user_deleted trigger
// (migration 0006) erases all of their app data in the same transaction.
//
// Auth: requires the caller's JWT (sent automatically by
// supabase.functions.invoke when signed in). The service role key is used
// only to perform the admin deletion after the JWT is verified.
import { createClient } from 'jsr:@supabase/supabase-js@2'

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

Deno.serve(async (req) => {
  const authHeader = req.headers.get('Authorization') ?? ''
  const token = authHeader.replace(/^Bearer\s+/i, '')
  if (!token) {
    return new Response(JSON.stringify({ error: 'Missing authorization' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Resolve the caller from their own JWT — the user can only delete themself.
  const { data: userData, error: userErr } = await admin.auth.getUser(token)
  if (userErr || !userData?.user) {
    return new Response(JSON.stringify({ error: 'Invalid token' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const userId = userData.user.id

  // Purge avatars before deleting the account. The objects live in a public
  // bucket under "<user_id>/", so a leftover file stays fetchable by URL even
  // though its profile row is gone. Migration 0008 also clears the
  // storage.objects rows as a backstop, but only remove() reclaims the
  // underlying file rather than orphaning it in the storage backend.
  //
  // Best-effort: a failure here must not block account deletion, which Apple
  // requires to work (App Store guideline 5.1.1(v)).
  // Uploads are timestamped ("avatar-<ts>.jpg") and never overwrite, so a user
  // accumulates one object per photo change. list() caps at 100 per call --
  // page through until the folder is empty rather than stranding the rest.
  try {
    for (let page = 0; page < 50; page++) {
      const { data: files, error: listErr } = await admin.storage
        .from('avatars')
        .list(userId, { limit: 100 })
      if (listErr) throw listErr
      if (!files || files.length === 0) break

      const { error: rmErr } = await admin.storage
        .from('avatars')
        .remove(files.map((f) => `${userId}/${f.name}`))
      if (rmErr) throw rmErr

      if (files.length < 100) break
    }
  } catch (err) {
    console.error('avatar cleanup failed for', userId, err)
  }

  const { error: delErr } = await admin.auth.admin.deleteUser(userId)
  if (delErr) {
    return new Response(JSON.stringify({ error: 'Deletion failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
