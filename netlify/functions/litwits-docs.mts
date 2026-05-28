import { getStore } from '@netlify/blobs'

export const config = { path: '/api/litwits-docs' }

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

function emailToKey(email: string): string {
  return email.toLowerCase().replace(/[^a-z0-9]/g, '_')
}


export default async (request: Request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() })
  }

  const session = await getSession(request)
  if (!session) return withCors(json({ error: 'Unauthorized' }, 401))

  const store = getStore({ name: 'litwits-secure-docs', consistency: 'strong' })
  const method = request.method.toUpperCase()

  // GET — list documents or get a specific document
  if (method === 'GET') {
    const url = new URL(request.url)
    const docId = url.searchParams.get('docId')

    // Single document fetch
    if (docId) {
      const hasAccess = await userHasAccessToDoc(session, docId)
      if (!hasAccess) return withCors(json({ error: 'Forbidden' }, 403))

      const doc = await store.get(`doc:${docId}`, { type: 'json' }) as any
      if (!doc) return withCors(json({ error: 'Document not found' }, 404))
      return withCors(json({
        document: {
          id: docId,
          ...doc,
          category: doc.category || 'Other Documents',
        },
      }))
    }

    // List all documents for current user
    if (session.role === 'admin') {
      // Admin sees all documents
      const docs = await getAllDocs(store)
      return withCors(json({ documents: docs }))
    }

    // Mentor or student: only see assigned docs
    const userStore = getStore('litwits-users')
    let assignedDocIds: string[] = []

    if (session.email === 'teamlitwits@litwits.in') {
      // Master admin
      const docs = await getAllDocs(store)
      return withCors(json({ documents: docs }))
    }

    const user = await userStore.get(emailToKey(session.email), { type: 'json' }) as any
    if (user && Array.isArray(user.assignedLitwitsDocs)) {
      assignedDocIds = user.assignedLitwitsDocs
    }

    const docs = await getDocsById(store, assignedDocIds)
    return withCors(json({ documents: docs }))
  }

  // POST — create/initialize a document (admin only)
  if (method === 'POST') {
    if (session.role !== 'admin') return withCors(json({ error: 'Forbidden' }, 403))

    try {
      const body = await request.json() as any
      const { docId, title, category, content, tabs, activeTabId } = body

      if (!docId || !title) return withCors(json({ error: 'docId and title required' }, 400))

      const existing = await store.get(`doc:${docId}`, { type: 'json' }) as any
      const now = Date.now()

      const payload: any = {
        title,
        category: category || existing?.category || 'Other Documents',
        content: content || existing?.content || '',
        lastEditedBy: session.name || session.email,
        lastEditedAt: now,
        createdAt: existing?.createdAt || now,
      }
      if (tabs !== undefined) payload.tabs = tabs
      else if (existing?.tabs !== undefined) payload.tabs = existing.tabs
      if (activeTabId !== undefined) payload.activeTabId = activeTabId
      else if (existing?.activeTabId !== undefined) payload.activeTabId = existing.activeTabId

      await store.setJSON(`doc:${docId}`, payload)

      return withCors(json({ success: true, document: { id: docId, ...payload } }))
    } catch (err) {
      console.error('POST /api/litwits-docs', err)
      return withCors(json({ error: 'Server error' }, 500))
    }
  }

  // PUT — update document content
  if (method === 'PUT') {
    try {
      const body = await request.json() as any
      const { docId, title, content, tabs, activeTabId } = body

      if (!docId) return withCors(json({ error: 'docId required' }, 400))

      // Check access: admin can edit, mentor can edit, student cannot
      if (session.role === 'student') {
        return withCors(json({ error: 'Students cannot edit LITWITS documents' }, 403))
      }

      const hasAccess = await userHasAccessToDoc(session, docId)
      if (!hasAccess) return withCors(json({ error: 'Forbidden' }, 403))

      const existing = await store.get(`doc:${docId}`, { type: 'json' }) as any
      const now = Date.now()

      const updated: any = {
        title: title || existing?.title || docId,
        category: existing?.category || 'Other Documents',
        content: content !== undefined ? content : (existing?.content || ''),
        lastEditedBy: session.name || session.email,
        lastEditedAt: now,
        createdAt: existing?.createdAt || now,
      }
      if (tabs !== undefined) updated.tabs = tabs
      else if (existing?.tabs !== undefined) updated.tabs = existing.tabs
      if (activeTabId !== undefined) updated.activeTabId = activeTabId
      else if (existing?.activeTabId !== undefined) updated.activeTabId = existing.activeTabId

      await store.setJSON(`doc:${docId}`, updated)

      // Save version snapshot
      const versionStore = getStore('litwits-doc-versions')
      const versionKey = `${docId}:version:${now}`
      await versionStore.setJSON(versionKey, {
        content: updated.content,
        editedBy: session.name || session.email,
        editedByEmail: session.email,
        timestamp: now,
        title: updated.title,
        tabs: updated.tabs,
        activeTabId: updated.activeTabId,
      })

      return withCors(json({ success: true, version: now }))
    } catch (err) {
      console.error('PUT /api/litwits-docs', err)
      return withCors(json({ error: 'Server error' }, 500))
    }
  }

  // DELETE — remove a document (admin only).
  if (method === 'DELETE') {
    if (session.role !== 'admin') return withCors(json({ error: 'Forbidden' }, 403))

    const url = new URL(request.url)
    const docId = url.searchParams.get('docId')
    if (!docId) return withCors(json({ error: 'docId required' }, 400))

    try {
      await store.delete(`doc:${docId}`)

      // Also wipe the live-sync record so polling clients stop seeing it.
      try {
        const syncStore = getStore({ name: 'litwits-doc-sync', consistency: 'strong' })
        await syncStore.delete(`litwits:${docId}:sync`)
      } catch {}

      // Remove from every user's assignedLitwitsDocs so it disappears across UIs.
      try {
        const userStore = getStore('litwits-users')
        const { blobs } = await userStore.list()
        for (const blob of blobs) {
          const user = await userStore.get(blob.key, { type: 'json' }) as any
          if (user && Array.isArray(user.assignedLitwitsDocs) && user.assignedLitwitsDocs.includes(docId)) {
            user.assignedLitwitsDocs = user.assignedLitwitsDocs.filter((d: string) => d !== docId)
            await userStore.setJSON(blob.key, user)
          }
        }
      } catch (err) {
        console.error('DELETE /api/litwits-docs cleanup users', err)
      }

      return withCors(json({ success: true }))
    } catch (err) {
      console.error('DELETE /api/litwits-docs', err)
      return withCors(json({ error: 'Server error' }, 500))
    }
  }

  return withCors(json({ error: 'Method not allowed' }, 405))
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

