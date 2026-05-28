import { createFileRoute } from '@tanstack/react-router'
import { requireSupabase } from '@/server/env'
import { getBearerSession } from '@/server/session'
import { kvDelete } from '@/server/kv'
import {
  computeValidityEnd,
  enrichUser,
  getUserByEmail,
  listUsers,
  saveUser,
  todayISO,
  type StoredUser,
} from '@/server/users'

function json(data: unknown, status = 200) {
  return Response.json(data, { status })
}

function requireStaff(session: ReturnType<typeof getBearerSession>) {
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'admin' && session.role !== 'mentor') {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }
  return null
}

export const Route = createFileRoute('/api/users')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = getBearerSession(request)
        const deny = requireStaff(session)
        if (deny) return deny
        try {
          const config = requireSupabase()
          const users = await listUsers(config)
          return json({ users })
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'error'
          if (msg.includes('not configured')) return json({ error: msg }, 503)
          console.error(e)
          return json({ error: 'Failed' }, 500)
        }
      },
      POST: async ({ request }) => {
        const session = getBearerSession(request)
        if (!session || session.role !== 'admin') {
          return json({ error: 'Forbidden' }, 403)
        }
        let body: Partial<StoredUser>
        try {
          body = await request.json()
        } catch {
          return json({ error: 'Invalid JSON' }, 400)
        }
        const email = String(body.email || '')
          .trim()
          .toLowerCase()
        if (!email) return json({ error: 'Email required' }, 400)
        if (!String(body.password || '').trim()) {
          return json({ error: 'Password required' }, 400)
        }

        try {
          const config = requireSupabase()
          if (await getUserByEmail(config, email)) {
            return json({ error: 'User already exists' }, 409)
          }
          const role = String(body.role || 'student')
          const sessions = parseInt(String(body.packageSessions || '0'), 10) || 0
          const plan = (body.packagePlan as string) || 'numeric'
          const validityStart =
            role === 'student' ? String(body.validityStart || todayISO()) : String(body.validityStart || '')
          const validityEnd =
            role === 'student' && !body.validityEnd
              ? computeValidityEnd(validityStart, plan, sessions)
              : String(body.validityEnd || '')

          const u: StoredUser = enrichUser({
            name: String(body.name || ''),
            email,
            password: String(body.password || ''),
            role,
            phone: String(body.phone || ''),
            assignedMentors: Array.isArray(body.assignedMentors) ? body.assignedMentors : [],
            assignedLitwitsDocs: Array.isArray(body.assignedLitwitsDocs)
              ? body.assignedLitwitsDocs
              : [],
            validityStart,
            validityEnd,
            status: String(body.status || 'active'),
            packageSessions: sessions,
            sessionType: String(body.sessionType || ''),
            packagePlan: plan,
            attendedSessions: 0,
            srCount: typeof body.srCount === 'number' ? body.srCount : 0,
            manualAdjustment: 0,
            lastModified: 0,
          })

          const saved = await saveUser(config, email, u)
          return json({ user: saved })
        } catch (e) {
          console.error(e)
          return json({ error: 'Failed' }, 500)
        }
      },
      PUT: async ({ request }) => {
        const session = getBearerSession(request)
        if (!session || session.role !== 'admin') return json({ error: 'Forbidden' }, 403)
        let body: Record<string, unknown>
        try {
          body = await request.json()
        } catch {
          return json({ error: 'Invalid JSON' }, 400)
        }
        const email = String(body.email || '')
          .trim()
          .toLowerCase()
        if (!email) return json({ error: 'Email required' }, 400)

        try {
          const config = requireSupabase()
          const existing = await getUserByEmail(config, email)
          if (!existing) return json({ error: 'Not found' }, 404)

          const expected = body.expectedLastModified as number | undefined
          if (
            expected !== undefined &&
            Number(existing.lastModified || 0) !== Number(expected)
          ) {
            return json({ error: 'Conflict' }, 409)
          }

          const merged: StoredUser = {
            ...existing,
            ...(body.name !== undefined ? { name: String(body.name) } : {}),
            ...(body.password !== undefined ? { password: String(body.password) } : {}),
            ...(body.role !== undefined ? { role: String(body.role) } : {}),
            ...(body.phone !== undefined ? { phone: String(body.phone) } : {}),
            ...(body.assignedMentors !== undefined
              ? { assignedMentors: body.assignedMentors as string[] }
              : {}),
            ...(body.assignedLitwitsDocs !== undefined
              ? { assignedLitwitsDocs: body.assignedLitwitsDocs as string[] }
              : {}),
            ...(body.validityStart !== undefined
              ? { validityStart: String(body.validityStart) }
              : {}),
            ...(body.validityEnd !== undefined
              ? { validityEnd: String(body.validityEnd) }
              : {}),
            ...(body.status !== undefined ? { status: String(body.status) } : {}),
            ...(body.packageSessions !== undefined
              ? { packageSessions: Number(body.packageSessions) || 0 }
              : {}),
            ...(body.sessionType !== undefined
              ? { sessionType: String(body.sessionType) }
              : {}),
            ...(body.packagePlan !== undefined
              ? { packagePlan: String(body.packagePlan) }
              : {}),
            ...(body.attendedSessions !== undefined
              ? { attendedSessions: Number(body.attendedSessions) || 0 }
              : {}),
            ...(body.srCount !== undefined ? { srCount: Number(body.srCount) || 0 } : {}),
            ...(body.manualAdjustment !== undefined
              ? { manualAdjustment: Number(body.manualAdjustment) || 0 }
              : {}),
          }

          if (body.attendedSessions !== undefined) {
            merged.manualAdjustment =
              (Number(body.attendedSessions) || 0) - (merged.srCount ?? 0)
          }

          const saved = await saveUser(config, email, merged)
          return json({ user: saved })
        } catch (e) {
          console.error(e)
          return json({ error: 'Failed' }, 500)
        }
      },
      DELETE: async ({ request }) => {
        const session = getBearerSession(request)
        if (!session || session.role !== 'admin') return json({ error: 'Forbidden' }, 403)
        const url = new URL(request.url)
        const email = String(url.searchParams.get('email') || '')
          .trim()
          .toLowerCase()
        if (!email) return json({ error: 'email required' }, 400)
        try {
          const config = requireSupabase()
          await kvDelete(config, 'user', email)
          return new Response(null, { status: 204 })
        } catch (e) {
          console.error(e)
          return json({ error: 'Failed' }, 500)
        }
      },
    },
  },
})
