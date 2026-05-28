import { createFileRoute } from '@tanstack/react-router'
import { requireSupabase } from '@/server/env'
import { checkStudentValidity, getUserByEmail } from '@/server/users'
import { signSession } from '@/server/session'

export const Route = createFileRoute('/api/auth')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: { email?: string; password?: string }
        try {
          body = await request.json()
        } catch {
          return Response.json({ error: 'Invalid JSON' }, { status: 400 })
        }
        const email = String(body.email || '')
          .trim()
          .toLowerCase()
        const password = String(body.password || '')
        if (!email || !password) {
          return Response.json({ error: 'Email and password required' }, { status: 400 })
        }

        try {
          const config = requireSupabase()
          const user = await getUserByEmail(config, email)
          if (!user || user.password !== password) {
            return Response.json({ error: 'Invalid credentials' }, { status: 401 })
          }

          const role = user.role as 'admin' | 'mentor' | 'student'
          if (role !== 'admin' && role !== 'mentor' && role !== 'student') {
            return Response.json({ error: 'Invalid credentials' }, { status: 401 })
          }

          const v = checkStudentValidity(user)
          if ('expired' in v) {
            return Response.json({
              error: 'validity_expired',
              endDate: v.end,
              renewalLink: 'https://litwits.in/membership',
            })
          }

          const token = signSession({
            email: user.email,
            name: String(user.name || ''),
            role,
          })

          return Response.json({
            token,
            user: { name: String(user.name || ''), email: user.email, role },
          })
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'Server error'
          if (msg.includes('not configured')) {
            return Response.json({ error: msg }, { status: 503 })
          }
          console.error(e)
          return Response.json({ error: 'Server error' }, { status: 500 })
        }
      },
      DELETE: async () => new Response(null, { status: 204 }),
    },
  },
})