async function getAllDocs(store: any) {
  const docs = []
  const { blobs } = await store.list({ prefix: 'doc:' })
  for (const blob of blobs) {
    const id = blob.key.replace('doc:', '')
    const doc = await store.get(blob.key, { type: 'json' }) as any
    if (doc) {
      docs.push({
        id,
        title: doc.title || id,
        category: doc.category || 'Other Documents',
        content: doc.content || '',
        tabs: Array.isArray(doc?.tabs) ? doc.tabs : null,
        activeTabId: doc?.activeTabId ?? null,
        lastEditedBy: doc.lastEditedBy || null,
        lastEditedAt: doc.lastEditedAt || null,
      })
    }
  }
  return docs
}

async function getDocsById(store: any, docIds: string[]) {
  const docs = []
  for (const docId of docIds) {
    const doc = await store.get(`doc:${docId}`, { type: 'json' }) as any
    if (!doc) continue
    docs.push({
      id: docId,
      title: doc.title || docId,
      category: doc.category || 'Other Documents',
      content: doc.content || '',
      tabs: Array.isArray(doc?.tabs) ? doc.tabs : null,
      activeTabId: doc?.activeTabId ?? null,
      lastEditedBy: doc.lastEditedBy || null,
      lastEditedAt: doc.lastEditedAt || null,
    })
  }
  return docs
}

