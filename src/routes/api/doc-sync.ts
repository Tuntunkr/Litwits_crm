import { createFileRoute } from '@tanstack/react-router'
import { requireSupabase } from '@/server/env'
import { getBearerSession } from '@/server/session'
import {
  loadStudentDocStore,
  saveStudentDocStore,
  type DocRow,
} from '@/server/student-docs'

function canAccessStudentDocs(
  session: NonNullable<ReturnType<typeof getBearerSession>>,
  email: string,
) {
  if (session.role === 'admin' || session.role === 'mentor') return true
  return session.email.toLowerCase() === email.toLowerCase()
}

function stripInternals(doc: DocRow) {
  const { _sync, ...rest } = doc as DocRow & { _sync?: number }
  return rest
}

export const Route = createFileRoute('/api/doc-sync')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = getBearerSession(request)
        if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
        const url = new URL(request.url)
        const email = String(url.searchParams.get('email') || '').toLowerCase()
        const docId = parseInt(String(url.searchParams.get('docId') || ''), 10)
        const since = parseInt(String(url.searchParams.get('since') || '0'), 10) || 0
        if (!email || !docId) {
          return Response.json({ error: 'bad request' }, { status: 400 })
        }
        if (!canAccessStudentDocs(session, email)) {
          return Response.json({ error: 'Forbidden' }, { status: 403 })
        }
        try {
          const config = requireSupabase()
          const store = await loadStudentDocStore(config, email)
          const v = store.versions[String(docId)] ?? 0
          const doc = store.documents.find((d) => d.id === docId)
          if (!doc) {
            return Response.json({ changed: false, version: v })
          }
          if (since >= v) {
            return Response.json({ changed: false, version: v })
          }
          const clean = stripInternals(doc)
          return Response.json({
            changed: true,
            version: v,
            title: clean.title,
            content: clean.content,
            tabs: clean.tabs,
            activeTabId: clean.activeTabId,
            editedBy: '',
          })
        } catch (e) {
          console.error(e)
          return Response.json({ error: 'Failed' }, { status: 500 })
        }
      },
      POST: async ({ request }) => {
        const session = getBearerSession(request)
        if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
        let body: Record<string, unknown>
        try {
          body = await request.json()
        } catch {
          return Response.json({ error: 'Invalid JSON' }, { status: 400 })
        }
        const email = String(body.email || '').toLowerCase()
        const rawId = parseInt(String(body.docId ?? ''), 10)
        if (!email) return Response.json({ error: 'email required' }, { status: 400 })
        if (!canAccessStudentDocs(session, email)) {
          return Response.json({ error: 'Forbidden' }, { status: 403 })
        }
        try {
          const config = requireSupabase()
          const store = await loadStudentDocStore(config, email)
          let docId = rawId
          let idx = store.documents.findIndex((d) => d.id === docId)

          if (idx === -1) {
            const nextId =
              store.documents.length > 0
                ? Math.max(...store.documents.map((d) => Number(d.id) || 0)) + 1
                : 1
            docId = Number.isFinite(rawId) && rawId > 0 ? rawId : nextId
            if (store.documents.some((d) => d.id === docId)) {
              idx = store.documents.findIndex((d) => d.id === docId)
            } else {
              store.documents.push({
                id: docId,
                title: String(body.title || 'Untitled'),
                content: String(body.content || ''),
                tabs: body.tabs,
                activeTabId: body.activeTabId,
              })
              idx = store.documents.length - 1
            }
          }

          if (idx === -1 || idx >= store.documents.length) {
            return Response.json({ error: 'Not found' }, { status: 404 })
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
          await saveStudentDocStore(config, email, store)
          return Response.json({ version: nextVer })
        } catch (e) {
          console.error(e)
          return Response.json({ error: 'Failed' }, { status: 500 })
        }
      },
    },
  },
})
