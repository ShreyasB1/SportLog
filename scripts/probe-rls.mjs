#!/usr/bin/env node
/**
 * Anonymous RLS probe.
 *
 * Asks the live REST API for every table using nothing but the anon key -- no
 * user session. Anything that comes back is readable by anyone holding a key
 * that ships inside the app bundle, so the only acceptable answer is zero rows
 * for user data.
 *
 * This is the check that caught RLS being switched off on profiles, logs,
 * ranks and games. Run it after any migration that touches policies, and
 * before submitting a build.
 *
 *   node scripts/probe-rls.mjs
 *
 * Reads EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY from the
 * environment, falling back to .env. Exits non-zero if anything leaks.
 */

import { readFileSync } from 'node:fs'

/** Tables that must return nothing without a session. */
const PRIVATE_TABLES = [
  'profiles',
  'logs',
  'ranks',
  'watchlist',
  'picks',
  'friendships',
  'blocks',
  'mutes',
]

/**
 * games is public sports reference data mirrored from ESPN. It holds no user
 * content, but its policies are still "to authenticated", so an anonymous read
 * returning rows means RLS is off -- exactly the symptom we are watching for.
 */
const AUTHENTICATED_ONLY_TABLES = ['games']

function loadEnv() {
  let url = process.env.EXPO_PUBLIC_SUPABASE_URL
  let key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
  if (url && key) return { url, key }

  try {
    for (const line of readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
      if (!m) continue
      if (m[1] === 'EXPO_PUBLIC_SUPABASE_URL') url ??= m[2].trim()
      if (m[1] === 'EXPO_PUBLIC_SUPABASE_ANON_KEY') key ??= m[2].trim()
    }
  } catch {
    /* no .env -- fall through to the check below */
  }

  if (!url || !key) {
    console.error('Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY.')
    process.exit(2)
  }
  return { url, key }
}

async function probe(url, key, table) {
  const res = await fetch(`${url}/rest/v1/${table}?select=*&limit=100`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  })
  const body = await res.json().catch(() => null)
  if (Array.isArray(body)) return { rows: body.length }
  // A permission or missing-relation error is not a leak; report it as-is.
  return { rows: 0, note: body?.code ?? `HTTP ${res.status}` }
}

const { url, key } = loadEnv()

// Confirm the token really is anonymous. A key with role "service_role" would
// legitimately read everything and make this whole probe meaningless.
const claims = JSON.parse(
  Buffer.from(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString(),
)
if (claims.role !== 'anon') {
  console.error(`Refusing to run: key role is "${claims.role}", expected "anon".`)
  process.exit(2)
}

console.log(`Probing ${url} as role="${claims.role}" (no user session)\n`)

const leaks = []
for (const table of [...PRIVATE_TABLES, ...AUTHENTICATED_ONLY_TABLES]) {
  const { rows, note } = await probe(url, key, table)
  const leaked = rows > 0
  if (leaked) leaks.push({ table, rows })
  const status = leaked ? 'LEAK' : 'ok  '
  console.log(`  ${status}  ${table.padEnd(12)} ${rows} rows${note ? `  (${note})` : ''}`)
}

console.log('')
if (leaks.length === 0) {
  console.log('PASS -- no table returned rows to an anonymous caller.')
  console.log('\nNote: a table can also read as "ok" simply by being empty.')
  console.log('Confirm enforcement directly with:')
  console.log("  select tablename, rowsecurity from pg_tables where schemaname='public';")
  process.exit(0)
}

console.error(`FAIL -- ${leaks.length} table(s) readable without a session:`)
for (const l of leaks) console.error(`  ${l.table}: ${l.rows} rows`)
console.error('\nThe anon key ships inside every build, so this data is public.')
console.error('Check RLS is on, then re-run:')
console.error("  select tablename, rowsecurity from pg_tables where schemaname='public';")
process.exit(1)
