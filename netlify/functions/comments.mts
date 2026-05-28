import { getStore } from '@netlify/blobs'

export const config = { path: '/api/comments', method: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'] }

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  })
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }
}

function emailToKey(email: string): string {
  return email.toLowerCase().replace(/[^a-z0-9]/g, '_')
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

async function canAccess(session: any, targetEmail: string): Promise<boolean> {
  if (session.role === 'admin') return true
  if (session.role === 'student') return session.email === targetEmail
  if (session.role === 'mentor') {
    try {
      const userStore = getStore('litwits-users')
      const student = await userStore.get(emailToKey(targetEmail), { type: 'json' }) as any
      if (Array.isArray(student?.assignedMentors)) {
        return student.assignedMentors.includes(session.email)
      }
      return student?.mentorEmail === session.email
    } catch {
      return false
    }
  }
  return false
}

interface Comment {
  id: string
  selectedText: string
  from: number
  to: number
  text: string
  authorName: string
  authorEmail: string
  role: string
  timestamp: number
  resolved: boolean
  replies: Reply[]
}

interface Reply {
  id: string
  text: string
  authorName: string
  authorEmail: string
  role: string
  timestamp: number
}

function commentsKey(ownerEmail: string, docId: number): string {
  return `${emailToKey(ownerEmail)}:doc:${docId}:comments`
}

export default async (request: Request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() })
  }

  const session = await getSession(request)
  if (!session) return json({ error: 'Unauthorized' }, 401)

  const url = new URL(request.url)
  const store = getStore({ name: 'litwits-comments', consistency: 'strong' })

  // GET — fetch comments for a document
  if (request.method === 'GET') {
    const ownerEmail = url.searchParams.get('email') || ''
    const docId = parseInt(url.searchParams.get('docId') || '0')
    if (!ownerEmail || !docId) return json({ error: 'Missing email or docId' }, 400)

    const allowed = await canAccess(session, ownerEmail)
    if (!allowed) return json({ error: 'Forbidden' }, 403)

    const key = commentsKey(ownerEmail, docId)
    const comments = await store.get(key, { type: 'json' }) as Comment[] | null
    return json({ comments: comments || [] })
  }

  // POST — add a new comment or reply
  if (request.method === 'POST') {
    const body = await request.json() as any
    const { email: ownerEmail, docId, selectedText, from, to, text, parentId } = body
    if (!ownerEmail || !docId) return json({ error: 'Missing email or docId' }, 400)

    const allowed = await canAccess(session, ownerEmail)
    if (!allowed) return json({ error: 'Forbidden' }, 403)

    const key = commentsKey(ownerEmail, docId)
    const comments = (await store.get(key, { type: 'json' }) as Comment[] | null) || []

    if (parentId) {
      // Add reply to existing comment
      const comment = comments.find(c => c.id === parentId)
      if (!comment) return json({ error: 'Comment not found' }, 404)
      const reply: Reply = {
        id: crypto.randomUUID(),
        text,
        authorName: session.name,
        authorEmail: session.email,
        role: session.role,
        timestamp: Date.now(),
      }
      comment.replies.push(reply)
      await store.setJSON(key, comments)
      return json({ reply })
    } else {
      // New comment
      const comment: Comment = {
        id: crypto.randomUUID(),
        selectedText: selectedText || '',
        from: from || 0,
        to: to || 0,
        text,
        authorName: session.name,
        authorEmail: session.email,
        role: session.role,
        timestamp: Date.now(),
        resolved: false,
        replies: [],
      }
      comments.push(comment)
      await store.setJSON(key, comments)
      return json({ comment })
    }
  }

  // PUT — edit comment, resolve/reopen
  if (request.method === 'PUT') {
    const body = await request.json() as any
    const { email: ownerEmail, docId, commentId, replyId, text, resolved } = body
    if (!ownerEmail || !docId || !commentId) return json({ error: 'Missing fields' }, 400)

    const allowed = await canAccess(session, ownerEmail)
    if (!allowed) return json({ error: 'Forbidden' }, 403)

    const key = commentsKey(ownerEmail, docId)
    const comments = (await store.get(key, { type: 'json' }) as Comment[] | null) || []
    const comment = comments.find(c => c.id === commentId)
    if (!comment) return json({ error: 'Comment not found' }, 404)

    if (replyId) {
      const reply = comment.replies.find(r => r.id === replyId)
      if (!reply) return json({ error: 'Reply not found' }, 404)
      if (reply.authorEmail !== session.email && session.role !== 'admin') {
        return json({ error: 'Can only edit own replies' }, 403)
      }
      if (text !== undefined) reply.text = text
    } else {
      if (resolved !== undefined) {
        comment.resolved = resolved
      }
      if (text !== undefined) {
        if (comment.authorEmail !== session.email && session.role !== 'admin') {
          return json({ error: 'Can only edit own comments' }, 403)
        }
        comment.text = text
      }
    }

    await store.setJSON(key, comments)
    return json({ success: true })
  }

  // DELETE — delete a comment or reply
  if (request.method === 'DELETE') {
    const ownerEmail = url.searchParams.get('email') || ''
    const docId = parseInt(url.searchParams.get('docId') || '0')
    const commentId = url.searchParams.get('commentId') || ''
    const replyId = url.searchParams.get('replyId') || ''
    if (!ownerEmail || !docId || !commentId) return json({ error: 'Missing fields' }, 400)

    const allowed = await canAccess(session, ownerEmail)
    if (!allowed) return json({ error: 'Forbidden' }, 403)

    const key = commentsKey(ownerEmail, docId)
    let comments = (await store.get(key, { type: 'json' }) as Comment[] | null) || []

    if (replyId) {
      const comment = comments.find(c => c.id === commentId)
      if (!comment) return json({ error: 'Comment not found' }, 404)
      const reply = comment.replies.find(r => r.id === replyId)
      if (!reply) return json({ error: 'Reply not found' }, 404)
      if (reply.authorEmail !== session.email && session.role !== 'admin') {
        return json({ error: 'Can only delete own replies' }, 403)
      }
      comment.replies = comment.replies.filter(r => r.id !== replyId)
    } else {
      const comment = comments.find(c => c.id === commentId)
      if (!comment) return json({ error: 'Comment not found' }, 404)
      if (comment.authorEmail !== session.email && session.role !== 'admin') {
        return json({ error: 'Can only delete own comments' }, 403)
      }
      comments = comments.filter(c => c.id !== commentId)
    }

    await store.setJSON(key, comments)
    return json({ success: true })
  }

  return json({ error: 'Method not allowed' }, 405)
}
