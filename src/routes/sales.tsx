import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import { getUser, clearAuth, apiFetch } from '@/lib/auth'

export const Route = createFileRoute('/sales')({
  component: SalesDashboard,
})

type LeadSource = 'WhatsApp' | 'Instagram' | 'Facebook'
type LeadStatus =
  | 'New Query'
  | 'Contacted'
  | 'Interested'
  | 'Converted'
  | 'Closed'
  | 'Not Responded'

interface Lead {
  id: string
  name: string
  phone: string
  source: LeadSource
  lastMessage: string
  status: LeadStatus
  createdAt: number
}

const PIPELINE_COLUMNS: LeadStatus[] = [
  'New Query',
  'Contacted',
  'Interested',
  'Converted',
  'Closed',
]

const SOURCE_BADGES: Record<LeadSource, { label: string; classes: string }> = {
  WhatsApp: { label: 'WhatsApp', classes: 'bg-green-100 text-green-700' },
  Instagram: { label: 'Instagram', classes: 'bg-pink-100 text-pink-700' },
  Facebook: { label: 'Facebook', classes: 'bg-blue-100 text-blue-700' },
}

const STATUS_BADGES: Record<LeadStatus, string> = {
  'New Query': 'bg-amber-100 text-amber-700',
  Contacted: 'bg-sky-100 text-sky-700',
  Interested: 'bg-violet-100 text-violet-700',
  Converted: 'bg-emerald-100 text-emerald-700',
  Closed: 'bg-gray-100 text-gray-600',
  'Not Responded': 'bg-rose-100 text-rose-700',
}

const SEED_LEADS: Lead[] = [
  {
    id: 'lead-1',
    name: 'Demo User',
    phone: '9999999999',
    source: 'WhatsApp',
    lastMessage: 'Hi, can I get more info on your courses?',
    status: 'New Query',
    createdAt: Date.now() - 1000 * 60 * 30,
  },
  {
    id: 'lead-2',
    name: 'Aarav Mehta',
    phone: '9876543210',
    source: 'Instagram',
    lastMessage: 'Saw your reel — what are the timings?',
    status: 'Contacted',
    createdAt: Date.now() - 1000 * 60 * 60 * 4,
  },
  {
    id: 'lead-3',
    name: 'Priya Shah',
    phone: '9123456780',
    source: 'Facebook',
    lastMessage: 'Interested in the writing workshop.',
    status: 'Interested',
    createdAt: Date.now() - 1000 * 60 * 60 * 26,
  },
  {
    id: 'lead-4',
    name: 'Rohan Kapoor',
    phone: '9988776655',
    source: 'WhatsApp',
    lastMessage: 'Booked the slot — sending payment now.',
    status: 'Converted',
    createdAt: Date.now() - 1000 * 60 * 60 * 50,
  },
  {
    id: 'lead-5',
    name: 'Sneha Iyer',
    phone: '9090909090',
    source: 'Instagram',
    lastMessage: 'Will get back next week.',
    status: 'Closed',
    createdAt: Date.now() - 1000 * 60 * 60 * 80,
  },
  {
    id: 'lead-6',
    name: 'Kabir Singh',
    phone: '9012345678',
    source: 'Facebook',
    lastMessage: 'Sent two follow-ups — no reply.',
    status: 'Not Responded',
    createdAt: Date.now() - 1000 * 60 * 60 * 100,
  },
]

function Wordmark() {
  return (
    <span
      className="text-2xl font-bold text-[#A52A2A] tracking-tight"
      style={{ fontFamily: '"Playfair Display", serif' }}
    >
      LITWITS
    </span>
  )
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string
  value: number
  accent: string
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5 flex flex-col gap-2 shadow-sm">
      <span className="text-xs uppercase tracking-wide text-gray-400">{label}</span>
      <span className={`text-3xl font-semibold ${accent}`}>{value}</span>
    </div>
  )
}

function SourceBadge({ source }: { source: LeadSource }) {
  const cfg = SOURCE_BADGES[source]
  return (
    <span className={`inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full ${cfg.classes}`}>
      {cfg.label}
    </span>
  )
}

