import { createFileRoute } from '@tanstack/react-router'
import { requireSupabase } from '@/server/env'
import { getBearerSession } from '@/server/session'
import { sbFetch } from '@/server/kv'

type LeadSource = 'WhatsApp' | 'Instagram' | 'Facebook'
type LeadStatus =
  | 'New Query'
  | 'Contacted'
  | 'Interested'
  | 'Converted'
  | 'Closed'
  | 'Not Responded'

function normSource(s: string): LeadSource {
  const x = String(s || '')
  if (x === 'Instagram') return 'Instagram'
  if (x === 'Facebook') return 'Facebook'
  return 'WhatsApp'
}

function normStatus(s: string): LeadStatus {
  const allowed: LeadStatus[] = [
    'New Query',
    'Contacted',
    'Interested',
    'Converted',
    'Closed',
    'Not Responded',
  ]
  return (allowed.includes(s as LeadStatus) ? s : 'New Query') as LeadStatus
}

function rowToLead(row: Record<string, unknown>) {
  const created = row.created_at
    ? new Date(String(row.created_at)).getTime()
    : Date.now()
  return {
    id: String(row.id ?? ''),
    name: String(row.name || row.phone || 'Lead'),
    phone: String(row.phone || ''),
    source: normSource(String(row.source || 'WhatsApp')),
    lastMessage: String(row.message || ''),
    status: normStatus(String(row.status || 'New Query')),
    createdAt: Number.isFinite(created) ? created : Date.now(),
  }
}

export const Route = createFileRoute('/api/leads')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = getBearerSession(request)
        if (!session || session.role !== 'admin') {
          return Response.json({ error: 'Forbidden' }, { status: 403 })
        }
        try {
          const config = requireSupabase()
          const res = await sbFetch(
            config,
            'leads?select=*&order=created_at.desc.nullslast',
            { method: 'GET' },
          )
          if (!res.ok) {
            const t = await res.text()
            console.warn('leads GET', res.status, t)
            return Response.json({ leads: [] })
          }
          const rows = (await res.json()) as Record<string, unknown>[]
          return Response.json({ leads: rows.map(rowToLead) })
        } catch (e) {
          console.error(e)
          return Response.json({ leads: [] })
        }
      },
      PATCH: async ({ request }) => {
        const session = getBearerSession(request)
        if (!session || session.role !== 'admin') {
          return Response.json({ error: 'Forbidden' }, { status: 403 })
        }
        let body: { id?: string; status?: LeadStatus }
        try {
          body = await request.json()
        } catch {
          return Response.json({ error: 'Invalid JSON' }, { status: 400 })
        }
        const id = String(body.id || '')
        const status = body.status ? normStatus(body.status) : null
        if (!id || !status) return Response.json({ error: 'bad request' }, { status: 400 })
        try {
          const config = requireSupabase()
          const res = await sbFetch(config, `leads?id=eq.${encodeURIComponent(id)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
            body: JSON.stringify({ status }),
          })
          if (!res.ok) {
            const t = await res.text()
            return Response.json({ error: t || 'update failed' }, { status: 502 })
          }
          return Response.json({ ok: true })
        } catch (e) {
          console.error(e)
          return Response.json({ error: 'Failed' }, { status: 500 })
        }
      },
    },
  },
})
