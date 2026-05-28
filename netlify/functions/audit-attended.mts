import { getStore } from '@netlify/blobs'

export const config = { path: '/api/audit-attended' }

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }
}

function withCors(response: Response) {
  const headers = new Headers(response.headers)
  Object.entries(corsHeaders()).forEach(([k, v]) => headers.set(k, v))
  return new Response(response.body, { status: response.status, headers })
}

async function getSession(request: Request) {
  const auth = request.headers.get('Authorization')
  if (!auth?.startsWith('Bearer ')) return null
  const token = auth.slice(7)
  try {
    const store = getStore('litwits-sessions')
    const session = (await store.get(token, { type: 'json' })) as any
    if (!session || session.exp < Date.now()) return null
    return session
  } catch {
    return null
  }
}

export default async (request: Request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() })
  }
  const session = await getSession(request)
  if (!session) return withCors(json({ error: 'Unauthorized' }, 401))
  if (session.role !== 'admin') return withCors(json({ error: 'Forbidden' }, 403))

  if (request.method !== 'GET') {
    return withCors(json({ error: 'Method not allowed' }, 405))
  }

  const url = new URL(request.url)
  const userEmail = (url.searchParams.get('userEmail') || '').trim().toLowerCase()
  const limit = Math.min(500, Math.max(1, parseInt(url.searchParams.get('limit') || '200', 10)))

  try {
    const store = getStore({ name: 'litwits-attended-audit', consistency: 'strong' })
    const { blobs } = await store.list()
    const entries = (await Promise.all(
      blobs.map((b) => store.get(b.key, { type: 'json' })),
    )) as any[]
    const filtered = entries
      .filter(Boolean)
      .filter((e) => !userEmail || (e.userEmail || '').toLowerCase() === userEmail)
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
      .slice(0, limit)
    return withCors(json({ entries: filtered }))
  } catch (err) {
    console.error('GET /api/audit-attended', err)
    return withCors(json({ error: 'Server error' }, 500))
  }
}