function StatusBadge({ status }: { status: LeadStatus }) {
  return (
    <span className={`inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full ${STATUS_BADGES[status]}`}>
      {status}
    </span>
  )
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function SalesDashboard() {
  const navigate = useNavigate()
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [leads, setLeads] = useState<Lead[]>([])
  const [leadsError, setLeadsError] = useState('')
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [hoverColumn, setHoverColumn] = useState<LeadStatus | null>(null)

  useEffect(() => {
    const u = getUser()
    if (!u || u.role !== 'admin') {
      navigate({ to: '/login' })
      return
    }
    setCurrentUser(u)
  }, [])

  useEffect(() => {
    if (!currentUser) return
    let cancelled = false
    ;(async () => {
      setLeadsError('')
      try {
        const res = await apiFetch('/api/leads')
        const data = await res.json()
        if (cancelled) return
        if (!res.ok) {
          setLeads(SEED_LEADS)
          setLeadsError(typeof data.error === 'string' ? data.error : 'Using offline demo leads.')
          return
        }
        const list = Array.isArray(data.leads) ? data.leads : []
        setLeads(list.length ? list : SEED_LEADS)
      } catch {
        if (!cancelled) {
          setLeads(SEED_LEADS)
          setLeadsError('Could not reach leads API — showing demo data.')
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [currentUser])

  const stats = useMemo(() => {
    const total = leads.length
    const newQueries = leads.filter((l) => l.status === 'New Query').length
    const inProgress = leads.filter(
      (l) => l.status === 'Contacted' || l.status === 'Interested',
    ).length
    const converted = leads.filter((l) => l.status === 'Converted').length
    const notResponded = leads.filter((l) => l.status === 'Not Responded').length
    return { total, newQueries, inProgress, converted, notResponded }
  }, [leads])

  const grouped = useMemo(() => {
    const map: Record<LeadStatus, Lead[]> = {
      'New Query': [],
      Contacted: [],
      Interested: [],
      Converted: [],
      Closed: [],
      'Not Responded': [],
    }
    for (const lead of leads) map[lead.status].push(lead)
    return map
  }, [leads])

  function moveLead(leadId: string, target: LeadStatus) {
    setLeads((prev) =>
      prev.map((l) => (l.id === leadId ? { ...l, status: target } : l)),
    )
    void apiFetch('/api/leads', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: leadId, status: target }),
    }).catch(() => {})
  }

  async function handleLogout() {
    await apiFetch('/api/auth', { method: 'DELETE' }).catch(() => {})
    clearAuth()
    navigate({ to: '/login' })
  }

  if (!currentUser) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50 text-sm text-gray-400">
        Loading...
      </div>
    )
  }

  return (
    <div className="h-screen bg-gray-50 flex flex-col overflow-hidden">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between flex-none z-20">
        <div className="flex items-center gap-6">
          <Wordmark />
          <span className="text-xs uppercase tracking-wide text-gray-400">Sales CRM</span>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate({ to: '/admin' })}
            className="text-xs text-gray-500 hover:text-[#A52A2A] transition-colors uppercase tracking-wide"
          >
            &larr; Back to Admin
          </button>
          <span className="text-sm text-gray-500 hidden sm:block">{currentUser?.name}</span>
          <button
            onClick={handleLogout}
            className="text-xs text-gray-500 hover:text-[#A52A2A] transition-colors uppercase tracking-wide"
          >
            Logout
          </button>
        </div>
      </header>

      <main className="flex-1 min-h-0 overflow-auto">
        <div className="max-w-7xl mx-auto w-full p-6 flex flex-col gap-10">
          {/* Dashboard */}
          <section>
            <h1
              className="text-2xl font-semibold text-gray-800 mb-1"
              style={{ fontFamily: '"Playfair Display", serif' }}
            >
              Sales Dashboard
            </h1>
            <p className="text-sm text-gray-500 mb-5">Snapshot of incoming leads across channels.</p>
            {leadsError && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-md px-3 py-2 mb-4">
                {leadsError}
              </p>
            )}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              <StatCard label="Total Leads" value={stats.total} accent="text-gray-800" />
              <StatCard label="New Queries" value={stats.newQueries} accent="text-amber-600" />
              <StatCard label="In Progress" value={stats.inProgress} accent="text-sky-600" />
              <StatCard label="Converted" value={stats.converted} accent="text-emerald-600" />
              <StatCard label="Not Responded" value={stats.notResponded} accent="text-rose-600" />
            </div>
          </section>

          {/* Pipeline / Kanban */}
          <section>
            <div className="flex items-baseline justify-between mb-3">
              <h2
                className="text-xl font-semibold text-gray-800"
                style={{ fontFamily: '"Playfair Display", serif' }}
              >
                Pipeline
              </h2>
              <p className="text-xs text-gray-400">Drag cards between columns to update status.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              {PIPELINE_COLUMNS.map((col) => (
                <div
                  key={col}
                  onDragOver={(e) => {
                    e.preventDefault()
                    if (hoverColumn !== col) setHoverColumn(col)
                  }}
                  onDragLeave={() => {
                    if (hoverColumn === col) setHoverColumn(null)
                  }}
                  onDrop={(e) => {
                    e.preventDefault()
                    const id = e.dataTransfer.getData('text/plain') || draggingId
                    if (id) moveLead(id, col)
                    setDraggingId(null)
                    setHoverColumn(null)
                  }}
                  className={`flex flex-col rounded-lg border bg-white min-h-[260px] transition-colors ${
                    hoverColumn === col
                      ? 'border-[#A52A2A] bg-[#A52A2A]/5'
                      : 'border-gray-200'
                  }`}
                >
                  <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                    <span className="text-sm font-semibold text-gray-700">{col}</span>
                    <span className="text-[11px] text-gray-400">{grouped[col].length}</span>
                  </div>
                  <div className="flex-1 p-3 flex flex-col gap-2">
                    {grouped[col].length === 0 && (
                      <p className="text-[11px] text-gray-300 italic px-1">No leads</p>
                    )}
                    {grouped[col].map((lead) => (
                      <div
                        key={lead.id}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData('text/plain', lead.id)
                          e.dataTransfer.effectAllowed = 'move'
                          setDraggingId(lead.id)
                        }}
                        onDragEnd={() => {
                          setDraggingId(null)
                          setHoverColumn(null)
                        }}
                        className={`bg-white border rounded-md p-3 shadow-sm cursor-grab active:cursor-grabbing flex flex-col gap-1.5 ${
                          draggingId === lead.id
                            ? 'opacity-60 border-[#A52A2A]'
                            : 'border-gray-200 hover:border-[#A52A2A]'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold text-gray-800 truncate">{lead.name}</span>
                          <SourceBadge source={lead.source} />
                        </div>
                        <span className="text-[11px] text-gray-500">{lead.phone}</span>
                        <p className="text-xs text-gray-600 line-clamp-2">{lead.lastMessage}</p>
                        <div className="pt-1">
                          <StatusBadge status={lead.status} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Leads table */}
          <section>
            <h2
              className="text-xl font-semibold text-gray-800 mb-3"
              style={{ fontFamily: '"Playfair Display", serif' }}
            >
              Leads
            </h2>
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                    <tr>
                      <th className="px-4 py-3 font-medium">Name</th>
                      <th className="px-4 py-3 font-medium">Phone</th>
                      <th className="px-4 py-3 font-medium">Source</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium">Created</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {leads.map((lead) => (
                      <tr key={lead.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-800 font-medium">{lead.name}</td>
                        <td className="px-4 py-3 text-gray-600">{lead.phone}</td>
                        <td className="px-4 py-3"><SourceBadge source={lead.source} /></td>
                        <td className="px-4 py-3"><StatusBadge status={lead.status} /></td>
                        <td className="px-4 py-3 text-gray-500 text-xs">{formatTime(lead.createdAt)}</td>
                      </tr>
                    ))}
                    {leads.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-4 py-6 text-center text-sm text-gray-400">
                          No leads yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* Integrations */}
          <section>
            <h2
              className="text-xl font-semibold text-gray-800 mb-1"
              style={{ fontFamily: '"Playfair Display", serif' }}
            >
              Connect Meta Platforms
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              Plug in your Meta channels to start pulling leads automatically. (UI placeholders — not yet connected.)
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {([
                { key: 'WhatsApp', label: 'Connect WhatsApp', desc: 'Capture leads from WhatsApp Business inbox.', dot: 'bg-green-500' },
                { key: 'Instagram', label: 'Connect Instagram', desc: 'Sync DMs and story replies as leads.', dot: 'bg-pink-500' },
                { key: 'Facebook', label: 'Connect Facebook', desc: 'Import Page messages and lead-form submissions.', dot: 'bg-blue-500' },
              ] as const).map((p) => (
                <div
                  key={p.key}
                  className="bg-white border border-gray-200 rounded-lg p-5 flex flex-col gap-3"
                >
                  <div className="flex items-center gap-2">
                    <span className={`inline-block w-2 h-2 rounded-full ${p.dot}`} />
                    <span className="text-sm font-semibold text-gray-800">{p.key}</span>
                    <span className="ml-auto text-[11px] text-gray-400 uppercase tracking-wide">Not connected</span>
                  </div>
                  <p className="text-xs text-gray-500 flex-1">{p.desc}</p>
                  <button
                    onClick={() => alert(`${p.label} — integration coming soon.`)}
                    className="text-sm font-medium text-white bg-[#A52A2A] hover:bg-[#8a2222] transition-colors rounded-md px-4 py-2"
                  >
                    {p.label}
                  </button>
                </div>
              ))}
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}
