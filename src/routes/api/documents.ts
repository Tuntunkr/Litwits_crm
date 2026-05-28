import { createFileRoute } from '@tanstack/react-router'
import { requireSupabase } from '@/server/env'
import { getBearerSession } from '@/server/session'
import { loadStudentDocStore, type DocRow } from '@/server/student-docs'

function canAccessStudentDocs(
  session: NonNullable<ReturnType<typeof getBearerSession>>,
  email: string,
) {
  if (session.role === 'admin' || session.role === 'mentor') return true
  return session.email.toLowerCase() === email.toLowerCase()
}

function stripInternals(doc: DocRow) {
  const { _sync, ...rest } = doc as DocRow & { _sync?: number }
  return rest
}

export const Route = createFileRoute('/api/documents')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = getBearerSession(request)
        if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
        const url = new URL(request.url)
        const email = String(url.searchParams.get('email') || '')
          .trim()
          .toLowerCase()
        if (!email) return Response.json({ error: 'email required' }, { status: 400 })
        if (!canAccessStudentDocs(session, email)) {
          return Response.json({ error: 'Forbidden' }, { status: 403 })
        }
        try {
          const config = requireSupabase()
          const store = await loadStudentDocStore(config, email)
          const documents = store.documents.map((d) => stripInternals(d))
          return Response.json({ documents })
        } catch (e) {
          console.error(e)
          return Response.json({ error: 'Failed' }, { status: 500 })
        }
      },
    },
  },
})
