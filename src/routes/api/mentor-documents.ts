import { createFileRoute } from '@tanstack/react-router'
import { requireSupabase } from '@/server/env'
import { getBearerSession } from '@/server/session'
import { listUsers } from '@/server/users'
import { kvGet, kvSet } from '@/server/kv'

const BUCKET = 'mentor_docs'

type DocRow = Record<string, unknown> & { id: number }
type Store = { documents: DocRow[]; versions: Record<string, number> }

async function load(config: ReturnType<typeof requireSupabase>, email: string): Promise<Store> {
  const row = await kvGet<Store>(config, BUCKET, email.toLowerCase())
  if (!row) return { documents: [], versions: {} }
  if (!Array.isArray(row.documents)) return { documents: [], versions: row.versions || {} }
  return {
    documents: row.documents as DocRow[],
    versions: row.versions && typeof row.versions === 'object' ? row.versions : {},
  }
}

async function save(
  config: ReturnType<typeof requireSupabase>,
  email: string,
  store: Store,
) {
  await kvSet(config, BUCKET, email.toLowerCase(), store)
}

export const Route = createFileRoute('/api/mentor-documents')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = getBearerSession(request)
        if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
        const url = new URL(request.url)
        if (url.searchParams.get('listMentors') === '1') {
          if (session.role !== 'admin') {
            return Response.json({ error: 'Forbidden' }, { status: 403 })
          }
          try {
            const config = requireSupabase()
            const users = await listUsers(config)
            const mentors = users
              .filter((u) => u.role === 'mentor')
              .map((u) => ({ name: String(u.name || ''), email: u.email }))
            return Response.json({ mentors })
          } catch (e) {
            console.error(e)
            return Response.json({ error: 'Failed' }, { status: 500 })
          }
        }
        const email = String(url.searchParams.get('email') || '')
          .trim()
          .toLowerCase()
        if (!email) return Response.json({ error: 'email required' }, { status: 400 })
        if (session.role === 'mentor' && session.email.toLowerCase() !== email) {
          return Response.json({ error: 'Forbidden' }, { status: 403 })
        }
        if (session.role === 'student') {
          return Response.json({ error: 'Forbidden' }, { status: 403 })
        }
        try {
          const config = requireSupabase()
          const store = await load(config, email)
          return Response.json({ documents: store.documents })
        } catch (e) {
          console.error(e)
          return Response.json({ error: 'Failed' }, { status: 500 })
        }
      },
      PUT: async ({ request }) => {
        const session = getBearerSession(request)
        if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
        let body: Record<string, unknown>
        try {
          body = await request.json()
        } catch {
          return Response.json({ error: 'Invalid JSON' }, { status: 400 })
        }
        const email = String(body.email || '').toLowerCase()
        const docId = parseInt(String(body.docId ?? ''), 10)
        if (!email || !docId) return Response.json({ error: 'bad request' }, { status: 400 })
        if (session.role !== 'mentor' || session.email.toLowerCase() !== email) {
          return Response.json({ error: 'Forbidden' }, { status: 403 })
        }
        try {
          const config = requireSupabase()
          const store = await load(config, email)
          let idx = store.documents.findIndex((d) => d.id === docId)
          if (idx === -1) {
            store.documents.push({
              id: docId,
              title: String(body.title || 'Untitled'),
              content: String(body.content || ''),
              tabs: body.tabs,
              activeTabId: body.activeTabId,
            })
            idx = store.documents.length - 1
          }
          const prev = store.documents[idx]!
          const nextVer = (store.versions[String(docId)] ?? 0) + 1
          store.documents[idx] = {
            ...prev,
            title: body.title !== undefined ? String(body.title) : prev.title,
            content: body.content !== undefined ? String(body.content) : prev.content,
            tabs: body.tabs !== undefined ? body.tabs : prev.tabs,
            activeTabId:
              body.activeTabId !== undefined ? body.activeTabId : prev.activeTabId,
          }
          store.versions[String(docId)] = nextVer
          await save(config, email, store)
          return Response.json({ version: nextVer })
        } catch (e) {
          console.error(e)
          return Response.json({ error: 'Failed' }, { status: 500 })
        }
      },
    },
  },
})
