import { createFileRoute } from '@tanstack/react-router'
import { requireSupabase } from '@/server/env'
import { getBearerSession } from '@/server/session'
import { kvGet, kvSet } from '@/server/kv'

const BUCKET = 'arsr_wb'

function emptySheet(name: string, columns: string[]) {
  const id = `sheet_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  return {
    id,
    name,
    columns,
    rows: Array.from({ length: 30 }, () =>
      Object.fromEntries(columns.map((c) => [c, ''])),
    ),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}

function defaultWorkbook(section: 'sr' | 'ar') {
  if (section === 'sr') {
    const cols = ['Date', 'Session', 'Mentor', 'Topic', 'Attendance']
    const sheet = emptySheet('Main', cols)
    return {
      section: 'sr' as const,
      sheets: [sheet],
      activeSheetId: sheet.id,
      errors: [] as unknown[],
      studentSessions: {} as Record<string, string[]>,
      studentUserMap: {} as Record<string, string>,
      updatedAt: Date.now(),
    }
  }
  const cols = [
    'Name',
    'Documents',
    'School Board',
    'GMB Review',
    'Remarks',
    'Parent Name',
    'NO. OF SESSION',
    'Validity',
  ]
  const sheets = ['Group', 'Individual', 'Renewals'].map((n) => emptySheet(n, cols))
  return {
    section: 'ar' as const,
    sheets,
    activeSheetId: sheets[0]?.id ?? null,
    errors: [] as unknown[],
    studentSessions: {} as Record<string, string[]>,
    studentUserMap: {} as Record<string, string>,
    updatedAt: Date.now(),
  }
}

export const Route = createFileRoute('/api/arsr-sheets')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!getBearerSession(request)) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }
        const url = new URL(request.url)
        const section = url.searchParams.get('section') === 'ar' ? 'ar' : 'sr'
        try {
          const config = requireSupabase()
          const data = await kvGet<unknown>(config, BUCKET, section)
          const workbook = data ?? defaultWorkbook(section)
          return Response.json({ workbook })
        } catch (e) {
          console.error(e)
          return Response.json({ error: 'Failed' }, { status: 500 })
        }
      },
      PUT: async ({ request }) => {
        if (!getBearerSession(request)) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }
        const url = new URL(request.url)
        const section = url.searchParams.get('section') === 'ar' ? 'ar' : 'sr'
        let body: unknown
        try {
          body = await request.json()
        } catch {
          return Response.json({ error: 'Invalid JSON' }, { status: 400 })
        }
        try {
          const config = requireSupabase()
          await kvSet(config, BUCKET, section, body)
          return Response.json({ ok: true })
        } catch (e) {
          console.error(e)
          return Response.json({ error: 'Failed' }, { status: 500 })
        }
      },
    },
  },
})
