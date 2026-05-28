import { createFileRoute } from '@tanstack/react-router'
import { getBearerSession } from '@/server/session'

export const Route = createFileRoute('/api/ar-enrich')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!getBearerSession(request)) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }
        await request.json().catch(() => ({}))
        return Response.json({ ok: true, touched: 0 })
      },
    },
  },
})
