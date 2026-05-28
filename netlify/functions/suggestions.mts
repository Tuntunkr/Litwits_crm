import { getStore } from '@netlify/blobs'

export const config = { path: '/api/suggestions', method: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'] }

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

interface Suggestion {
  id: string
  from: number
  to: number
  originalText: string
  suggestedText: string
  authorName: string
  authorEmail: string
  role: string
  timestamp: number
  status: 'pending' | 'accepted' | 'rejected'
}

function suggestionsKey(ownerEmail: string, docId: number): string {
  return `${emailToKey(ownerEmail)}:doc:${docId}:suggestions`
}

export default async (request: Request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() })
  }

  const session = await getSession(request)
  if (!session) return json({ error: 'Unauthorized' }, 401)

  const url = new URL(request.url)
  const store = getStore({ name: 'litwits-suggestions', consistency: 'strong' })

  // GET — fetch suggestions for a document
  if (request.method === 'GET') {
    const ownerEmail = url.searchParams.get('email') || ''
    const docId = parseInt(url.searchParams.get('docId') || '0')
    if (!ownerEmail || !docId) return json({ error: 'Missing email or docId' }, 400)

    const allowed = await canAccess(session, ownerEmail)
    if (!allowed) return json({ error: 'Forbidden' }, 403)

    const key = suggestionsKey(ownerEmail, docId)
    const suggestions = await store.get(key, { type: 'json' }) as Suggestion[] | null
    return json({ suggestions: suggestions || [] })
  }

  // POST — create a suggestion (mentor only typically)
  if (request.method === 'POST') {
    const body = await request.json() as any
    const { email: ownerEmail, docId, from, to, originalText, suggestedText } = body
    if (!ownerEmail || !docId) return json({ error: 'Missing email or docId' }, 400)

    const allowed = await canAccess(session, ownerEmail)
    if (!allowed) return json({ error: 'Forbidden' }, 403)

    const key = suggestionsKey(ownerEmail, docId)
    const suggestions = (await store.get(key, { type: 'json' }) as Suggestion[] | null) || []

    const suggestion: Suggestion = {
      id: crypto.randomUUID(),
      from: from || 0,
      to: to || 0,
      originalText: originalText || '',
      suggestedText: suggestedText || '',
      authorName: session.name,
      authorEmail: session.email,
      role: session.role,
      timestamp: Date.now(),
      status: 'pending',
    }
    suggestions.push(suggestion)
    await store.setJSON(key, suggestions)
    return json({ suggestion })
  }

  // PUT — accept or reject a suggestion
  if (request.method === 'PUT') {
    const body = await request.json() as any
    const { email: ownerEmail, docId, suggestionId, status } = body
    if (!ownerEmail || !docId || !suggestionId || !status) return json({ error: 'Missing fields' }, 400)

    const allowed = await canAccess(session, ownerEmail)
    if (!allowed) return json({ error: 'Forbidden' }, 403)

    // Only student (owner) or admin can accept/reject
    if (session.role === 'mentor' && session.email !== ownerEmail) {
      return json({ error: 'Only the document owner or admin can accept/reject suggestions' }, 403)
    }

    const key = suggestionsKey(ownerEmail, docId)
    const suggestions = (await store.get(key, { type: 'json' }) as Suggestion[] | null) || []
    const suggestion = suggestions.find(s => s.id === suggestionId)
    if (!suggestion) return json({ error: 'Suggestion not found' }, 404)

    suggestion.status = status
    await store.setJSON(key, suggestions)
    return json({ success: true, suggestion })
  }

  // DELETE — remove a suggestion
  if (request.method === 'DELETE') {
    const ownerEmail = url.searchParams.get('email') || ''
    const docId = parseInt(url.searchParams.get('docId') || '0')
    const suggestionId = url.searchParams.get('suggestionId') || ''
    if (!ownerEmail || !docId || !suggestionId) return json({ error: 'Missing fields' }, 400)

    const allowed = await canAccess(session, ownerEmail)
    if (!allowed) return json({ error: 'Forbidden' }, 403)

    const key = suggestionsKey(ownerEmail, docId)
    let suggestions = (await store.get(key, { type: 'json' }) as Suggestion[] | null) || []
    suggestions = suggestions.filter(s => s.id !== suggestionId)
    await store.setJSON(key, suggestions)
    return json({ success: true })
  }

  return json({ error: 'Method not allowed' }, 405)
}
