import { createFileRoute } from '@tanstack/react-router'
import { requireSupabase } from '@/server/env'
import { getBearerSession } from '@/server/session'
import { kvGet, kvSet } from '@/server/kv'

type Reply = Record<string, unknown>
type Comment = Record<string, unknown> & { id: string; replies?: Reply[] }

const BUCKET = 'doc_comments'

function key(email: string, docId: string | number) {
  return `${email.toLowerCase()}:${String(docId)}`
}

export const Route = createFileRoute('/api/comments')({
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
          const data = await kvGet<{ comments: Comment[] }>(
            config,
            BUCKET,
            key(email, docId),
          )
          return Response.json({ comments: data?.comments || [] })
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
        const parentId = body.parentId ? String(body.parentId) : null
        if (!email || !docId) return Response.json({ error: 'bad request' }, { status: 400 })
        try {
          const config = requireSupabase()
          const k = key(email, docId)
          const cur = (await kvGet<{ comments: Comment[] }>(config, BUCKET, k)) || {
            comments: [],
          }
          if (parentId) {
            const reply: Reply = {
              id: `r-${Date.now()}`,
              text: String(body.text || ''),
              authorName: session.name,
              authorEmail: session.email,
              role: session.role,
              timestamp: Date.now(),
            }
            const c = cur.comments.find((x) => x.id === parentId)
            if (!c) return Response.json({ error: 'Not found' }, { status: 404 })
            const replies = Array.isArray(c.replies) ? [...c.replies] : []
            replies.push(reply)
            c.replies = replies
          } else {
            const comment: Comment = {
              id: `c-${Date.now()}`,
              selectedText: String(body.selectedText || ''),
              from: Number(body.from) || 0,
              to: Number(body.to) || 0,
              text: String(body.text || ''),
              authorName: session.name,
              authorEmail: session.email,
              role: session.role,
              timestamp: Date.now(),
              resolved: false,
              replies: [],
            }
            cur.comments.push(comment)
            await kvSet(config, BUCKET, k, cur)
            return Response.json({ comment })
          }
          await kvSet(config, BUCKET, k, cur)
          return Response.json({ ok: true })
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
        const commentId = String(body.commentId || '')
        if (!email || !docId || !commentId) {
          return Response.json({ error: 'bad request' }, { status: 400 })
        }
        try {
          const config = requireSupabase()
          const k = key(email, docId)
          const cur = await kvGet<{ comments: Comment[] }>(config, BUCKET, k)
          if (!cur) return Response.json({ error: 'Not found' }, { status: 404 })
          const c = cur.comments.find((x) => x.id === commentId)
          if (!c) return Response.json({ error: 'Not found' }, { status: 404 })
          if (body.replyId) {
            const replies = (c.replies || []) as Reply[]
            const r = replies.find((x) => x.id === String(body.replyId))
            if (!r) return Response.json({ error: 'Not found' }, { status: 404 })
            if (body.text !== undefined) r.text = String(body.text)
          } else {
            if (body.text !== undefined) c.text = String(body.text)
            if (body.resolved !== undefined) c.resolved = Boolean(body.resolved)
          }
          await kvSet(config, BUCKET, k, cur)
          return Response.json({ ok: true })
        } catch (e) {
          console.error(e)
          return Response.json({ error: 'Failed' }, { status: 500 })
        }
      },
      DELETE: async ({ request }) => {
        if (!getBearerSession(request)) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }
        const url = new URL(request.url)
        const email = String(url.searchParams.get('email') || '').toLowerCase()
        const docId = String(url.searchParams.get('docId') || '')
        const commentId = String(url.searchParams.get('commentId') || '')
        const replyId = url.searchParams.get('replyId')
        if (!email || !docId || !commentId) {
          return Response.json({ error: 'bad request' }, { status: 400 })
        }
        try {
          const config = requireSupabase()
          const k = key(email, docId)
          const cur = await kvGet<{ comments: Comment[] }>(config, BUCKET, k)
          if (!cur) return Response.json({ error: 'Not found' }, { status: 404 })
          const c = cur.comments.find((x) => x.id === commentId)
          if (!c) return Response.json({ error: 'Not found' }, { status: 404 })
          if (replyId) {
            c.replies = (c.replies || []).filter((r) => (r as Reply).id !== replyId)
          } else {
            cur.comments = cur.comments.filter((x) => x.id !== commentId)
          }
          await kvSet(config, BUCKET, k, cur)
          return new Response(null, { status: 204 })
        } catch (e) {
          console.error(e)
          return Response.json({ error: 'Failed' }, { status: 500 })
        }
      },
    },
  },
})
