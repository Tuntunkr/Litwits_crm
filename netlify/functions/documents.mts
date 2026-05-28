import { getStore } from '@netlify/blobs'

export const config = { path: '/api/documents' }

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
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
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
      // Support both new assignedMentors array and legacy mentorEmail field
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

export default async (request: Request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() })
  }

  const session = await getSession(request)
  if (!session) return withCors(json({ error: 'Unauthorized' }, 401))

  const method = request.method.toUpperCase()

  // GET — fetch documents for a user
  if (method === 'GET') {
    const url = new URL(request.url)
    const targetEmail = url.searchParams.get('email') || session.email

    const allowed = await canAccess(session, targetEmail)
    if (!allowed) return withCors(json({ error: 'Forbidden' }, 403))

    const OLD_DEFAULT_NAMES = ['Doc 1', 'Doc 2', 'Doc 3', 'Doc 4', 'Doc 5']
    const DEFAULT_DOC_NAMES: Record<number, string> = {
      1: 'Competition Related Writing',
      2: 'WSC Writing',
      3: 'Debating',
      4: 'MUN',
      5: 'Writing Document',
    }

    try {
      const docStore = getStore('litwits-documents')
      const key = emailToKey(targetEmail)
      const docs = await Promise.all(
        [1, 2, 3, 4, 5].map(async (i) => {
          const doc = await docStore.get(`${key}:doc:${i}`, { type: 'json' }) as any
          let title = doc?.title ?? DEFAULT_DOC_NAMES[i]

          // Migrate old default names to new defaults (preserve custom names)
          if (doc && OLD_DEFAULT_NAMES.includes(doc.title)) {
            title = DEFAULT_DOC_NAMES[i]
            await docStore.setJSON(`${key}:doc:${i}`, { ...doc, title })
          }

          return {
            id: i,
            title,
            content: doc?.content ?? '',
            tabs: Array.isArray(doc?.tabs) ? doc.tabs : null,
            activeTabId: doc?.activeTabId ?? null,
          }
        })
      )
      return withCors(json({ documents: docs }))
    } catch (err) {
      console.error('GET /api/documents', err)
      return withCors(json({ error: 'Server error' }, 500))
    }
  }

  // PUT — save a document
  if (method === 'PUT') {
    try {
      const body = await request.json() as any
      const { email, docId, title, content, tabs, activeTabId } = body
      const targetEmail = email || session.email

      const allowed = await canAccess(session, targetEmail)
      if (!allowed) return withCors(json({ error: 'Forbidden' }, 403))

      if (!docId || docId < 1 || docId > 5) {
        return withCors(json({ error: 'docId must be 1-5' }, 400))
      }

      const DEFAULT_DOC_NAMES_PUT: Record<number, string> = {
        1: 'Competition Related Writing',
        2: 'WSC Writing',
        3: 'Debating',
        4: 'MUN',
        5: 'Writing Document',
      }

      const docStore = getStore('litwits-documents')
      const key = emailToKey(targetEmail)
      const existing = await docStore.get(`${key}:doc:${docId}`, { type: 'json' }) as any
      const payload: any = {
        title: title || DEFAULT_DOC_NAMES_PUT[docId] || `Doc ${docId}`,
        content: content || '',
      }
      if (tabs !== undefined) payload.tabs = tabs
      else if (existing?.tabs !== undefined) payload.tabs = existing.tabs
      if (activeTabId !== undefined) payload.activeTabId = activeTabId
      else if (existing?.activeTabId !== undefined) payload.activeTabId = existing.activeTabId
      await docStore.setJSON(`${key}:doc:${docId}`, payload)
      return withCors(json({ success: true }))
    } catch (err) {
      console.error('PUT /api/documents', err)
      return withCors(json({ error: 'Server error' }, 500))
    }
  }

  return withCors(json({ error: 'Method not allowed' }, 405))
}
