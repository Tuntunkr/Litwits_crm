import { getStore } from '@netlify/blobs'

export const config = { path: '/api/litwits-doc-activity' }

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function withCors(response: Response) {
  const headers = new Headers(response.headers)
  Object.entries(corsHeaders()).forEach(([k, v]) => headers.set(k, v))
  return new Response(response.body, { status: response.status, headers })
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }
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
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() })
  }

  const session = await getSession(request)
  if (!session) return withCors(json({ error: 'Unauthorized' }, 401))

  const store = getStore('litwits-doc-activity')
  const method = request.method.toUpperCase()

  // POST — log an activity
  if (method === 'POST') {
    try {
      const body = await request.json() as any
      const { docId, action, duration } = body

      if (!docId || !action) return withCors(json({ error: 'docId and action required' }, 400))

      const now = Date.now()
      const logKey = `${docId}:${session.email.replace(/[^a-z0-9]/gi, '_')}:${now}`

      await store.setJSON(logKey, {
        userName: session.name || session.email,
        userEmail: session.email,
        userRole: session.role,
        documentId: docId,
        action, // viewed, edited, opened
        timestamp: now,
        duration: duration || 0, // session duration in seconds
      })

      return withCors(json({ success: true }))
    } catch (err) {
      console.error('POST /api/litwits-doc-activity', err)
      return withCors(json({ error: 'Server error' }, 500))
    }
  }

  // GET — get activity logs (admin only)
  if (method === 'GET') {
    if (session.role !== 'admin') return withCors(json({ error: 'Forbidden' }, 403))

    try {
      const url = new URL(request.url)
      const filterUser = url.searchParams.get('user')
      const filterDoc = url.searchParams.get('docId')
      const filterDate = url.searchParams.get('date') // YYYY-MM-DD

      const { blobs } = await store.list()
      const logs: any[] = []

      for (const blob of blobs) {
        const log = await store.get(blob.key, { type: 'json' }) as any
        if (!log) continue

        // Apply filters
        if (filterUser && log.userEmail !== filterUser) continue
        if (filterDoc && log.documentId !== filterDoc) continue
        if (filterDate) {
          const logDate = new Date(log.timestamp).toISOString().split('T')[0]
          if (logDate !== filterDate) continue
        }

        logs.push(log)
      }

      // Sort by timestamp descending
      logs.sort((a, b) => b.timestamp - a.timestamp)

      // Limit to 200 most recent
      return withCors(json({ logs: logs.slice(0, 200) }))
    } catch (err) {
      console.error('GET /api/litwits-doc-activity', err)
      return withCors(json({ error: 'Server error' }, 500))
    }
  }

  return withCors(json({ error: 'Method not allowed' }, 405))
}
