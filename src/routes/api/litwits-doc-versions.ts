import { createFileRoute } from '@tanstack/react-router'
import { requireSupabase } from '@/server/env'
import { getBearerSession } from '@/server/session'
import { kvGet, kvSet } from '@/server/kv'

const VER_BUCKET = 'litwits_ver'
const DOC_BUCKET = 'litwits_doc'

type Snap = {
  versions: { timestamp: number; editedBy: string; editedByEmail: string; title: string }[]
  byTs: Record<string, { content?: string; title?: string; tabs?: unknown; activeTabId?: unknown }>
}

export const Route = createFileRoute('/api/litwits-doc-versions')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!getBearerSession(request)) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }
        const url = new URL(request.url)
        const docId = String(url.searchParams.get('docId') || '')
        const versionTs = url.searchParams.get('version')
        if (!docId) return Response.json({ error: 'docId required' }, { status: 400 })
        try {
          const config = requireSupabase()
          const data = await kvGet<Snap>(config, VER_BUCKET, docId)
          if (versionTs) {
            const snap = data?.byTs?.[versionTs]
            if (!snap) return Response.json({ error: 'Not found' }, { status: 404 })
            return Response.json({
              version: { content: snap.content || '', title: snap.title, ...snap },
            })
          }
          return Response.json({ versions: data?.versions || [] })
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
        let body: { docId?: string; versionTimestamp?: number }
        try {
          body = await request.json()
        } catch {
          return Response.json({ error: 'Invalid JSON' }, { status: 400 })
        }
        const docId = String(body.docId || '')
        const ts = String(body.versionTimestamp ?? '')
        if (!docId || !ts) return Response.json({ error: 'bad request' }, { status: 400 })
        try {
          const config = requireSupabase()
          const snapStore = await kvGet<Snap>(config, VER_BUCKET, docId)
          const snap = snapStore?.byTs?.[ts]
          if (!snap) return Response.json({ error: 'Not found' }, { status: 404 })
          const prev = (await kvGet<Record<string, unknown>>(config, DOC_BUCKET, docId)) || {
            id: docId,
          }
          const nextVer = (typeof prev.__sync === 'number' ? (prev.__sync as number) : 0) + 1
          const doc = {
            ...prev,
            id: docId,
            content: String(snap.content || ''),
            title: snap.title !== undefined ? String(snap.title) : String(prev.title || ''),
            tabs: snap.tabs !== undefined ? snap.tabs : prev.tabs,
            activeTabId:
              snap.activeTabId !== undefined ? snap.activeTabId : prev.activeTabId,
            lastEditedBy: session.name,
            lastEditedAt: Date.now(),
            __sync: nextVer,
          }
          await kvSet(config, DOC_BUCKET, docId, doc)
          return Response.json({ ok: true })
        } catch (e) {
          console.error(e)
          return Response.json({ error: 'Failed' }, { status: 500 })
        }
      },
    },
  },
})
