import { createFileRoute } from '@tanstack/react-router'
import { requireSupabase } from '@/server/env'
import { getBearerSession } from '@/server/session'
import { kvGet, kvSet } from '@/server/kv'

type LitDoc = Record<string, unknown> & { id: string }

const DOC_BUCKET = 'litwits_doc'
const VER_BUCKET = 'litwits_ver'

async function bumpVersion(
  config: ReturnType<typeof requireSupabase>,
  docId: string,
  doc: LitDoc,
  editor: { name: string; email: string },
) {
  type Snap = {
    versions: { timestamp: number; editedBy: string; editedByEmail: string; title: string }[]
    byTs: Record<string, { content?: string; title?: string; tabs?: unknown; activeTabId?: unknown }>
  }
  const cur = (await kvGet<Snap>(config, VER_BUCKET, docId)) || { versions: [], byTs: {} }
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
  await kvSet(config, VER_BUCKET, docId, cur)
}

export const Route = createFileRoute('/api/litwits-doc-sync')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!getBearerSession(request)) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }
        const url = new URL(request.url)
        const docId = String(url.searchParams.get('docId') || '')
        const since = parseInt(String(url.searchParams.get('since') || '0'), 10) || 0
        if (!docId) return Response.json({ error: 'docId required' }, { status: 400 })
        try {
          const config = requireSupabase()
          const doc = await kvGet<LitDoc>(config, DOC_BUCKET, docId)
          const ver = typeof doc?.__sync === 'number' ? (doc.__sync as number) : 0
          if (!doc) return Response.json({ changed: false, version: since })
          if (since >= ver) return Response.json({ changed: false, version: ver })
          const { __sync, ...clean } = doc as LitDoc & { __sync?: number }
          return Response.json({
            changed: true,
            version: ver,
            title: clean.title,
            content: clean.content,
            tabs: clean.tabs,
            activeTabId: clean.activeTabId,
            editedBy: clean.lastEditedBy || '',
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
        const docId = String(body.docId || '')
        if (!docId) return Response.json({ error: 'docId required' }, { status: 400 })
        if (session.role === 'mentor' || session.role === 'student' || session.role === 'admin') {
          // all authenticated roles may edit assigned flows; fine-grained checks optional
        }
        try {
          const config = requireSupabase()
          const prev = await kvGet<LitDoc>(config, DOC_BUCKET, docId)
          const nextVer =
            (typeof prev?.__sync === 'number' ? (prev.__sync as number) : 0) + 1
          const doc: LitDoc = {
            ...(prev || { id: docId }),
            id: docId,
            title: body.title !== undefined ? String(body.title) : String(prev?.title || ''),
            category: String(prev?.category || 'Other Documents'),
            content:
              body.content !== undefined ? String(body.content) : String(prev?.content || ''),
            tabs: body.tabs !== undefined ? body.tabs : prev?.tabs,
            activeTabId:
              body.activeTabId !== undefined ? body.activeTabId : prev?.activeTabId,
            lastEditedBy: session.name,
            lastEditedAt: Date.now(),
            __sync: nextVer,
          }
          await kvSet(config, DOC_BUCKET, docId, doc)
          await bumpVersion(config, docId, doc, { name: session.name, email: session.email })
          return Response.json({ version: nextVer })
        } catch (e) {
          console.error(e)
          return Response.json({ error: 'Failed' }, { status: 500 })
        }
      },
    },
  },
})
