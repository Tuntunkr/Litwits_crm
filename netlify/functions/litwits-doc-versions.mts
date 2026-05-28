import { getStore } from '@netlify/blobs'

export const config = { path: '/api/litwits-doc-versions' }

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

  const store = getStore('litwits-doc-versions')
  const method = request.method.toUpperCase()

  // GET — list versions for a document (admin only)
  if (method === 'GET') {
    if (session.role !== 'admin') return withCors(json({ error: 'Forbidden' }, 403))

    const url = new URL(request.url)
    const docId = url.searchParams.get('docId')
    const versionTimestamp = url.searchParams.get('version')

    if (!docId) return withCors(json({ error: 'docId required' }, 400))

    try {
      // Get a specific version
      if (versionTimestamp) {
        const version = await store.get(`${docId}:version:${versionTimestamp}`, { type: 'json' }) as any
        if (!version) return withCors(json({ error: 'Version not found' }, 404))
        return withCors(json({ version }))
      }

      // List all versions for a document
      const { blobs } = await store.list({ prefix: `${docId}:version:` })
      const versions: any[] = []

      for (const blob of blobs) {
        const version = await store.get(blob.key, { type: 'json' }) as any
        if (version) {
          versions.push({
            timestamp: version.timestamp,
            editedBy: version.editedBy,
            editedByEmail: version.editedByEmail,
            title: version.title,
          })
        }
      }

      // Sort by timestamp descending
      versions.sort((a, b) => b.timestamp - a.timestamp)

      return withCors(json({ versions: versions.slice(0, 50) }))
    } catch (err) {
      console.error('GET /api/litwits-doc-versions', err)
      return withCors(json({ error: 'Server error' }, 500))
    }
  }

  // POST — restore a version (admin only)
  if (method === 'POST') {
    if (session.role !== 'admin') return withCors(json({ error: 'Forbidden' }, 403))

    try {
      const body = await request.json() as any
      const { docId, versionTimestamp } = body

      if (!docId || !versionTimestamp) {
        return withCors(json({ error: 'docId and versionTimestamp required' }, 400))
      }

      const version = await store.get(`${docId}:version:${versionTimestamp}`, { type: 'json' }) as any
      if (!version) return withCors(json({ error: 'Version not found' }, 404))

      // Restore the document content
      const docStore = getStore({ name: 'litwits-secure-docs', consistency: 'strong' })
      const existing = await docStore.get(`doc:${docId}`, { type: 'json' }) as any
      const now = Date.now()

      await docStore.setJSON(`doc:${docId}`, {
        ...existing,
        content: version.content,
        lastEditedBy: session.name || session.email,
        lastEditedAt: now,
      })

      // Save a new version snapshot for the restore action
      await store.setJSON(`${docId}:version:${now}`, {
        content: version.content,
        editedBy: `${session.name || session.email} (restored)`,
        editedByEmail: session.email,
        timestamp: now,
        title: existing?.title || version.title,
      })

      return withCors(json({ success: true }))
    } catch (err) {
      console.error('POST /api/litwits-doc-versions', err)
      return withCors(json({ error: 'Server error' }, 500))
    }
  }

  return withCors(json({ error: 'Method not allowed' }, 405))
}
