import { createFileRoute } from '@tanstack/react-router'
import { getBearerSession } from '@/server/session'

export const Route = createFileRoute('/api/google-sheets-fetch')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!getBearerSession(request)) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }
        new URL(request.url).searchParams.get('refresh')
        return Response.json({ ok: true })
      },
    },
  },
})
