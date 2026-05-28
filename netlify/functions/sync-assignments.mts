import { getStore } from '@netlify/blobs'

export const config = { path: '/api/sync-assignments' }

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function withCors(response: Response) {
  const headers = new Headers(response.headers)
  Object.entries(corsHeaders()).forEach(([k, v]) => headers.set(k, v))
  return new Response(response.body, { status: response.status, headers })
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

export default async (request: Request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() })
  }

  if (request.method !== 'POST') {
    return withCors(json({ error: 'Method not allowed' }, 405))
  }

  const session = await getSession(request)
  if (!session || session.role !== 'admin') {
    return withCors(json({ error: 'Unauthorized — admin only' }, 401))
  }

  try {
    const userStore = getStore('litwits-users')
    const { blobs } = await userStore.list()
    const allUsers = await Promise.all(
      blobs.map((b) => userStore.get(b.key, { type: 'json' }))
    )
    const valid = allUsers.filter(Boolean) as any[]

    const mentorEmails = valid
      .filter((u) => u.role === 'mentor')
      .map((u) => u.email)

    const students = valid.filter((u) => u.role === 'student')

    let updated = 0

    // Batch: ensure every student has ALL mentors assigned
    for (const student of students) {
      const existing = Array.isArray(student.assignedMentors)
        ? student.assignedMentors
        : student.mentorEmail
          ? [student.mentorEmail]
          : []

      // Merge existing with full mentor list, deduplicate
      const merged = Array.from(new Set([...existing, ...mentorEmails]))

      // Only write if the set actually changed
      if (merged.length !== existing.length || !merged.every((m: string) => existing.includes(m))) {
        const updatedStudent = { ...student, assignedMentors: merged }
        delete updatedStudent.mentorEmail
        await userStore.setJSON(emailToKey(student.email), updatedStudent)
        updated++
      }
    }

    return withCors(
      json({
        success: true,
        totalStudents: students.length,
        totalMentors: mentorEmails.length,
        studentsUpdated: updated,
      })
    )
  } catch (err) {
    console.error('POST /api/sync-assignments', err)
    return withCors(json({ error: 'Server error' }, 500))
  }
}
