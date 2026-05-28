import { getStore } from '@netlify/blobs'

export const config = { path: '/api/doc-sync' }

function emailToKey(email: string): string {
  return email.toLowerCase().replace(/[^a-z0-9]/g, '_')
}

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
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
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

async function canAccess(session: any, targetEmail: string): Promise<boolean> {
  if (session.role === 'admin') return true
  if (session.role === 'student') return session.email === targetEmail
  if (session.role === 'mentor') {
    try {
      const userStore = getStore('litwits-users')
      const student = await userStore.get(emailToKey(targetEmail), { type: 'json' }) as any
      if (Array.isArray(student?.assignedMentors)) {
        return student.assignedMentors.includes(session.email)
      }
      return student?.mentorEmail === session.email
    } catch {
      return false
    }
  }
  return false
}

/**
 * Real-time sync endpoint for collaborative editing.
 *
 * GET /api/doc-sync?email=...&docId=...&since=...
 *   Returns document content + version if changed since timestamp
 *
 * POST /api/doc-sync
 *   Saves document with version tracking
 */
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
    const targetEmail = url.searchParams.get('email') || session.email
    const docId = url.searchParams.get('docId')
    const since = parseInt(url.searchParams.get('since') || '0')

    if (!docId) return withCors(json({ error: 'docId required' }, 400))

    const allowed = await canAccess(session, targetEmail)
    if (!allowed) return withCors(json({ error: 'Forbidden' }, 403))

    try {
      const key = `${emailToKey(targetEmail)}:doc:${docId}:sync`
      const syncData = await syncStore.get(key, { type: 'json' }) as any

      if (!syncData) {
        return withCors(json({ changed: false, version: 0 }))
      }

      // Only return content if it changed since the client's last known version
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
      console.error('GET /api/doc-sync', err)
      return withCors(json({ error: 'Server error' }, 500))
    }
  }

  // POST — push changes
  if (request.method === 'POST') {
    try {
      const body = await request.json() as any
      const { email, docId, title, content, tabs, activeTabId } = body
      const targetEmail = email || session.email

      if (!docId) return withCors(json({ error: 'docId required' }, 400))

      const allowed = await canAccess(session, targetEmail)
      if (!allowed) return withCors(json({ error: 'Forbidden' }, 403))

      const now = Date.now()
      const key = `${emailToKey(targetEmail)}:doc:${docId}:sync`

      const DEFAULT_DOC_NAMES: Record<number, string> = {
        1: 'Competition Related Writing',
        2: 'WSC Writing',
        3: 'Debating',
        4: 'MUN',
        5: 'Writing Document',
      }
      const docTitle = title || DEFAULT_DOC_NAMES[parseInt(docId)] || `Doc ${docId}`

      const syncPayload: any = {
        content: content || '',
        title: docTitle,
        timestamp: now,
        editedBy: session.name || session.email,
      }
      if (tabs !== undefined) syncPayload.tabs = tabs
      if (activeTabId !== undefined) syncPayload.activeTabId = activeTabId
      await syncStore.setJSON(key, syncPayload)

      // Also save to the main document store for persistence
      const docStore = getStore('litwits-documents')
      const docKey = emailToKey(targetEmail)
      const existing = await docStore.get(`${docKey}:doc:${docId}`, { type: 'json' }) as any
      const persistPayload: any = {
        title: docTitle,
        content: content || '',
      }
      if (tabs !== undefined) persistPayload.tabs = tabs
      else if (existing?.tabs !== undefined) persistPayload.tabs = existing.tabs
      if (activeTabId !== undefined) persistPayload.activeTabId = activeTabId
      else if (existing?.activeTabId !== undefined) persistPayload.activeTabId = existing.activeTabId
      await docStore.setJSON(`${docKey}:doc:${docId}`, persistPayload)

      return withCors(json({ success: true, version: now }))
    } catch (err) {
      console.error('POST /api/doc-sync', err)
      return withCors(json({ error: 'Server error' }, 500))
    }
  }

  return withCors(json({ error: 'Method not allowed' }, 405))
}
