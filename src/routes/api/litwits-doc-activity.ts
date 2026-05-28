import { createFileRoute } from '@tanstack/react-router'
import { requireSupabase } from '@/server/env'
import { getBearerSession } from '@/server/session'
import { kvGet, kvSet } from '@/server/kv'

const BUCKET = 'lit_spark'
const KEY = 'activity_logs'

type Log = Record<string, unknown>

export const Route = createFileRoute('/api/litwits-doc-activity')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = getBearerSession(request)
        if (!session || session.role !== 'admin') {
          return Response.json({ error: 'Forbidden' }, { status: 403 })
        }
        const url = new URL(request.url)
        const user = url.searchParams.get('user')
        const docId = url.searchParams.get('docId')
        const date = url.searchParams.get('date')
        try {
          const config = requireSupabase()
          const data = await kvGet<{ logs: Log[] }>(config, BUCKET, KEY)
          let logs = data?.logs || []
          if (user) logs = logs.filter((l) => String(l.userEmail || '') === user)
          if (docId) logs = logs.filter((l) => String(l.documentId || '') === docId)
          if (date) {
            const day = new Date(date).setHours(0, 0, 0, 0)
            const next = day + 86400000
            logs = logs.filter((l) => {
              const ts = Number(l.timestamp) || 0
              return ts >= day && ts < next
            })
          }
          return Response.json({ logs })
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
        const docId = String(body.docId ?? '')
        const action = String(body.action || '')
        const duration = typeof body.duration === 'number' ? body.duration : undefined
        if (!docId) return Response.json({ error: 'docId required' }, { status: 400 })
        try {
          const config = requireSupabase()
          const cur = (await kvGet<{ logs: Log[] }>(config, BUCKET, KEY)) || { logs: [] }
          cur.logs.push({
            userName: session.name,
            userEmail: session.email,
            userRole: session.role,
            documentId: docId,
            action,
            timestamp: Date.now(),
            duration: duration ?? 0,
          })
          if (cur.logs.length > 5000) cur.logs = cur.logs.slice(-4000)
          await kvSet(config, BUCKET, KEY, cur)
          return Response.json({ ok: true })
        } catch (e) {
          console.error(e)
          return Response.json({ error: 'Failed' }, { status: 500 })
        }
      },
    },
  },
})
