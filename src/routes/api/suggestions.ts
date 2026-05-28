import { createFileRoute } from '@tanstack/react-router'
import { requireSupabase } from '@/server/env'
import { getBearerSession } from '@/server/session'
import { kvGet, kvSet } from '@/server/kv'

const BUCKET = 'doc_suggestions'

function key(email: string, docId: string | number) {
  return `${email.toLowerCase()}:${String(docId)}`
}

export const Route = createFileRoute('/api/suggestions')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!getBearerSession(request)) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }
        const url = new URL(request.url)
        const email = String(url.searchParams.get('email') || '').toLowerCase()
        const docId = String(url.searchParams.get('docId') || '')
        if (!email || !docId) return Response.json({ error: 'bad request' }, { status: 400 })
        try {
          const config = requireSupabase()
          const data = await kvGet<{ suggestions: Record<string, unknown>[] }>(
            config,
            BUCKET,
            key(email, docId),
          )
          return Response.json({ suggestions: data?.suggestions || [] })
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
        const docId = String(body.docId ?? '')
        if (!email || !docId) return Response.json({ error: 'bad request' }, { status: 400 })
        try {
          const config = requireSupabase()
          const k = key(email, docId)
          const cur = (await kvGet<{ suggestions: Record<string, unknown>[] }>(
            config,
            BUCKET,
            k,
          )) || { suggestions: [] }
          const suggestion = {
            id: `s-${Date.now()}`,
            from: Number(body.from) || 0,
            to: Number(body.to) || 0,
            originalText: String(body.originalText || ''),
            suggestedText: String(body.suggestedText || ''),
            authorName: session.name,
            authorEmail: session.email,
            role: session.role,
            timestamp: Date.now(),
            status: 'pending',
          }
          cur.suggestions.push(suggestion)
          await kvSet(config, BUCKET, k, cur)
          return Response.json({ suggestion })
        } catch (e) {
          console.error(e)
          return Response.json({ error: 'Failed' }, { status: 500 })
        }
      },
      PUT: async ({ request }) => {
        if (!getBearerSession(request)) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }
        let body: Record<string, unknown>
        try {
          body = await request.json()
        } catch {
          return Response.json({ error: 'Invalid JSON' }, { status: 400 })
        }
        const email = String(body.email || '').toLowerCase()
        const docId = String(body.docId ?? '')
        const suggestionId = String(body.suggestionId || '')
        const status = String(body.status || '')
        if (!email || !docId || !suggestionId) {
          return Response.json({ error: 'bad request' }, { status: 400 })
        }
        try {
          const config = requireSupabase()
          const k = key(email, docId)
          const cur = await kvGet<{ suggestions: Record<string, unknown>[] }>(
            config,
            BUCKET,
            k,
          )
          if (!cur) return Response.json({ error: 'Not found' }, { status: 404 })
          const s = cur.suggestions.find((x) => x.id === suggestionId)
          if (!s) return Response.json({ error: 'Not found' }, { status: 404 })
          if (status) s.status = status
          await kvSet(config, BUCKET, k, cur)
          return Response.json({ ok: true })
        } catch (e) {
          console.error(e)
          return Response.json({ error: 'Failed' }, { status: 500 })
        }
      },
    },
  },
})
