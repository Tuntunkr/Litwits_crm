import { getStore } from '@netlify/blobs'

export const config = { path: '/api/litwits-doc-sync' }

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

function emailToKey(email: string): string {
  return email.toLowerCase().replace(/[^a-z0-9]/g, '_')
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

async function userHasAccessToDoc(session: any, docId: string): Promise<boolean> {
  if (session.role === 'admin') return true
  if (session.email === 'teamlitwits@litwits.in') return true

  const userStore = getStore('litwits-users')
  const user = await userStore.get(emailToKey(session.email), { type: 'json' }) as any
  if (!user) return false

  if (Array.isArray(user.assignedLitwitsDocs)) {
    return user.assignedLitwitsDocs.includes(docId)
  }
  return false
}

export default async (request: Request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() })
  }

  const session = await getSession(request)
  if (!session) return withCors(json({ error: 'Unauthorized' }, 401))

  const syncStore = getStore({ name: 'litwits-doc-sync', consistency: 'strong' })

  // GET — poll for changes
  if (request.method === 'GET') {
    const url = new URL(request.url)
    const docId = url.searchParams.get('docId')
    const since = parseInt(url.searchParams.get('since') || '0')

    if (!docId) return withCors(json({ error: 'docId required' }, 400))

    const hasAccess = await userHasAccessToDoc(session, docId)
    if (!hasAccess) return withCors(json({ error: 'Forbidden' }, 403))

    try {
      const key = `litwits:${docId}:sync`
      const syncData = await syncStore.get(key, { type: 'json' }) as any

      if (!syncData) {
        return withCors(json({ changed: false, version: 0 }))
      }

      if (syncData.timestamp > since) {
        return withCors(json({
          changed: true,
          content: syncData.content,
          title: syncData.title,
          version: syncData.timestamp,
          editedBy: syncData.editedBy,
          tabs: syncData.tabs ?? null,
          activeTabId: syncData.activeTabId ?? null,
        }))
      }

      return withCors(json({ changed: false, version: syncData.timestamp }))
    } catch (err) {
      console.error('GET /api/litwits-doc-sync', err)
      return withCors(json({ error: 'Server error' }, 500))
    }
  }

  // POST — push changes (admin and mentor only)
  if (request.method === 'POST') {
    if (session.role === 'student') {
      return withCors(json({ error: 'Students cannot edit LITWITS documents' }, 403))
    }

    try {
      const body = await request.json() as any
      const { docId, title, content, tabs, activeTabId } = body

      if (!docId) return withCors(json({ error: 'docId required' }, 400))

      const hasAccess = await userHasAccessToDoc(session, docId)
      if (!hasAccess) return withCors(json({ error: 'Forbidden' }, 403))

      const now = Date.now()
      const key = `litwits:${docId}:sync`

      const syncPayload: any = {
        content: content || '',
        title: title || docId,
        timestamp: now,
        editedBy: session.name || session.email,
      }
      if (tabs !== undefined) syncPayload.tabs = tabs
      if (activeTabId !== undefined) syncPayload.activeTabId = activeTabId
      await syncStore.setJSON(key, syncPayload)

      // Also save to the main secure docs store
      const docStore = getStore({ name: 'litwits-secure-docs', consistency: 'strong' })
      const existing = await docStore.get(`doc:${docId}`, { type: 'json' }) as any

      const persistPayload: any = {
        title: title || existing?.title || docId,
        category: existing?.category || 'Other Documents',
        content: content || '',
        lastEditedBy: session.name || session.email,
        lastEditedAt: now,
        createdAt: existing?.createdAt || now,
      }
      if (tabs !== undefined) persistPayload.tabs = tabs
      else if (existing?.tabs !== undefined) persistPayload.tabs = existing.tabs
      if (activeTabId !== undefined) persistPayload.activeTabId = activeTabId
      else if (existing?.activeTabId !== undefined) persistPayload.activeTabId = existing.activeTabId
      await docStore.setJSON(`doc:${docId}`, persistPayload)

      return withCors(json({ success: true, version: now }))
    } catch (err) {
      console.error('POST /api/litwits-doc-sync', err)
      return withCors(json({ error: 'Server error' }, 500))
    }
  }

  return withCors(json({ error: 'Method not allowed' }, 405))
}
