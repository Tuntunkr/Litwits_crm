export function getAuthSecret(): string {
  return (
    process.env.AUTH_SECRET ||
    process.env.VITE_AUTH_SECRET ||
    'litwits-dev-auth-secret-change-me'
  )
}

export type SupabaseConfig = { url: string; serviceKey: string }

export function getSupabase(): SupabaseConfig | null {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, '')
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    ''
  if (!url || !serviceKey) return null
  return { url, serviceKey }
}

export function requireSupabase(): SupabaseConfig {
  const c = getSupabase()
  if (!c) {
    throw new Error(
      'Database not configured: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env',
    )
  }
  return c
}
