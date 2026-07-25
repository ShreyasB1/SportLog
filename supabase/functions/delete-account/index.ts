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

  const { error: delErr } = await admin.auth.admin.deleteUser(userData.user.id)
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
