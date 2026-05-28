import { createFileRoute } from '@tanstack/react-router'
import { requireSupabase } from '@/server/env'
import { getBearerSession } from '@/server/session'
import { kvGet, kvSet } from '@/server/kv'

const BUCKET = 'tab_order'

export const Route = createFileRoute('/api/tab-order')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!getBearerSession(request)) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }
        const url = new URL(request.url)
        const documentKey = String(url.searchParams.get('documentKey') || '')
        if (!documentKey) return Response.json({ error: 'documentKey required' }, { status: 400 })
        try {
          const config = requireSupabase()
          const row = await kvGet<{ tabOrder: string[] }>(config, BUCKET, documentKey)
          return Response.json({ tabOrder: row?.tabOrder ?? null })
        } catch (e) {
          console.error(e)
          return Response.json({ error: 'Failed' }, { status: 500 })
        }
      },
      POST: async ({ request }) => {
        if (!getBearerSession(request)) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }
        let body: { documentKey?: string; tabOrder?: string[] }
        try {
          body = await request.json()
        } catch {
          return Response.json({ error: 'Invalid JSON' }, { status: 400 })
        }
        const documentKey = String(body.documentKey || '')
        const tabOrder = Array.isArray(body.tabOrder) ? body.tabOrder.map(String) : []
        if (!documentKey) return Response.json({ error: 'documentKey required' }, { status: 400 })
        try {
          const config = requireSupabase()
          await kvSet(config, BUCKET, documentKey, { tabOrder })
          return Response.json({ ok: true })
        } catch (e) {
          console.error(e)
          return Response.json({ error: 'Failed' }, { status: 500 })
        }
      },
    },
  },
})
