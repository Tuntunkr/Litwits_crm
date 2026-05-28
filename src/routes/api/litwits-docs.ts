import { createFileRoute } from '@tanstack/react-router'
import { requireSupabase } from '@/server/env'
import { getBearerSession } from '@/server/session'
import { kvDelete, kvGet, kvListBucket, kvSet } from '@/server/kv'

const DOC_BUCKET = 'litwits_doc'
const VER_BUCKET = 'litwits_ver'

type LitDoc = Record<string, unknown> & { id: string }

function sessionOk(s: ReturnType<typeof getBearerSession>) {
  return Boolean(s)
}

async function listLitwitsDocs(config: ReturnType<typeof requireSupabase>) {
  const rows = await kvListBucket(config, DOC_BUCKET)
  return rows.map((r) => r.value as LitDoc)
}

async function appendVersion(
  config: ReturnType<typeof requireSupabase>,
  docId: string,
  doc: LitDoc,
  editor: { name: string; email: string },
) {
  const key = docId
  type Snap = {
    versions: { timestamp: number; editedBy: string; editedByEmail: string; title: string }[]
    byTs: Record<string, { content?: string; title?: string; tabs?: unknown; activeTabId?: unknown }>
  }
  const cur = (await kvGet<Snap>(config, VER_BUCKET, key)) || { versions: [], byTs: {} }
  const ts = Date.now()
  cur.versions.push({
    timestamp: ts,
    editedBy: editor.name,
    editedByEmail: editor.email,
    title: String(doc.title || ''),
  })
  cur.byTs[String(ts)] = {
    content: String(doc.content || ''),
    title: String(doc.title || ''),
    tabs: doc.tabs,
    activeTabId: doc.activeTabId,
  }
  await kvSet(config, VER_BUCKET, key, cur)
}

export const Route = createFileRoute('/api/litwits-docs')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!sessionOk(getBearerSession(request))) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }
        try {
          const config = requireSupabase()
          const documents = await listLitwitsDocs(config)
          return Response.json({ documents })
        } catch (e) {
          console.error(e)
          return Response.json({ error: 'Failed' }, { status: 500 })
        }
      },
      POST: async ({ request }) => {
        const session = getBearerSession(request)
        if (!session || session.role !== 'admin') {
          return Response.json({ error: 'Forbidden' }, { status: 403 })
        }
        let body: Record<string, unknown>
        try {
          body = await request.json()
        } catch {
          return Response.json({ error: 'Invalid JSON' }, { status: 400 })
        }
        const id = String(body.docId || body.id || `custom-${Date.now()}`)
        try {
          const config = requireSupabase()
          const doc: LitDoc = {
            id,
            title: String(body.title || 'Untitled'),
            category: String(body.category || 'Other Documents'),
            content: String(body.content || ''),
            tabs: body.tabs,
            activeTabId: body.activeTabId,
            lastEditedBy: session.name,
            lastEditedAt: Date.now(),
            __sync: 0,
          }
          await kvSet(config, DOC_BUCKET, id, doc)
          await appendVersion(config, id, doc, { name: session.name, email: session.email })
          return Response.json({ document: doc })
        } catch (e) {
          console.error(e)
          return Response.json({ error: 'Failed' }, { status: 500 })
        }
      },
      PUT: async ({ request }) => {
        const session = getBearerSession(request)
        if (!session || session.role !== 'admin') {
          return Response.json({ error: 'Forbidden' }, { status: 403 })
        }
        let body: Record<string, unknown>
        try {
          body = await request.json()
        } catch {
          return Response.json({ error: 'Invalid JSON' }, { status: 400 })
        }
        const docId = String(body.docId || '')
        if (!docId) return Response.json({ error: 'docId required' }, { status: 400 })
        try {
          const config = requireSupabase()
          const prev = await kvGet<LitDoc>(config, DOC_BUCKET, docId)
          const doc: LitDoc = {
            ...(prev || { id: docId }),
            id: docId,
            title: body.title !== undefined ? String(body.title) : String(prev?.title || ''),
            category:
              body.category !== undefined
                ? String(body.category)
                : String(prev?.category || 'Other Documents'),
            content:
              body.content !== undefined ? String(body.content) : String(prev?.content || ''),
            tabs: body.tabs !== undefined ? body.tabs : prev?.tabs,
            activeTabId:
              body.activeTabId !== undefined ? body.activeTabId : prev?.activeTabId,
            lastEditedBy: session.name,
            lastEditedAt: Date.now(),
          }
          await kvSet(config, DOC_BUCKET, docId, doc)
          await appendVersion(config, docId, doc, { name: session.name, email: session.email })
          return Response.json({ ok: true })
        } catch (e) {
          console.error(e)
          return Response.json({ error: 'Failed' }, { status: 500 })
        }
      },
      DELETE: async ({ request }) => {
        const session = getBearerSession(request)
        if (!session || session.role !== 'admin') {
          return Response.json({ error: 'Forbidden' }, { status: 403 })
        }
        const url = new URL(request.url)
        const docId = String(url.searchParams.get('docId') || '')
        if (!docId) return Response.json({ error: 'docId required' }, { status: 400 })
        try {
          const config = requireSupabase()
          await kvDelete(config, DOC_BUCKET, docId)
          await kvDelete(config, VER_BUCKET, docId)
          return new Response(null, { status: 204 })
        } catch (e) {
          console.error(e)
          return Response.json({ error: 'Failed' }, { status: 500 })
        }
      },
    },
  },
})
