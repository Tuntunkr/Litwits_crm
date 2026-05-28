import { getStore } from '@netlify/blobs'

export const config = { path: '/api/mentor-documents' }

function emailToKey(email: string): string {
  return email.toLowerCase().replace(/[^a-z0-9]/g, '_')
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
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

const DEFAULT_MENTOR_DOC_NAMES: Record<number, string> = {
  1: 'Doc 1',
  2: 'Doc 2',
  3: 'Doc 3',
  4: 'Doc 4',
  5: 'Doc 5',
}

function canAccessMentorDocs(session: any, targetEmail: string): boolean {
  if (session.role === 'admin') return true
  if (session.role === 'mentor') return session.email === targetEmail
  return false
}

export default async (request: Request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() })
  }

  const session = await getSession(request)
  if (!session) return withCors(json({ error: 'Unauthorized' }, 401))

  // Students cannot access this API at all
  if (session.role === 'student') {
    return withCors(json({ error: 'Forbidden' }, 403))
  }

  const method = request.method.toUpperCase()

  // GET — fetch 4 documents for a mentor
  if (method === 'GET') {
    const url = new URL(request.url)
    const targetEmail = url.searchParams.get('email') || session.email

    if (!canAccessMentorDocs(session, targetEmail)) {
      return withCors(json({ error: 'Forbidden' }, 403))
    }

    // Optional: list all mentors (admin only)
    if (url.searchParams.get('listMentors') === '1') {
      if (session.role !== 'admin') return withCors(json({ error: 'Forbidden' }, 403))
      try {
        const userStore = getStore('litwits-users')
        const { blobs } = await userStore.list()
        const mentors: any[] = []
        for (const blob of blobs) {
          const u = await userStore.get(blob.key, { type: 'json' }) as any
          if (u?.role === 'mentor') {
            mentors.push({ name: u.name, email: u.email })
          }
        }
        return withCors(json({ mentors }))
      } catch (err) {
        console.error('GET /api/mentor-documents?listMentors=1', err)
        return withCors(json({ error: 'Server error' }, 500))
      }
    }

    try {
      const store = getStore('litwits-mentor-docs')
      const key = emailToKey(targetEmail)
      const docs = await Promise.all(
        [1, 2, 3, 4, 5].map(async (i) => {
          const doc = await store.get(`${key}:doc:${i}`, { type: 'json' }) as any
          return {
            id: i,
            title: doc?.title ?? DEFAULT_MENTOR_DOC_NAMES[i],
            content: doc?.content ?? '',
            tabs: Array.isArray(doc?.tabs) ? doc.tabs : null,
            activeTabId: doc?.activeTabId ?? null,
          }
        })
      )
      return withCors(json({ documents: docs }))
    } catch (err) {
      console.error('GET /api/mentor-documents', err)
      return withCors(json({ error: 'Server error' }, 500))
    }
  }

  // PUT — save a mentor document
  if (method === 'PUT') {
    try {
      const body = await request.json() as any
      const { email, docId, title, content, tabs, activeTabId } = body
      const targetEmail = email || session.email

      if (!canAccessMentorDocs(session, targetEmail)) {
        return withCors(json({ error: 'Forbidden' }, 403))
      }
      if (!docId || docId < 1 || docId > 5) {
        return withCors(json({ error: 'docId must be 1-5' }, 400))
      }

      const store = getStore('litwits-mentor-docs')
      const key = emailToKey(targetEmail)
      const existing = await store.get(`${key}:doc:${docId}`, { type: 'json' }) as any
      const payload: any = {
        title: title ?? existing?.title ?? DEFAULT_MENTOR_DOC_NAMES[docId],
        content: content ?? existing?.content ?? '',
        lastEditedBy: session.name || session.email,
        lastEditedAt: Date.now(),
      }
      // Preserve existing tabs / activeTabId if the client didn't send them,
      // so a save that only updates content never loses the tab structure.
      if (tabs !== undefined) payload.tabs = tabs
      else if (existing?.tabs !== undefined) payload.tabs = existing.tabs
      if (activeTabId !== undefined) payload.activeTabId = activeTabId
      else if (existing?.activeTabId !== undefined) payload.activeTabId = existing.activeTabId
      await store.setJSON(`${key}:doc:${docId}`, payload)
      return withCors(json({ success: true }))
    } catch (err) {
      console.error('PUT /api/mentor-documents', err)
      return withCors(json({ error: 'Server error' }, 500))
    }
  }

  return withCors(json({ error: 'Method not allowed' }, 405))
}
