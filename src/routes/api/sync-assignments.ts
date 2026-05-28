import { createFileRoute } from '@tanstack/react-router'
import { requireSupabase } from '@/server/env'
import { getBearerSession } from '@/server/session'
import { listUsers, saveUser, type StoredUser } from '@/server/users'

export const Route = createFileRoute('/api/sync-assignments')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const session = getBearerSession(request)
        if (!session || session.role !== 'admin') {
          return Response.json({ error: 'Forbidden' }, { status: 403 })
        }
        try {
          const config = requireSupabase()
          const users = await listUsers(config)
          const mentors = users.filter((u) => u.role === 'mentor').map((u) => u.email)
          const students = users.filter((u) => u.role === 'student')
          let n = 0
          for (const s of students) {
            const u = s as StoredUser
            const merged: StoredUser = {
              ...u,
              assignedMentors: [...mentors],
            }
            await saveUser(config, u.email, merged)
            n++
          }
          return Response.json({
            studentsUpdated: n,
            totalStudents: students.length,
            totalMentors: mentors.length,
          })
        } catch (e) {
          console.error(e)
          return Response.json({ error: 'Failed' }, { status: 500 })
        }
      },
    },
  },
})
