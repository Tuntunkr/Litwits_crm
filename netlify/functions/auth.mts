import { getStore } from '@netlify/blobs'

export const config = { path: '/api/auth' }

const MASTER_ADMIN = {
  email: 'teamlitwits@litwits.in',
  password: 'Master@123',
  role: 'admin' as const,
  name: 'Master Admin',
}

function emailToKey(email: string): string {
  return email.toLowerCase().replace(/[^a-z0-9]/g, '_')
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

async function getSession(request: Request) {
  const auth = request.headers.get('Authorization')
  if (!auth?.startsWith('Bearer ')) return null
  const token = auth.slice(7)
  try {
    const store = getStore('litwits-sessions')
    const session = await store.get(token, { type: 'json' }) as any
    if (!session || session.exp < Date.now()) return null
    return session
  } catch {
    return null
  }
}

export default async (request: Request) => {
  // CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() })
  }

  const method = request.method.toUpperCase()

  // GET — verify session
  if (method === 'GET') {
    const session = await getSession(request)
    if (!session) return withCors(json({ error: 'Unauthorized' }, 401))
    return withCors(json({ user: { name: session.name, email: session.email, role: session.role } }))
  }

  // POST — login
  if (method === 'POST') {
    const body = await request.json() as { email: string; password: string }
    const { email, password } = body

    // Master admin (hardcoded)
    if (email === MASTER_ADMIN.email && password === MASTER_ADMIN.password) {
      const token = crypto.randomUUID()
      const store = getStore('litwits-sessions')
      await store.setJSON(token, {
        email: MASTER_ADMIN.email,
        role: MASTER_ADMIN.role,
        name: MASTER_ADMIN.name,
        exp: Date.now() + 24 * 60 * 60 * 1000,
      })
      return withCors(json({
        token,
        user: { name: MASTER_ADMIN.name, email: MASTER_ADMIN.email, role: MASTER_ADMIN.role },
      }))
    }

    // Blob users
    try {
      const userStore = getStore('litwits-users')
      const user = await userStore.get(emailToKey(email), { type: 'json' }) as any
      if (!user || user.password !== password) {
        return withCors(json({ error: 'Invalid email or password' }, 401))
      }

      // Check validity / active status
      const now = new Date()
      const today = now.toISOString().split('T')[0]
      let isExpired = false
      let endDate = user.validityEnd || null

      // Auto-expire if end date has passed
      if (user.validityEnd && today > user.validityEnd) {
        isExpired = true
        if (user.status !== 'inactive') {
          await userStore.setJSON(emailToKey(email), { ...user, status: 'inactive' })
        }
      }

      // Check manual inactive status
      if (user.status === 'inactive') {
        isExpired = true
      }

      if (isExpired) {
        return withCors(json({
          error: 'validity_expired',
          message: `Your validity is expired on ${endDate || 'N/A'}. Kindly renewal your package by clicking the link below.`,
          endDate: endDate || 'N/A',
          renewalLink: 'https://litwits.in/membership',
        }, 403))
      }

      const token = crypto.randomUUID()
      const sessionStore = getStore('litwits-sessions')
      await sessionStore.setJSON(token, {
        email: user.email,
        role: user.role,
        name: user.name,
        exp: Date.now() + 24 * 60 * 60 * 1000,
      })
      return withCors(json({ token, user: { name: user.name, email: user.email, role: user.role } }))
    } catch (err) {
      console.error('Login error', err)
      return withCors(json({ error: 'Server error' }, 500))
    }
  }

  // DELETE — logout
  if (method === 'DELETE') {
    const auth = request.headers.get('Authorization')
    if (auth?.startsWith('Bearer ')) {
      try {
        const store = getStore('litwits-sessions')
        await store.delete(auth.slice(7))
      } catch { /* ignore */ }
    }
    return withCors(json({ success: true }))
  }

  return withCors(json({ error: 'Method not allowed' }, 405))
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }
}

function withCors(response: Response) {
  const headers = new Headers(response.headers)
  Object.entries(corsHeaders()).forEach(([k, v]) => headers.set(k, v))
  return new Response(response.body, { status: response.status, headers })
}
