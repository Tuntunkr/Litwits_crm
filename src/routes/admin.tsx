import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState, useEffect, useMemo } from 'react'
import * as XLSX from 'xlsx'
import { getUser, clearAuth, apiFetch } from '@/lib/auth'
import { saveTabOrder } from '@/lib/tab-order'
import Editor from '@/components/Editor'
import DocumentTabsBar, { type DocTab } from '@/components/DocumentTabsBar'
import ARSRModule from '@/components/ARSRModule'

export const Route = createFileRoute('/admin')({
  component: AdminDashboard,
})

type Tab =
  | 'students'
  | 'mentor-docs'
  | 'litwits-docs'
  | 'users'
  | 'create'
  | 'bulk'
  | 'renewals'
  | 'activity-logs'
  | 'arsr'
type StudentsView = 'grid' | 'studentDocs' | 'editor'
type MentorDocsView = 'grid' | 'mentorDocs' | 'editor'
type LitwitsView = 'grid' | 'editor'

interface UserRecord {
  name: string
  email: string
  password: string
  role: string
  phone: string
  assignedMentors: string[]
  assignedLitwitsDocs: string[]
  validityStart: string
  validityEnd: string
  status: string
  packageSessions?: number
  sessionType?: string
  packagePlan?: 'numeric' | 'signature' | 'platinum'
  attendedSessions?: number
  srCount?: number
  manualAdjustment?: number
  validityStatus?: 'expired' | 'expiring' | 'ok' | 'unset'
  daysUntilExpiry?: number | null
  needsRenewal?: boolean
  lastModified?: number
  // legacy field — may appear on old records
  mentorEmail?: string
}

interface DocRecord {
  id: number
  title: string
  content: string
  tabs?: DocTab[] | null
  activeTabId?: string | null
}

interface LitwitsDoc {
  id: string
  title: string
  category: string
  content: string
  lastEditedBy?: string
  lastEditedAt?: number
  tabs?: DocTab[] | null
  activeTabId?: string | null
}

interface ActivityLog {
  userName: string
  userEmail: string
  userRole: string
  documentId: string
  action: string
  timestamp: number
  duration: number
}

interface VersionEntry {
  timestamp: number
  editedBy: string
  editedByEmail: string
  title: string
}

const ROLES = ['student', 'mentor', 'admin']

const DOC_ICONS: Record<number, string> = {
  1: '\u{1F3C6}',
  2: '\u270D\uFE0F',
  3: '\u{1F3A4}',
  4: '\u{1F310}',
  5: '\u{1F4DD}',
}

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

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
        active
          ? 'border-[#A52A2A] text-[#A52A2A]'
          : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300'
      }`}
    >
      {children}
    </button>
  )
}

function PersonCard({
  name,
  role,
  onClick,
}: {
  name: string
  role?: string
  onClick: () => void
}) {
  const initials = name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
  return (
    <button
      onClick={onClick}
      className="group bg-white rounded-lg border border-gray-200 hover:border-[#A52A2A] hover:shadow-md transition-all p-5 text-left flex flex-col items-center gap-3"
    >
      <div className="w-14 h-14 rounded-full bg-[#A52A2A]/10 text-[#A52A2A] flex items-center justify-center font-semibold text-lg group-hover:bg-[#A52A2A] group-hover:text-white transition-colors">
        {initials || '?'}
      </div>
      <h3 className="text-sm font-semibold text-gray-800 text-center leading-tight">{name}</h3>
      {role && <p className="text-[10px] uppercase tracking-wide text-gray-400">{role}</p>}
    </button>
  )
}

function DocCard({
  title,
  onClick,
  icon,
  onDelete,
}: {
  title: string
  onClick: () => void
  icon?: string
  onDelete?: () => void
}) {
  return (
    <div className="relative group">
      <button
        onClick={onClick}
        className="w-full bg-white rounded-lg border border-gray-200 hover:border-[#A52A2A] hover:shadow-md transition-all p-6 text-left flex flex-col gap-3 aspect-[4/3]"
      >
        <div className="text-3xl text-gray-300 group-hover:text-[#A52A2A] transition-colors">
          {icon ?? '\u{1F4C4}'}
        </div>
        <div className="flex-1 flex items-end">
          <h3
            className="text-base font-semibold text-gray-800 group-hover:text-[#A52A2A] transition-colors leading-tight"
            style={{ fontFamily: '"Playfair Display", serif' }}
          >
            {title}
          </h3>
        </div>
      </button>
      {onDelete && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          title="Delete document"
          aria-label="Delete document"
          className="absolute top-2 right-2 w-8 h-8 rounded-md bg-white/90 border border-gray-200 text-gray-500 hover:text-red-600 hover:border-red-300 hover:bg-white opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity flex items-center justify-center text-base"
        >
          {'\u{1F5D1}'}
        </button>
      )}
    </div>
  )
}

function SyncStatusPill({
  state,
  message,
}: {
  state: 'idle' | 'saving' | 'saved' | 'syncing' | 'error'
  message: string
}) {
  if (state === 'idle' || !message) return null
  const tone =
    state === 'error'
      ? 'bg-red-50 text-red-700 border-red-200'
      : state === 'saved'
        ? 'bg-green-50 text-green-700 border-green-200'
        : 'bg-amber-50 text-amber-700 border-amber-200'
  const dot =
    state === 'error'
      ? 'bg-red-500'
      : state === 'saved'
        ? 'bg-green-500'
        : 'bg-amber-500 animate-pulse'
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded border ${tone}`}
      title="Live sync status"
    >
      <span className={`inline-block w-1.5 h-1.5 rounded-full ${dot}`} />
      {message}
    </span>
  )
}

function ValidityBadge({
  status,
  daysUntilExpiry,
}: {
  status?: 'expired' | 'expiring' | 'ok' | 'unset'
  daysUntilExpiry?: number | null
}) {
  if (!status || status === 'unset') return null
  if (status === 'ok') return null
  const tone =
    status === 'expired'
      ? 'bg-red-100 text-red-700'
      : 'bg-amber-100 text-amber-700'
  const text =
    status === 'expired'
      ? 'Expired'
      : daysUntilExpiry != null
        ? `Expiring · ${Math.max(0, daysUntilExpiry)}d`
        : 'Expiring Soon'
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold ${tone}`}>
      {text}
    </span>
  )
}

export default function AdminDashboard() {
  const navigate = useNavigate()
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [tab, setTab] = useState<Tab>('students')
  const [users, setUsers] = useState<UserRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Create user form
  const blankForm = {
    name: '',
    email: '',
    password: '',
    role: 'student',
    phone: '',
    assignedLitwitsDocs: [] as string[],
    validityStart: '',
    validityEnd: '',
    packageSessions: '',
    sessionType: 'Individual',
    packagePlan: 'numeric' as 'numeric' | 'signature' | 'platinum',
  }
  const [form, setForm] = useState(blankForm)
  const [formError, setFormError] = useState('')
  const [formSuccess, setFormSuccess] = useState('')

  // Bulk upload
  const [bulkRows, setBulkRows] = useState<any[]>([])
  const [bulkStatus, setBulkStatus] = useState('')

  // AR Bulk Upload
  const [arBulkRows, setArBulkRows] = useState<any[]>([])
  const [arBulkStatus, setArBulkStatus] = useState('')
  const [arBulkErrors, setArBulkErrors] = useState<{ name: string; issue: string; action: string }[]>([])

  // SR Bulk Upload
  const [srBulkRows, setSrBulkRows] = useState<any[]>([])
  const [srBulkStatus, setSrBulkStatus] = useState('')
  const [srBulkErrors, setSrBulkErrors] = useState<{ name: string; issue: string; action: string }[]>([])

  // Students flow
  const [studentsView, setStudentsView] = useState<StudentsView>('grid')
  const [selectedStudent, setSelectedStudent] = useState<UserRecord | null>(null)
  const [studentDocs, setStudentDocs] = useState<DocRecord[]>([])
  const [selectedStudentDocId, setSelectedStudentDocId] = useState<number | null>(null)
  const [docsLoading, setDocsLoading] = useState(false)

  // Inline editing state
  const [editingCell, setEditingCell] = useState<{ email: string; field: string } | null>(null)
  const [editValue, setEditValue] = useState('')
  const [savingUser, setSavingUser] = useState<string | null>(null)

  // Live sync status — drives the "Saving… / Saved / Syncing…" indicator at
  // the top of Manage Users so the admin can see whether their changes have
  // landed and whether a background poll is in flight.
  type SyncState = 'idle' | 'saving' | 'saved' | 'syncing' | 'error'
  const [syncState, setSyncState] = useState<SyncState>('idle')
  const [syncStateMessage, setSyncStateMessage] = useState('')

  // Manage Users filters — persisted to localStorage so the admin returns to
  // the same view across reloads.
  const [filterMentor, setFilterMentor] = useState('')
  const [filterSessionType, setFilterSessionType] = useState('')
  const [filterExpiringOnly, setFilterExpiringOnly] = useState(false)

  // Hydrate / persist filters
  useEffect(() => {
    try {
      const raw = localStorage.getItem('litwits-admin-user-filters')
      if (raw) {
        const f = JSON.parse(raw)
        if (typeof f?.mentor === 'string') setFilterMentor(f.mentor)
        if (typeof f?.sessionType === 'string') setFilterSessionType(f.sessionType)
        if (typeof f?.expiringOnly === 'boolean') setFilterExpiringOnly(f.expiringOnly)
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    try {
      localStorage.setItem(
        'litwits-admin-user-filters',
        JSON.stringify({
          mentor: filterMentor,
          sessionType: filterSessionType,
          expiringOnly: filterExpiringOnly,
        }),
      )
    } catch {}
  }, [filterMentor, filterSessionType, filterExpiringOnly])

  // Multi-select mentor dropdown
  const [mentorDropdownOpen, setMentorDropdownOpen] = useState<string | null>(null)

  // Sync assignments state
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState('')

  // LITWITS Documents state
  const [litwitsDocs, setLitwitsDocs] = useState<LitwitsDoc[]>([])
  const [litwitsLoading, setLitwitsLoading] = useState(false)
  const [litwitsView, setLitwitsView] = useState<LitwitsView>('grid')
  const [selectedLitwitsDocId, setSelectedLitwitsDocId] = useState<string | null>(null)

  // LITWITS doc assignment dropdown
  const [litwitsDocDropdownOpen, setLitwitsDocDropdownOpen] = useState<string | null>(null)

  // Activity logs state
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([])
  const [activityLoading, setActivityLoading] = useState(false)
  const [activityFilterUser, setActivityFilterUser] = useState('')
  const [activityFilterDoc, setActivityFilterDoc] = useState('')
  const [activityFilterDate, setActivityFilterDate] = useState('')

  // Version history state
  const [versions, setVersions] = useState<VersionEntry[]>([])
  const [versionsLoading, setVersionsLoading] = useState(false)
  const [versionDocId, setVersionDocId] = useState('')
  const [versionContent, setVersionContent] = useState<string | null>(null)
  const [versionViewTimestamp, setVersionViewTimestamp] = useState<number | null>(null)

  // Document upload state
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadDocType, setUploadDocType] = useState('')
  const [uploadStatus, setUploadStatus] = useState('')
  const [uploadParsing, setUploadParsing] = useState(false)

  // Mentor Documents state (admin override)
  const [mentorsList, setMentorsList] = useState<{ name: string; email: string }[]>([])
  const [mentorsListLoading, setMentorsListLoading] = useState(false)
  const [mentorDocsView, setMentorDocsView] = useState<MentorDocsView>('grid')
  const [selectedMentor, setSelectedMentor] = useState<{ name: string; email: string } | null>(null)
  const [mentorDocs, setMentorDocs] = useState<DocRecord[]>([])
  const [mentorDocsLoading, setMentorDocsLoading] = useState(false)
  const [selectedMentorDocId, setSelectedMentorDocId] = useState<number | null>(null)
  const [uploadPreview, setUploadPreview] = useState('')

  useEffect(() => {
    const u = getUser()
    if (!u || u.role !== 'admin') {
      navigate({ to: '/login' })
      return
    }
    setCurrentUser(u)
    fetchUsers()
    fetchLitwitsDocs()
    fetchMentorsList()
  }, [])

  // Live sync: while the LITWITS Documents grid is visible, refetch the
  // catalog every 6s so creates/deletes from other admins propagate without a
  // manual refresh.
  useEffect(() => {
    if (tab !== 'litwits-docs' || litwitsView !== 'grid') return
    const interval = setInterval(() => {
      fetchLitwitsDocs()
    }, 6000)
    return () => clearInterval(interval)
  }, [tab, litwitsView])

  // Live sync: poll Manage Users / Renewals every 8s so other admins'
  // creates / package edits / SR-driven session counts surface without a
  // manual refresh. Polling pauses while there is an unsaved inline edit
  // open, so we don't trample the admin's in-progress input.
  useEffect(() => {
    if (tab !== 'users' && tab !== 'renewals') return
    const interval = setInterval(() => {
      if (editingCell) return
      if (savingUser) return
      fetchUsers({ silent: true })
    }, 8000)
    return () => clearInterval(interval)
  }, [tab, editingCell, savingUser])

  // Auto-clear the "Saved" pill after a couple of seconds so it doesn't
  // linger and read as still-in-flight to the next viewer.
  useEffect(() => {
    if (syncState !== 'saved') return
    const id = setTimeout(() => {
      setSyncState('idle')
      setSyncStateMessage('')
    }, 1800)
    return () => clearTimeout(id)
  }, [syncState])

  // Restore any unsaved Create-User draft so the admin doesn't lose typed
  // values when they accidentally switch tabs or refresh the page.
  useEffect(() => {
    try {
      const raw = localStorage.getItem('litwits-admin-create-draft')
      if (raw) {
        const parsed = JSON.parse(raw)
        if (parsed && typeof parsed === 'object') {
          setForm((prev) => ({ ...prev, ...parsed }))
        }
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Persist Create-User form draft on every change while the tab is open.
  useEffect(() => {
    if (tab !== 'create') return
    try {
      localStorage.setItem('litwits-admin-create-draft', JSON.stringify(form))
    } catch {}
  }, [tab, form])

  // Warn before unload if there's an unsaved inline edit or a non-empty
  // create-user draft so a stray refresh doesn't silently drop work.
  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      const hasDraft = form.name || form.email || form.password
      if (editingCell || hasDraft) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [editingCell, form])

  // If the admin clicks a different tab while an inline edit is open,
  // commit it first so values are not silently discarded.
  function safeSetTab(next: Tab) {
    if (editingCell) {
      const u = users.find((x) => x.email === editingCell.email)
      if (u && editingCell.field === 'attendedSessions') {
        const desired = parseInt(editValue || '0', 10) || 0
        if (desired !== (u.attendedSessions ?? 0)) {
          saveAttendedEdit(u, editValue)
        } else {
          setEditingCell(null)
        }
      } else if (u && editValue !== (u as any)[editingCell.field]) {
        saveInlineEdit(editingCell.email, editingCell.field, editValue)
      } else {
        setEditingCell(null)
      }
    }
    setTab(next)
  }

  async function fetchUsers(opts?: { silent?: boolean }) {
    if (!opts?.silent) setLoading(true)
    setSyncState('syncing')
    setSyncStateMessage('Syncing…')
    try {
      const res = await apiFetch('/api/users')
      const data = await res.json()
      const normalized = (data.users || []).map(normalizeUser)
      setUsers(normalized)
      setSyncState('idle')
      setSyncStateMessage('')
    } catch {
      setError('Failed to load users')
      setSyncState('error')
      setSyncStateMessage('Sync failed')
    } finally {
      if (!opts?.silent) setLoading(false)
    }
  }

  // Normalises the raw user record returned by the API so every optimistic
  // update + server reconcile lands on the same shape the table expects.
  function normalizeUser(u: any): UserRecord {
    return {
      ...u,
      name: String(u.name || '').replace(/\s+/g, ' ').trim(),
      assignedMentors: Array.isArray(u.assignedMentors)
        ? u.assignedMentors
        : u.mentorEmail
          ? [u.mentorEmail]
          : [],
      assignedLitwitsDocs: Array.isArray(u.assignedLitwitsDocs) ? u.assignedLitwitsDocs : [],
      validityStart: u.validityStart || '',
      validityEnd: u.validityEnd || '',
      status: u.status || 'active',
      packageSessions:
        typeof u.packageSessions === 'number'
          ? u.packageSessions
          : parseInt(String(u.packageSessions || ''), 10) || 0,
      sessionType: u.sessionType || '',
      packagePlan:
        u.packagePlan === 'signature' || u.packagePlan === 'platinum'
          ? u.packagePlan
          : 'numeric',
      attendedSessions:
        typeof u.attendedSessions === 'number' ? u.attendedSessions : 0,
      srCount: typeof u.srCount === 'number' ? u.srCount : 0,
      manualAdjustment:
        typeof u.manualAdjustment === 'number' ? u.manualAdjustment : 0,
      validityStatus: u.validityStatus || 'unset',
      daysUntilExpiry:
        typeof u.daysUntilExpiry === 'number' ? u.daysUntilExpiry : null,
      needsRenewal: Boolean(u.needsRenewal),
      lastModified: typeof u.lastModified === 'number' ? u.lastModified : 0,
    }
  }

  // ── Package validity helpers (mirror server logic so the form previews
  // the same end date that POST /api/users will compute). Numeric → 7 days
  // per session, Signature → 6 months, Platinum → 12 months.
  function todayISO(): string {
    const d = new Date()
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }
  function addDaysISO(iso: string, days: number): string {
    const [y, m, d] = iso.split('-').map((s) => parseInt(s, 10))
    if (!y || !m || !d) return ''
    const dt = new Date(y, m - 1, d)
    dt.setDate(dt.getDate() + days)
    const yy = dt.getFullYear()
    const mm = String(dt.getMonth() + 1).padStart(2, '0')
    const dd = String(dt.getDate()).padStart(2, '0')
    return `${yy}-${mm}-${dd}`
  }
  function addMonthsISO(iso: string, months: number): string {
    const [y, m, d] = iso.split('-').map((s) => parseInt(s, 10))
    if (!y || !m || !d) return ''
    const dt = new Date(y, m - 1, d)
    dt.setMonth(dt.getMonth() + months)
    const yy = dt.getFullYear()
    const mm = String(dt.getMonth() + 1).padStart(2, '0')
    const dd = String(dt.getDate()).padStart(2, '0')
    return `${yy}-${mm}-${dd}`
  }
  function computeValidityEnd(
    start: string,
    plan: 'numeric' | 'signature' | 'platinum',
    sessions: number,
  ): string {
    if (!start) return ''
    if (plan === 'signature') return addMonthsISO(start, 6)
    if (plan === 'platinum') return addMonthsISO(start, 12)
    const n = Math.max(0, Math.floor(sessions || 0))
    if (n <= 0) return ''
    return addDaysISO(start, n * 7)
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')
    setFormSuccess('')
    setSyncState('saving')
    setSyncStateMessage('Saving…')
    try {
      // Auto-fill validity for students if the admin left them blank — Start
      // defaults to today, End is derived from the chosen package plan.
      const sessions = parseInt(form.packageSessions || '0', 10) || 0
      const start =
        form.role === 'student' ? form.validityStart || todayISO() : form.validityStart
      const end =
        form.role === 'student' && !form.validityEnd
          ? computeValidityEnd(start, form.packagePlan, sessions)
          : form.validityEnd
      const res = await apiFetch('/api/users', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          name: form.name.replace(/\s+/g, ' ').trim(),
          assignedLitwitsDocs: form.assignedLitwitsDocs,
          validityStart: start,
          validityEnd: end,
          packageSessions: sessions,
          sessionType: form.sessionType,
          packagePlan: form.packagePlan,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setFormError(data.error || 'Failed to create user')
        setSyncState('error')
        setSyncStateMessage('Save failed')
        return
      }
      setFormSuccess(`User ${form.name} created successfully`)
      setForm(blankForm)
      try { localStorage.removeItem('litwits-admin-create-draft') } catch {}
      // Optimistically add the new user so the table reflects the change
      // immediately. Then reconcile with the server to pick up auto-assigned
      // mentors / documents that the backend may have populated.
      if (data.user) {
        const created = normalizeUser(data.user)
        setUsers((prev) => {
          const without = prev.filter((u) => u.email !== created.email)
          return [...without, created]
        })
      }
      setSyncState('saved')
      setSyncStateMessage('Saved')
      await fetchUsers({ silent: true })
    } catch {
      setFormError('Server error')
      setSyncState('error')
      setSyncStateMessage('Save failed')
    }
  }

  // Re-add a renewal: starts a new package "set" beginning the next day after
  // the prior end date (or today, whichever is later) and re-derives the
  // validity end from the existing package plan + size. The student stays in
  // the same record so attendance history is preserved.
  async function handleReAdd(u: UserRecord) {
    const baseEnd = u.validityEnd && /^\d{4}-\d{2}-\d{2}$/.test(u.validityEnd)
      ? u.validityEnd
      : todayISO()
    const today = todayISO()
    const nextStart = baseEnd > today ? addDaysISO(baseEnd, 1) : today
    const plan = (u.packagePlan as 'numeric' | 'signature' | 'platinum') || 'numeric'
    const sessions = u.packageSessions || 0
    const nextEnd = computeValidityEnd(nextStart, plan, sessions)
    if (!confirm(`Re-add ${u.name} with a new package starting ${nextStart}?`)) return
    setSavingUser(u.email)
    setSyncState('saving')
    setSyncStateMessage('Saving…')
    try {
      const res = await apiFetchRetry('/api/users', {
        method: 'PUT',
        body: JSON.stringify({
          email: u.email,
          validityStart: nextStart,
          validityEnd: nextEnd,
          status: 'active',
          expectedLastModified: u.lastModified || 0,
        }),
      })
      if (!res.ok) {
        setSyncState('error')
        setSyncStateMessage('Save failed')
        alert('Failed to start a new set')
        return
      }
      const data = await res.json().catch(() => ({}))
      if (data?.user) {
        const normalized = normalizeUser(data.user)
        setUsers((prev) => prev.map((x) => (x.email === u.email ? normalized : x)))
      }
      setSyncState('saved')
      setSyncStateMessage('Saved')
    } catch {
      setSyncState('error')
      setSyncStateMessage('Save failed')
    } finally {
      setSavingUser(null)
    }
  }

  async function handleDelete(email: string) {
    if (!confirm(`Delete user ${email}?`)) return
    const previous = users
    // Optimistic removal so the row disappears on first click.
    setUsers((prev) => prev.filter((u) => u.email !== email))
    try {
      const res = await apiFetch(`/api/users?email=${encodeURIComponent(email)}`, { method: 'DELETE' })
      if (!res.ok) {
        setUsers(previous)
        alert('Failed to delete user')
      }
    } catch {
      setUsers(previous)
      alert('Failed to delete user')
    }
  }

  function startEdit(email: string, field: string, currentValue: string) {
    setEditingCell({ email, field })
    setEditValue(currentValue)
  }

  async function saveInlineEdit(email: string, field: string, value: string) {
    setSavingUser(email)
    setSyncState('saving')
    setSyncStateMessage('Saving…')
    const previous = users
    const target = users.find((u) => u.email === email)
    const expectedLastModified = target?.lastModified || 0
    const normalisedValue = field === 'name' ? String(value).replace(/\s+/g, ' ').trim() : value
    // Optimistic update — the row reflects the new value on the first click.
    setUsers((prev) => prev.map((u) => (u.email === email ? { ...u, [field]: normalisedValue } : u)))
    setEditingCell(null)
    setEditValue('')
    try {
      const res = await apiFetch('/api/users', {
        method: 'PUT',
        body: JSON.stringify({ email, [field]: normalisedValue, expectedLastModified }),
      })
      if (!res.ok) {
        setUsers(previous)
        setSyncState('error')
        setSyncStateMessage(res.status === 409 ? 'Conflict — refresh to see latest' : 'Save failed')
        if (res.status === 409) await fetchUsers({ silent: true })
        else alert('Failed to save changes')
        return
      }
      const data = await res.json().catch(() => ({}))
      if (data?.user) {
        const normalized = normalizeUser(data.user)
        setUsers((prev) => prev.map((u) => (u.email === email ? normalized : u)))
      }
      setSyncState('saved')
      setSyncStateMessage('Saved')
    } catch {
      setUsers(previous)
      setSyncState('error')
      setSyncStateMessage('Save failed')
      alert('Failed to save changes')
    } finally {
      setSavingUser(null)
    }
  }

  // Saves an Attended Sessions edit. The server translates the desired
  // attended into a manualAdjustment so SR data is never overwritten.
  async function saveAttendedEdit(u: UserRecord, raw: string) {
    const desired = Math.max(0, Math.floor(parseInt(raw || '0', 10) || 0))
    const enrolled = u.packageSessions ?? 0
    const plan = u.packagePlan || 'numeric'
    if (plan === 'numeric' && enrolled > 0 && desired > enrolled) {
      alert(`Attended (${desired}) cannot exceed Enrolled (${enrolled}).`)
      return
    }
    if (desired < 0) {
      alert('Attended cannot be negative.')
      return
    }
    setSavingUser(u.email)
    setSyncState('saving')
    setSyncStateMessage('Saving…')
    const previous = users
    setUsers((prev) =>
      prev.map((x) =>
        x.email === u.email
          ? {
              ...x,
              attendedSessions: desired,
              manualAdjustment: desired - (x.srCount ?? 0),
            }
          : x,
      ),
    )
    setEditingCell(null)
    setEditValue('')
    try {
      const res = await apiFetchRetry('/api/users', {
        method: 'PUT',
        body: JSON.stringify({
          email: u.email,
          attendedSessions: desired,
          expectedLastModified: u.lastModified || 0,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setUsers(previous)
        setSyncState('error')
        setSyncStateMessage(data?.error || 'Save failed')
        if (res.status === 409) await fetchUsers({ silent: true })
        else alert(data?.error || 'Failed to save Attended Sessions')
        return
      }
      const data = await res.json().catch(() => ({}))
      if (data?.user) {
        const normalized = normalizeUser(data.user)
        setUsers((prev) =>
          prev.map((x) => (x.email === u.email ? normalized : x)),
        )
      }
      setSyncState('saved')
      setSyncStateMessage('Saved')
    } catch {
      setUsers(previous)
      setSyncState('error')
      setSyncStateMessage('Save failed')
      alert('Failed to save Attended Sessions')
    } finally {
      setSavingUser(null)
    }
  }

  async function toggleMentor(studentEmail: string, mentorEmail: string, currentMentors: string[]) {
    const updated = currentMentors.includes(mentorEmail)
      ? currentMentors.filter((m) => m !== mentorEmail)
      : [...currentMentors, mentorEmail]
    const previous = users
    // Flip the checkbox visually before the round-trip so rapid toggles never
    // compute off stale `currentMentors` and cancel each other out.
    setUsers((prev) => prev.map((u) => (u.email === studentEmail ? { ...u, assignedMentors: updated } : u)))
    setSavingUser(studentEmail)
    try {
      const res = await apiFetch('/api/users', {
        method: 'PUT',
        body: JSON.stringify({ email: studentEmail, assignedMentors: updated }),
      })
      if (!res.ok) {
        setUsers(previous)
        alert('Failed to update mentors')
        return
      }
      const data = await res.json().catch(() => ({}))
      if (data?.user) {
        const normalized = normalizeUser(data.user)
        setUsers((prev) => prev.map((u) => (u.email === studentEmail ? normalized : u)))
      }
    } catch {
      setUsers(previous)
      alert('Failed to update mentors')
    } finally {
      setSavingUser(null)
    }
  }

  function handleBulkFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const data = new Uint8Array(ev.target?.result as ArrayBuffer)
      const wb = XLSX.read(data, { type: 'array' })
      const sheet = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(sheet) as any[]
      setBulkRows(rows)
      setBulkStatus(`Parsed ${rows.length} rows. Review and click Import.`)
    }
    reader.readAsArrayBuffer(file)
  }

  async function handleBulkImport() {
    setBulkStatus('Importing…')
    let success = 0
    let fail = 0
    for (const row of bulkRows) {
      try {
        const pick = (...keys: string[]) => {
          for (const k of keys) {
            if (row[k] !== undefined && row[k] !== null && String(row[k]).length > 0) return row[k]
          }
          return ''
        }
        const toList = (v: any): string[] => {
          if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean)
          return String(v ?? '')
            .split(/[,;\n]+/)
            .map((s) => s.trim())
            .filter(Boolean)
        }
        const toDate = (v: any): string => {
          if (v === undefined || v === null || v === '') return ''
          if (typeof v === 'number') {
            const parsed = (XLSX as any).SSF?.parse_date_code?.(v)
            if (parsed) {
              const y = String(parsed.y).padStart(4, '0')
              const m = String(parsed.m).padStart(2, '0')
              const d = String(parsed.d).padStart(2, '0')
              return `${y}-${m}-${d}`
            }
          }
          return String(v).trim()
        }

        const mentorList = toList(
          pick('assignedMentors', 'AssignedMentors', 'assigned_mentors', 'Assigned Mentors', 'mentors', 'Mentors'),
        )
        const docsList = toList(
          pick(
            'documentsShared',
            'DocumentsShared',
            'documents_shared',
            'Documents Shared',
            'documents',
            'Documents',
            'assignedLitwitsDocs',
          ),
        )

        const packageSessionsValue = parseInt(
          pick(
            'packageSessions',
            'PackageSessions',
            'package_sessions',
            'Package of Sessions',
            'sessions',
            'Sessions',
          ) || '0',
          10,
        ) || 0
        // "Package" column is the plan selector — "Signature" / "Platinum" /
        // a number / blank. A number falls through to packageSessionsValue.
        const packageRaw = String(
          pick('packagePlan', 'PackagePlan', 'package_plan', 'Package', 'Plan') || '',
        )
          .trim()
          .toLowerCase()
        let packagePlanValue: 'numeric' | 'signature' | 'platinum' = 'numeric'
        let resolvedSessions = packageSessionsValue
        if (packageRaw === 'signature') packagePlanValue = 'signature'
        else if (packageRaw === 'platinum') packagePlanValue = 'platinum'
        else if (packageRaw && /^\d+$/.test(packageRaw)) {
          // "Package" column held a number — treat it as session count when the
          // dedicated Package of Sessions cell is missing.
          if (!resolvedSessions) resolvedSessions = parseInt(packageRaw, 10)
        }

        const startRaw = toDate(
          pick('validityStart', 'ValidityStart', 'Validity Start', 'validity_start'),
        )
        const endRaw = toDate(
          pick('validityEnd', 'ValidityEnd', 'Validity End', 'validity_end'),
        )
        const startResolved = startRaw || todayISO()
        const endResolved =
          endRaw || computeValidityEnd(startResolved, packagePlanValue, resolvedSessions)

        const payload: any = {
          name: String(pick('name', 'Name') || '').replace(/\s+/g, ' ').trim(),
          email: pick('email', 'Email'),
          password: pick('password', 'Password'),
          role: pick('role', 'Role') || 'student',
          phone: pick('phone', 'Phone'),
          validityStart: startResolved,
          validityEnd: endResolved,
          status: pick('status', 'Status') || 'active',
          packageSessions: resolvedSessions,
          packagePlan: packagePlanValue,
          sessionType: pick(
            'sessionType',
            'SessionType',
            'session_type',
            'Session Type',
            'Type',
          ),
        }
        if (mentorList.length > 0) payload.assignedMentors = mentorList
        if (docsList.length > 0) payload.assignedLitwitsDocs = docsList

        const res = await apiFetch('/api/users', {
          method: 'POST',
          body: JSON.stringify(payload),
        })
        if (res.ok) success++
        else fail++
      } catch {
        fail++
      }
    }
    setBulkStatus(`Done: ${success} imported, ${fail} failed.`)
    setBulkRows([])
    await fetchUsers()
  }

  function handleArBulkFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const data = new Uint8Array(ev.target?.result as ArrayBuffer)
      const wb = XLSX.read(data, { type: 'array' })
      const sheet = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(sheet) as any[]
      setArBulkRows(rows)
      setArBulkStatus(`Parsed ${rows.length} rows. Review and click Import.`)
      setArBulkErrors([])
    }
    reader.readAsArrayBuffer(file)
  }

  // AR Bulk Upload — match by Email (primary), update existing or create new.
  // For each row, the uploaded Attended is converted to a manualAdjustment so
  // SR data is never overwritten: manualAdjustment = uploadedAttended − SR count.
  async function handleArBulkImport() {
    setArBulkStatus('Importing…')
    const errors: { name: string; issue: string; action: string }[] = []
    let success = 0
    for (const row of arBulkRows) {
      const pick = (...keys: string[]) => {
        for (const k of keys) {
          if (row[k] !== undefined && row[k] !== null && String(row[k]).length > 0) return row[k]
        }
        return ''
      }
      const name = String(pick('Name', 'name') || '').replace(/\s+/g, ' ').trim()
      const email = String(pick('Email', 'email') || '').trim().toLowerCase()
      if (!name || !email) {
        errors.push({
          name: name || '(unnamed)',
          issue: 'Missing Name or Email',
          action: 'Skipped',
        })
        continue
      }
      const enrolled = Math.max(
        0,
        parseInt(String(pick('Enrolled Sessions', 'EnrolledSessions', 'enrolledSessions') || '0'), 10) || 0,
      )
      const attended = Math.max(
        0,
        parseInt(String(pick('Attended Sessions', 'AttendedSessions', 'attendedSessions') || '0'), 10) || 0,
      )
      const sessionType = String(pick('Session Type', 'SessionType', 'sessionType') || 'Individual').trim()
      const schoolBoard = String(pick('School Board', 'SchoolBoard', 'schoolBoard') || '').trim()
      const parentName = String(pick('Parent Name', 'ParentName', 'parentName') || '').trim()
      const gmbReview = String(pick('GMB Review', 'GMBReview', 'gmbReview') || '').trim()
      const remarks = String(pick('Remarks', 'remarks') || '').trim()

      try {
        const existing = users.find((u) => u.email.toLowerCase() === email)
        if (existing) {
          // Validation: prevent attended > enrolled for numeric packages.
          const plan = existing.packagePlan || 'numeric'
          if (plan === 'numeric' && enrolled > 0 && attended > enrolled) {
            errors.push({
              name,
              issue: `Attended (${attended}) exceeds Enrolled (${enrolled})`,
              action: 'Skipped',
            })
            continue
          }
          // First update enrolled/sessionType, then set attended (which the
          // server translates into manualAdjustment).
          await apiFetch('/api/users', {
            method: 'PUT',
            body: JSON.stringify({
              email: existing.email,
              packageSessions: enrolled,
              sessionType,
            }),
          })
          const r = await apiFetch('/api/users', {
            method: 'PUT',
            body: JSON.stringify({
              email: existing.email,
              attendedSessions: attended,
            }),
          })
          if (!r.ok) {
            const data = await r.json().catch(() => ({}))
            errors.push({
              name,
              issue: data?.error || 'Server error',
              action: 'Skipped',
            })
            continue
          }
        } else {
          if (enrolled > 0 && attended > enrolled) {
            errors.push({
              name,
              issue: `Attended (${attended}) exceeds Enrolled (${enrolled})`,
              action: 'Skipped',
            })
            continue
          }
          // Create the user with a random temp password — admin can edit
          // later in Manage Users.
          const tempPassword =
            Math.random().toString(36).slice(2, 6) +
            Math.random().toString(36).slice(2, 6).toUpperCase()
          const create = await apiFetch('/api/users', {
            method: 'POST',
            body: JSON.stringify({
              name,
              email,
              password: tempPassword,
              role: 'student',
              packageSessions: enrolled,
              sessionType,
              packagePlan: 'numeric',
            }),
          })
          if (!create.ok) {
            const data = await create.json().catch(() => ({}))
            errors.push({
              name,
              issue: data?.error || 'Failed to create user',
              action: 'Skipped',
            })
            continue
          }
          if (attended > 0) {
            await apiFetch('/api/users', {
              method: 'PUT',
              body: JSON.stringify({ email, attendedSessions: attended }),
            })
          }
        }
        // Enrich the AR row with School Board / Parent Name / GMB / Remarks
        // by piggybacking on the enrichment endpoint, then patching the cells
        // it doesn't cover via a follow-up workbook PUT.
        await apiFetch('/api/ar-enrich', {
          method: 'POST',
          body: JSON.stringify({ email, name, sessionType, packageSessions: enrolled }),
        })
        if (schoolBoard || parentName || gmbReview || remarks) {
          await patchArRowFields({
            email,
            name,
            schoolBoard,
            parentName,
            gmbReview,
            remarks,
          })
        }
        success++
      } catch (err) {
        errors.push({ name, issue: 'Server error', action: 'Skipped' })
      }
    }
    setArBulkStatus(`Done: ${success} processed, ${errors.length} errors.`)
    setArBulkErrors(errors)
    setArBulkRows([])
    await fetchUsers()
  }

  // Patches School Board / Parent Name / GMB Review / Remarks on the matching
  // AR row without touching NO. OF SESSION (which is server-derived from SR +
  // adjustment). Reads the current AR workbook, mutates the row in place, and
  // PUTs it back.
  async function patchArRowFields(p: {
    email: string
    name: string
    schoolBoard: string
    parentName: string
    gmbReview: string
    remarks: string
  }) {
    try {
      const r = await apiFetch('/api/arsr-sheets?section=ar')
      if (!r.ok) return
      const data = await r.json()
      const wb = data.workbook
      if (!wb || !Array.isArray(wb.sheets)) return
      const target = p.email.toLowerCase()
      const targetName = p.name
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .replace(/[^a-z0-9 ]/g, '')
        .trim()
      const stripHtml = (s: string) =>
        String(s || '').replace(/<[^>]+>/g, '').trim()
      const wrap = (s: string) =>
        `<p>${s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`
      let mutated = false
      for (const sh of wb.sheets) {
        for (let i = 0; i < sh.rows.length; i++) {
          const row = sh.rows[i]
          const e = stripHtml(row['Email'] || '').toLowerCase()
          const n = stripHtml(row['Name'] || '')
            .toLowerCase()
            .replace(/\s+/g, ' ')
            .replace(/[^a-z0-9 ]/g, '')
            .trim()
          if ((target && e === target) || (!e && n === targetName)) {
            const next = { ...row }
            if (p.schoolBoard) next['School Board'] = wrap(p.schoolBoard)
            if (p.parentName) next['Parent Name'] = wrap(p.parentName)
            if (p.gmbReview) next['GMB Review'] = wrap(p.gmbReview)
            if (p.remarks) next['Remarks'] = wrap(p.remarks)
            sh.rows[i] = next
            mutated = true
            break
          }
        }
      }
      if (mutated) {
        await apiFetch('/api/arsr-sheets?section=ar', {
          method: 'PUT',
          body: JSON.stringify(wb),
        })
      }
    } catch {}
  }

  function handleSrBulkFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const data = new Uint8Array(ev.target?.result as ArrayBuffer)
      const wb = XLSX.read(data, { type: 'array' })
      const sheet = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(sheet) as any[]
      setSrBulkRows(rows)
      setSrBulkStatus(`Parsed ${rows.length} rows. Review and click Import.`)
      setSrBulkErrors([])
    }
    reader.readAsArrayBuffer(file)
  }

  // SR Bulk Upload — Date, Student Name, Duration, Mentor, Topic. Filters out
  // any session under 5 minutes, dedupes (Student × Date), and folds each
  // valid row into the SR studentSessions index. Unmatched names are flagged
  // as Discovery Student in the errors panel but still count.
  async function handleSrBulkImport() {
    setSrBulkStatus('Importing…')
    const errors: { name: string; issue: string; action: string }[] = []
    const usersByName = new Map<string, UserRecord>()
    for (const u of users) {
      if (u.role !== 'student') continue
      const k = u.name
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .replace(/[^a-z0-9 ]/g, '')
        .trim()
      if (k) usersByName.set(k, u)
    }

    const seen = new Set<string>() // dedupe key: name+date
    const toAdd: { name: string; date: string }[] = []
    for (const row of srBulkRows) {
      const pick = (...keys: string[]) => {
        for (const k of keys) {
          if (row[k] !== undefined && row[k] !== null && String(row[k]).length > 0) return row[k]
        }
        return ''
      }
      const studentRaw = String(pick('Student Name', 'StudentName', 'Student', 'Name') || '').trim()
      if (!studentRaw) {
        errors.push({ name: '(unknown)', issue: 'Missing Student Name', action: 'Skipped' })
        continue
      }
      let dateRaw = pick('Date', 'date')
      let dateISO = ''
      if (typeof dateRaw === 'number') {
        const parsed = (XLSX as any).SSF?.parse_date_code?.(dateRaw)
        if (parsed) {
          const y = String(parsed.y).padStart(4, '0')
          const m = String(parsed.m).padStart(2, '0')
          const d = String(parsed.d).padStart(2, '0')
          dateISO = `${y}-${m}-${d}`
        }
      } else if (typeof dateRaw === 'string') {
        const m = dateRaw.match(/^(\d{4})-(\d{2})-(\d{2})/)
        if (m) dateISO = `${m[1]}-${m[2]}-${m[3]}`
        else {
          const t = Date.parse(dateRaw)
          if (Number.isFinite(t)) {
            const dt = new Date(t)
            dateISO = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
          }
        }
      }
      if (!dateISO) {
        errors.push({ name: studentRaw, issue: 'Invalid Date', action: 'Skipped' })
        continue
      }
      const durRaw = pick('Duration', 'duration', 'Duration (minutes)')
      let durationMinutes = 0
      if (typeof durRaw === 'number') durationMinutes = durRaw
      else if (typeof durRaw === 'string') {
        const m = durRaw.match(/(\d+)/)
        if (m) durationMinutes = parseInt(m[1], 10)
      }
      if (durationMinutes < 5) {
        errors.push({
          name: studentRaw,
          issue: `Duration ${durationMinutes}m < 5m`,
          action: 'Skipped',
        })
        continue
      }
      const norm = studentRaw
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .replace(/[^a-z0-9 ]/g, '')
        .trim()
      const dedupeKey = `${norm}|${dateISO}`
      if (seen.has(dedupeKey)) {
        errors.push({
          name: studentRaw,
          issue: `Duplicate (same date)`,
          action: 'Skipped',
        })
        continue
      }
      seen.add(dedupeKey)
      const matched = usersByName.get(norm)
      const finalName = matched ? matched.name : `${studentRaw} (Discovery Student)`
      if (!matched) {
        errors.push({
          name: studentRaw,
          issue: 'Not found in Manage Users',
          action: 'Added as Discovery Student',
        })
      }
      toAdd.push({ name: finalName, date: dateISO })
    }

    if (toAdd.length === 0) {
      setSrBulkStatus(`Done: 0 sessions added, ${errors.length} errors.`)
      setSrBulkErrors(errors)
      setSrBulkRows([])
      return
    }

    try {
      // Fetch the current AR workbook so we can union new dates into the
      // shared studentSessions index without erasing prior entries (the
      // server-side merge does the same, but doing it client-side first
      // gives us an exact preview count to report).
      const r = await apiFetch('/api/arsr-sheets?section=ar')
      const data = await r.json()
      const wb = data.workbook || { studentSessions: {} }
      const sessions: Record<string, string[]> = { ...(wb.studentSessions || {}) }
      let added = 0
      for (const e of toAdd) {
        const list = sessions[e.name] || []
        if (!list.includes(e.date)) {
          sessions[e.name] = [...list, e.date]
          added++
        }
      }
      const put = await apiFetch('/api/arsr-sheets?section=ar', {
        method: 'PUT',
        body: JSON.stringify({ ...wb, studentSessions: sessions }),
      })
      if (!put.ok) {
        setSrBulkStatus(`Error saving SR data.`)
        return
      }
      setSrBulkStatus(`Done: ${added} sessions added, ${errors.length} errors.`)
      setSrBulkErrors(errors)
      setSrBulkRows([])
      await fetchUsers()
    } catch {
      setSrBulkStatus('Server error during import.')
    }
  }

  async function loadStudentDocs(student: UserRecord) {
    setSelectedStudent(student)
    setSelectedStudentDocId(null)
    setStudentsView('studentDocs')
    setDocsLoading(true)
    try {
      const res = await apiFetch(`/api/documents?email=${encodeURIComponent(student.email)}`)
      const data = await res.json()
      setStudentDocs(data.documents || [])
    } catch {
      setStudentDocs([])
    } finally {
      setDocsLoading(false)
    }
  }

  const mentors = users.filter((u) => u.role === 'mentor')
  const students = users.filter((u) => u.role === 'student')

  // Apply Manage Users filters: mentor membership, session type, and the
  // "expiring in <7 days" toggle. Renewals view reuses the same data but
  // surfaces only students flagged needsRenewal by the server.
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      if (filterMentor) {
        if (u.role !== 'student') return false
        if (!u.assignedMentors.includes(filterMentor)) return false
      }
      if (filterSessionType) {
        if (u.role !== 'student') return false
        if ((u.sessionType || '') !== filterSessionType) return false
      }
      if (filterExpiringOnly) {
        if (u.role !== 'student') return false
        if (u.validityStatus !== 'expiring' && u.validityStatus !== 'expired') return false
      }
      return true
    })
  }, [users, filterMentor, filterSessionType, filterExpiringOnly])

  const renewalUsers = useMemo(
    () => users.filter((u) => u.role === 'student' && u.needsRenewal),
    [users],
  )

  async function handleSyncAssignments() {
    if (!confirm('This will assign ALL mentors to ALL students. Continue?')) return
    setSyncing(true)
    setSyncResult('')
    try {
      const res = await apiFetch('/api/sync-assignments', { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        setSyncResult(
          `Sync complete: ${data.studentsUpdated} of ${data.totalStudents} students updated (${data.totalMentors} mentors).`
        )
        fetchUsers()
      } else {
        setSyncResult(`Error: ${data.error || 'Failed to sync'}`)
      }
    } catch {
      setSyncResult('Server error during sync')
    } finally {
      setSyncing(false)
    }
  }

  async function handleLogout() {
    await apiFetch('/api/auth', { method: 'DELETE' })
    clearAuth()
    navigate({ to: '/login' })
  }

  async function fetchLitwitsDocs() {
    setLitwitsLoading(true)
    try {
      const res = await apiFetch('/api/litwits-docs')
      const data = await res.json()
      setLitwitsDocs(data.documents || [])
    } catch {
      setLitwitsDocs([])
    } finally {
      setLitwitsLoading(false)
    }
  }

  async function fetchMentorsList() {
    setMentorsListLoading(true)
    try {
      const res = await apiFetch('/api/mentor-documents?listMentors=1')
      const data = await res.json()
      setMentorsList(data.mentors || [])
    } catch {
      setMentorsList([])
    } finally {
      setMentorsListLoading(false)
    }
  }

  async function loadMentorDocs(mentor: { name: string; email: string }) {
    setSelectedMentor(mentor)
    setSelectedMentorDocId(null)
    setMentorDocsView('mentorDocs')
    setMentorDocsLoading(true)
    try {
      const res = await apiFetch(`/api/mentor-documents?email=${encodeURIComponent(mentor.email)}`)
      const data = await res.json()
      setMentorDocs(data.documents || [])
    } catch {
      setMentorDocs([])
    } finally {
      setMentorDocsLoading(false)
    }
  }

  async function initAllLitwitsDocs() {
    const defaultDocs = [
      { id: 'wsc-curriculum', title: 'WSC Curriculum', category: 'WSC Documents' },
      { id: 'wsc-writing-prompts', title: 'WSC Writing Prompts', category: 'WSC Documents' },
      { id: 'wsc-debating-motions', title: 'WSC Debating Motions', category: 'WSC Documents' },
      { id: 'wsc-quiz', title: 'WSC Quiz', category: 'WSC Documents' },
      { id: 'writing-competition', title: 'Writing Competition', category: 'Other Documents' },
      { id: 'debating-competition', title: 'Debating Competition', category: 'Other Documents' },
      { id: 'mun-events', title: 'MUN Events', category: 'Other Documents' },
      { id: 'fundamentals-of-debating', title: 'Fundamentals of Debating', category: 'Other Documents' },
    ]
    for (const doc of defaultDocs) {
      await apiFetch('/api/litwits-docs', {
        method: 'POST',
        body: JSON.stringify(doc),
      })
    }
    fetchLitwitsDocs()
  }

  async function createLitwitsDoc(category: 'Other Documents' | 'WSC Documents') {
    const id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const initialTabs: DocTab[] = [{ id: 'main', title: 'Main', content: '' }]
    const optimistic: LitwitsDoc = {
      id,
      title: 'Untitled Document',
      category,
      content: '',
      tabs: initialTabs,
      activeTabId: 'main',
    }
    setLitwitsDocs((prev) => [...prev, optimistic])
    setSelectedLitwitsDocId(id)
    setLitwitsView('editor')
    try {
      const res = await apiFetch('/api/litwits-docs', {
        method: 'POST',
        body: JSON.stringify({
          docId: id,
          title: optimistic.title,
          category,
          content: '',
          tabs: initialTabs,
          activeTabId: 'main',
        }),
      })
      if (!res.ok) {
        setLitwitsDocs((prev) => prev.filter((d) => d.id !== id))
        if (selectedLitwitsDocId === id) {
          setSelectedLitwitsDocId(null)
          setLitwitsView('grid')
        }
        alert('Failed to create document')
      }
    } catch {
      setLitwitsDocs((prev) => prev.filter((d) => d.id !== id))
      if (selectedLitwitsDocId === id) {
        setSelectedLitwitsDocId(null)
        setLitwitsView('grid')
      }
      alert('Failed to create document')
    }
  }

  async function deleteLitwitsDoc(doc: LitwitsDoc) {
    if (!confirm(`Delete "${doc.title}"? This cannot be undone.`)) return
    const previous = litwitsDocs
    setLitwitsDocs((prev) => prev.filter((d) => d.id !== doc.id))
    if (selectedLitwitsDocId === doc.id) {
      setSelectedLitwitsDocId(null)
      setLitwitsView('grid')
    }
    try {
      const res = await apiFetch(
        `/api/litwits-docs?docId=${encodeURIComponent(doc.id)}`,
        { method: 'DELETE' },
      )
      if (!res.ok) {
        setLitwitsDocs(previous)
        const data = await res.json().catch(() => ({}))
        alert(data?.error || 'Failed to delete document')
      }
    } catch {
      setLitwitsDocs(previous)
      alert('Failed to delete document')
    }
  }

  async function toggleLitwitsDocAssignment(userEmail: string, docId: string, currentDocs: string[]) {
    const updated = currentDocs.includes(docId)
      ? currentDocs.filter((d) => d !== docId)
      : [...currentDocs, docId]
    const previous = users
    setUsers((prev) =>
      prev.map((u) => (u.email === userEmail ? { ...u, assignedLitwitsDocs: updated } : u)),
    )
    setSavingUser(userEmail)
    try {
      const res = await apiFetch('/api/users', {
        method: 'PUT',
        body: JSON.stringify({ email: userEmail, assignedLitwitsDocs: updated }),
      })
      if (!res.ok) {
        setUsers(previous)
        alert('Failed to update document assignments')
        return
      }
      const data = await res.json().catch(() => ({}))
      if (data?.user) {
        const normalized = normalizeUser(data.user)
        setUsers((prev) => prev.map((u) => (u.email === userEmail ? normalized : u)))
      }
    } catch {
      setUsers(previous)
      alert('Failed to update document assignments')
    } finally {
      setSavingUser(null)
    }
  }

  async function fetchActivityLogs() {
    setActivityLoading(true)
    try {
      const params = new URLSearchParams()
      if (activityFilterUser) params.set('user', activityFilterUser)
      if (activityFilterDoc) params.set('docId', activityFilterDoc)
      if (activityFilterDate) params.set('date', activityFilterDate)
      const res = await apiFetch(`/api/litwits-doc-activity?${params.toString()}`)
      const data = await res.json()
      setActivityLogs(data.logs || [])
    } catch {
      setActivityLogs([])
    } finally {
      setActivityLoading(false)
    }
  }

  async function fetchVersions(docId: string) {
    setVersionDocId(docId)
    setVersionsLoading(true)
    setVersionContent(null)
    setVersionViewTimestamp(null)
    try {
      const res = await apiFetch(`/api/litwits-doc-versions?docId=${encodeURIComponent(docId)}`)
      const data = await res.json()
      setVersions(data.versions || [])
    } catch {
      setVersions([])
    } finally {
      setVersionsLoading(false)
    }
  }

  async function viewVersion(docId: string, timestamp: number) {
    try {
      const res = await apiFetch(`/api/litwits-doc-versions?docId=${encodeURIComponent(docId)}&version=${timestamp}`)
      const data = await res.json()
      if (data.version) {
        setVersionContent(data.version.content)
        setVersionViewTimestamp(timestamp)
      }
    } catch {
      alert('Failed to load version')
    }
  }

  async function restoreVersion(docId: string, timestamp: number) {
    if (!confirm('Restore this version? Current content will be overwritten.')) return
    try {
      const res = await apiFetch('/api/litwits-doc-versions', {
        method: 'POST',
        body: JSON.stringify({ docId, versionTimestamp: timestamp }),
      })
      if (res.ok) {
        alert('Version restored successfully')
        fetchLitwitsDocs()
        fetchVersions(docId)
      }
    } catch {
      alert('Failed to restore version')
    }
  }

  // Wraps apiFetch with exponential backoff so transient failures during
  // optimistic saves do not lose data — caller still sees the final outcome.
  async function apiFetchRetry(url: string, init?: RequestInit, retries = 2): Promise<Response> {
    let lastErr: any
    for (let i = 0; i <= retries; i++) {
      try {
        const r = await apiFetch(url, init)
        if (r.ok || r.status < 500) return r
        lastErr = new Error(`HTTP ${r.status}`)
      } catch (err) {
        lastErr = err
      }
      await new Promise((res) => setTimeout(res, 250 * Math.pow(2, i)))
    }
    throw lastErr
  }

  async function updateUserValidity(email: string, field: string, value: string) {
    setSavingUser(email)
    setSyncState('saving')
    setSyncStateMessage('Saving…')
    const previous = users
    const target = users.find((u) => u.email === email)
    const expectedLastModified = target?.lastModified || 0
    setUsers((prev) => prev.map((u) => (u.email === email ? { ...u, [field]: value } : u)))
    try {
      const res = await apiFetchRetry('/api/users', {
        method: 'PUT',
        body: JSON.stringify({ email, [field]: value, expectedLastModified }),
      })
      if (!res.ok) {
        setUsers(previous)
        setSyncState('error')
        setSyncStateMessage(res.status === 409 ? 'Conflict — refresh to see latest' : 'Save failed')
        if (res.status === 409) await fetchUsers({ silent: true })
        else alert('Failed to update')
        return
      }
      const data = await res.json().catch(() => ({}))
      if (data?.user) {
        const normalized = normalizeUser(data.user)
        setUsers((prev) => prev.map((u) => (u.email === email ? normalized : u)))
      }
      setSyncState('saved')
      setSyncStateMessage('Saved')
    } catch {
      setUsers(previous)
      setSyncState('error')
      setSyncStateMessage('Save failed')
      alert('Failed to update')
    } finally {
      setSavingUser(null)
    }
  }

  async function toggleUserStatus(email: string, currentStatus: string) {
    const newStatus = currentStatus === 'active' ? 'inactive' : 'active'
    await updateUserValidity(email, 'status', newStatus)
  }

  const UPLOAD_DOC_TYPES = litwitsDocs.map((d) => ({ id: d.id, title: d.title }))

  function handleUploadFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const ext = file.name.split('.').pop()?.toLowerCase()
    if (ext !== 'docx' && ext !== 'pdf') {
      setUploadStatus('Only .docx and .pdf files are supported.')
      setUploadFile(null)
      return
    }
    setUploadFile(file)
    setUploadStatus('')
    setUploadPreview('')
  }

  async function handleUploadParse() {
    if (!uploadFile || !uploadDocType) {
      setUploadStatus('Please select a file and a document type.')
      return
    }
    setUploadParsing(true)
    setUploadStatus('Parsing document...')
    setUploadPreview('')

    try {
      const ext = uploadFile.name.split('.').pop()?.toLowerCase()
      const arrayBuffer = await uploadFile.arrayBuffer()
      const base64 = btoa(
        new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
      )

      const res = await apiFetch('/api/parse-document', {
        method: 'POST',
        body: JSON.stringify({ fileData: base64, fileType: ext }),
      })
      const data = await res.json()
      if (!res.ok) {
        setUploadStatus(`Error: ${data.error || 'Failed to parse'}`)
        return
      }
      setUploadPreview(data.html)
      setUploadStatus('Document parsed successfully. Review preview below and click "Upload to Document" to save.')
    } catch {
      setUploadStatus('Failed to parse document. Please try again.')
    } finally {
      setUploadParsing(false)
    }
  }

  async function handleUploadSave() {
    if (!uploadPreview || !uploadDocType) return
    setUploadStatus('Saving document...')
    try {
      const docDef = UPLOAD_DOC_TYPES.find(d => d.id === uploadDocType)
      const res = await apiFetch('/api/litwits-docs', {
        method: 'PUT',
        body: JSON.stringify({
          docId: uploadDocType,
          title: docDef?.title || uploadDocType,
          content: uploadPreview,
        }),
      })
      if (res.ok) {
        setUploadStatus('Document uploaded and saved successfully!')
        setUploadFile(null)
        setUploadPreview('')
        setUploadDocType('')
        if (litwitsDocs.length > 0) fetchLitwitsDocs()
      } else {
        const data = await res.json()
        setUploadStatus(`Error: ${data.error || 'Failed to save'}`)
      }
    } catch {
      setUploadStatus('Failed to save document. Please try again.')
    }
  }

  function handleExportUsers() {
    const exportData = users.map((u) => ({
      Name: u.name,
      Email: u.email,
      Phone: u.phone || '',
      Role: u.role,
      'Assigned Mentor(s)': (u.assignedMentors || []).join(', '),
      'Documents Shared': (u.assignedLitwitsDocs || []).join(', '),
      'Validity Start Date': u.validityStart || '',
      'Validity End Date': u.validityEnd || '',
      'Package': u.packagePlan && u.packagePlan !== 'numeric'
        ? (u.packagePlan === 'signature' ? 'Signature' : 'Platinum')
        : (u.packageSessions ?? 0),
      'Package Sessions': u.packageSessions ?? 0,
      'Session Type': u.sessionType || '',
      'Attended Sessions': u.attendedSessions ?? 0,
      Status: u.status || 'active',
    }))
    const ws = XLSX.utils.json_to_sheet(exportData)
    const colWidths = Object.keys(exportData[0] || {}).map(key => ({
      wch: Math.max(key.length, ...exportData.map(row => String((row as any)[key] || '').length)) + 2,
    }))
    ws['!cols'] = colWidths
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Users')
    XLSX.writeFile(wb, `litwits-users-${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  // Memoized selected docs
  const selectedStudentDoc = useMemo(
    () => studentDocs.find((d) => d.id === selectedStudentDocId) ?? null,
    [studentDocs, selectedStudentDocId],
  )
  const selectedMentorDoc = useMemo(
    () => mentorDocs.find((d) => d.id === selectedMentorDocId) ?? null,
    [mentorDocs, selectedMentorDocId],
  )
  const selectedLitwitsDoc = useMemo(
    () => litwitsDocs.find((d) => d.id === selectedLitwitsDocId) ?? null,
    [litwitsDocs, selectedLitwitsDocId],
  )

  // Student doc tab handlers
  function onStudentTabsUpdate(docId: number, tabs: DocTab[], activeTabId: string) {
    setStudentDocs((prev) => prev.map((d) => (d.id === docId ? { ...d, tabs, activeTabId } : d)))
  }
  function onStudentTabAdd(docId: number) {
    setStudentDocs((prev) =>
      prev.map((d) => {
        if (d.id !== docId) return d
        const currentTabs: DocTab[] = d.tabs && d.tabs.length > 0
          ? d.tabs
          : [{ id: 'main', title: 'Main', content: d.content || '' }]
        const title = window.prompt('New tab name:', `Tab ${currentTabs.length + 1}`)
        if (!title) return d
        const newTab: DocTab = { id: `tab-${Date.now()}`, title, content: '' }
        return { ...d, tabs: [...currentTabs, newTab], activeTabId: newTab.id }
      }),
    )
  }
  function onStudentTabRename(docId: number, tabId: string, newTitle: string) {
    setStudentDocs((prev) =>
      prev.map((d) =>
        d.id === docId && d.tabs
          ? { ...d, tabs: d.tabs.map((t) => (t.id === tabId ? { ...t, title: newTitle } : t)) }
          : d,
      ),
    )
  }
  function onStudentTabDelete(docId: number, tabId: string) {
    setStudentDocs((prev) =>
      prev.map((d) => {
        if (d.id !== docId || !d.tabs) return d
        const remaining = d.tabs.filter((t) => t.id !== tabId)
        const newActive = d.activeTabId === tabId ? (remaining[0]?.id ?? null) : d.activeTabId
        return { ...d, tabs: remaining, activeTabId: newActive }
      }),
    )
  }

  // Mentor doc tab handlers
  function onMentorTabsUpdate(docId: number, tabs: DocTab[], activeTabId: string) {
    setMentorDocs((prev) => prev.map((d) => (d.id === docId ? { ...d, tabs, activeTabId } : d)))
  }
  function onMentorTabAdd(docId: number) {
    setMentorDocs((prev) =>
      prev.map((d) => {
        if (d.id !== docId) return d
        const currentTabs: DocTab[] = d.tabs && d.tabs.length > 0
          ? d.tabs
          : [{ id: 'main', title: 'Main', content: d.content || '' }]
        const title = window.prompt('New tab name:', `Tab ${currentTabs.length + 1}`)
        if (!title) return d
        const newTab: DocTab = { id: `tab-${Date.now()}`, title, content: '' }
        return { ...d, tabs: [...currentTabs, newTab], activeTabId: newTab.id }
      }),
    )
  }
  function onMentorTabRename(docId: number, tabId: string, newTitle: string) {
    setMentorDocs((prev) =>
      prev.map((d) =>
        d.id === docId && d.tabs
          ? { ...d, tabs: d.tabs.map((t) => (t.id === tabId ? { ...t, title: newTitle } : t)) }
          : d,
      ),
    )
  }
  function onMentorTabDelete(docId: number, tabId: string) {
    setMentorDocs((prev) =>
      prev.map((d) => {
        if (d.id !== docId || !d.tabs) return d
        const remaining = d.tabs.filter((t) => t.id !== tabId)
        const newActive = d.activeTabId === tabId ? (remaining[0]?.id ?? null) : d.activeTabId
        return { ...d, tabs: remaining, activeTabId: newActive }
      }),
    )
  }

  function onStudentTabReorder(docId: number, reorderedTabs: DocTab[]) {
    setStudentDocs((prev) => prev.map((d) => (d.id === docId ? { ...d, tabs: reorderedTabs } : d)))
    if (selectedStudent) {
      saveTabOrder(`doc:${selectedStudent.email}:${docId}`, reorderedTabs.map((t) => t.id))
    }
  }

  function onMentorTabReorder(docId: number, reorderedTabs: DocTab[]) {
    setMentorDocs((prev) => prev.map((d) => (d.id === docId ? { ...d, tabs: reorderedTabs } : d)))
    if (selectedMentor) {
      saveTabOrder(`mentor:${selectedMentor.email}:${docId}`, reorderedTabs.map((t) => t.id))
    }
  }

  function onLitwitsTabReorder(docId: string, reorderedTabs: DocTab[]) {
    setLitwitsDocs((prev) => prev.map((d) => (d.id === docId ? { ...d, tabs: reorderedTabs } : d)))
    saveTabOrder(`litwits:${docId}`, reorderedTabs.map((t) => t.id))
  }

  const studentDocActiveContent = selectedStudentDoc
    ? (selectedStudentDoc.tabs && selectedStudentDoc.activeTabId
        ? selectedStudentDoc.tabs.find((t) => t.id === selectedStudentDoc.activeTabId)?.content ?? selectedStudentDoc.content
        : selectedStudentDoc.content)
    : ''
  // Deliberately does NOT include activeTabId — the Editor stays mounted across
  // tab switches and swaps content internally so edits don't get lost on switch.
  const studentDocEditorKey = selectedStudentDoc && selectedStudent
    ? `${selectedStudent.email}-${selectedStudentDoc.id}`
    : 'none'

  const mentorDocActiveContent = selectedMentorDoc
    ? (selectedMentorDoc.tabs && selectedMentorDoc.activeTabId
        ? selectedMentorDoc.tabs.find((t) => t.id === selectedMentorDoc.activeTabId)?.content ?? selectedMentorDoc.content
        : selectedMentorDoc.content)
    : ''
  const mentorDocEditorKey = selectedMentorDoc && selectedMentor
    ? `mentor-${selectedMentor.email}-${selectedMentorDoc.id}`
    : 'none'

  const activeLitwitsContent = selectedLitwitsDoc
    ? (selectedLitwitsDoc.tabs && selectedLitwitsDoc.activeTabId
        ? selectedLitwitsDoc.tabs.find((t) => t.id === selectedLitwitsDoc.activeTabId)?.content ?? selectedLitwitsDoc.content
        : selectedLitwitsDoc.content)
    : ''
  const litwitsEditorKey = selectedLitwitsDoc
    ? `${selectedLitwitsDoc.id}`
    : 'none'

  // Strict render order: Other Documents first, WSC Documents second.
  // Both sections always render (even when empty) so the admin always has the
  // "Create New Document" button available per section.
  const LITWITS_CATEGORY_ORDER: ('Other Documents' | 'WSC Documents')[] = [
    'Other Documents',
    'WSC Documents',
  ]
  const groupedLitwitsDocs: [string, LitwitsDoc[]][] = (() => {
    const map: Record<string, LitwitsDoc[]> = {}
    for (const doc of litwitsDocs) {
      const cat = doc.category || 'Other Documents'
      if (!map[cat]) map[cat] = []
      map[cat].push(doc)
    }
    const ordered: [string, LitwitsDoc[]][] = []
    for (const cat of LITWITS_CATEGORY_ORDER) {
      ordered.push([cat, map[cat] || []])
    }
    for (const cat of Object.keys(map)) {
      if (!LITWITS_CATEGORY_ORDER.includes(cat as any)) ordered.push([cat, map[cat]])
    }
    return ordered
  })()
  const isAdmin = currentUser?.role === 'admin'

  return (
    <div className="h-screen bg-gray-50 flex flex-col overflow-hidden">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between flex-none z-20">
        <Wordmark />
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-500 hidden sm:block">{currentUser?.name}</span>
          <button
            onClick={handleLogout}
            className="text-xs text-gray-500 hover:text-[#A52A2A] transition-colors uppercase tracking-wide"
          >
            Logout
          </button>
        </div>
      </header>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-200 px-6 flex gap-0 overflow-x-auto flex-none z-10">
        <TabBtn active={tab === 'students'} onClick={() => safeSetTab('students')}>
          Students
        </TabBtn>
        <TabBtn active={tab === 'mentor-docs'} onClick={() => safeSetTab('mentor-docs')}>
          Mentor Documents
        </TabBtn>
        <TabBtn active={tab === 'litwits-docs'} onClick={() => safeSetTab('litwits-docs')}>
          LITWITS Documents
        </TabBtn>
        <TabBtn active={tab === 'users'} onClick={() => { safeSetTab('users'); fetchLitwitsDocs() }}>
          Manage Users
        </TabBtn>
        <TabBtn active={tab === 'create'} onClick={() => { safeSetTab('create'); fetchLitwitsDocs() }}>
          Create User
        </TabBtn>
        <TabBtn active={tab === 'bulk'} onClick={() => { safeSetTab('bulk'); fetchLitwitsDocs() }}>
          Bulk User Upload
        </TabBtn>
        <TabBtn active={tab === 'renewals'} onClick={() => safeSetTab('renewals')}>
          Renewals
        </TabBtn>
        <TabBtn active={tab === 'activity-logs'} onClick={() => { safeSetTab('activity-logs'); fetchActivityLogs(); fetchLitwitsDocs() }}>
          Activity Logs
        </TabBtn>
        <TabBtn active={tab === 'arsr'} onClick={() => safeSetTab('arsr')}>
          AR &amp; SR
        </TabBtn>
        <TabBtn active={false} onClick={() => navigate({ to: '/sales' })}>
          Sales
        </TabBtn>
      </div>

      {/* AR & SR Tab */}
      {tab === 'arsr' && (
        <ARSRModule currentUser={currentUser} onUploadComplete={() => fetchUsers({ silent: true })} />
      )}

      {/* Students Tab — grid → docs grid → editor */}
      {tab === 'students' && (
        <main className="flex-1 min-h-0 flex flex-col">
          {studentsView === 'grid' && (
            <div className="flex-1 min-h-0 overflow-auto p-6"><div className="max-w-7xl mx-auto w-full">
              <h1 className="text-2xl font-semibold text-gray-800 mb-6" style={{ fontFamily: '"Playfair Display", serif' }}>
                Students
              </h1>
              {loading ? (
                <p className="text-sm text-gray-400">Loading...</p>
              ) : students.length === 0 ? (
                <p className="text-sm text-gray-400">No students found.</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {students.map((s) => (
                    <PersonCard
                      key={s.email}
                      name={s.name}
                      role={s.role}
                      onClick={() => loadStudentDocs(s)}
                    />
                  ))}
                </div>
              )}
            </div></div>
          )}

          {studentsView === 'studentDocs' && selectedStudent && (
            <div className="flex-1 min-h-0 overflow-auto p-6"><div className="max-w-6xl mx-auto w-full">
              <div className="flex items-center gap-3 mb-6">
                <button
                  onClick={() => {
                    setStudentsView('grid')
                    setSelectedStudent(null)
                    setSelectedStudentDocId(null)
                  }}
                  className="text-xs text-gray-500 hover:text-[#A52A2A] transition-colors uppercase tracking-wide"
                >
                  &larr; Back to Students
                </button>
              </div>
              <h1 className="text-2xl font-semibold text-gray-800 mb-2" style={{ fontFamily: '"Playfair Display", serif' }}>
                {selectedStudent.name}
              </h1>
              <p className="text-sm text-gray-500 mb-6">Documents</p>
              {docsLoading ? (
                <p className="text-sm text-gray-400">Loading...</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {studentDocs.map((doc) => (
                    <DocCard
                      key={doc.id}
                      title={doc.title}
                      icon={DOC_ICONS[doc.id]}
                      onClick={() => {
                        setSelectedStudentDocId(doc.id)
                        setStudentsView('editor')
                      }}
                    />
                  ))}
                </div>
              )}
            </div></div>
          )}

          {studentsView === 'editor' && selectedStudent && selectedStudentDoc && currentUser && (
            <div className="flex-1 min-h-0 flex flex-col">
              <div className="bg-white border-b border-gray-200 px-6 py-2 flex items-center gap-3 flex-none z-10">
                <button
                  onClick={() => setStudentsView('studentDocs')}
                  className="text-xs text-gray-500 hover:text-[#A52A2A] uppercase tracking-wide"
                >
                  &larr; Back to {selectedStudent.name}'s Documents
                </button>
                <span className="text-xs text-gray-300">|</span>
                <span className="text-xs text-gray-500">Editing {selectedStudent.name} - {selectedStudentDoc.title}</span>
              </div>
              <DocumentTabsBar
                tabs={selectedStudentDoc.tabs || null}
                activeTabId={selectedStudentDoc.activeTabId || null}
                canEdit={true}
                onSwitch={(tabId) => {
                  setStudentDocs((prev) =>
                    prev.map((d) =>
                      d.id === selectedStudentDoc.id ? { ...d, activeTabId: tabId } : d,
                    ),
                  )
                }}
                onAdd={() => onStudentTabAdd(selectedStudentDoc.id)}
                onRename={(tabId, newTitle) => onStudentTabRename(selectedStudentDoc.id, tabId, newTitle)}
                onDelete={(tabId) => onStudentTabDelete(selectedStudentDoc.id, tabId)}
                onReorder={(reorderedTabs) => onStudentTabReorder(selectedStudentDoc.id, reorderedTabs)}
              />
              <div className="flex-1 min-h-0 bg-white">
                <Editor
                  key={studentDocEditorKey}
                  docId={selectedStudentDoc.id}
                  userEmail={selectedStudent.email}
                  initialTitle={selectedStudentDoc.title}
                  initialContent={studentDocActiveContent}
                  userRole="admin"
                  currentUserEmail={currentUser.email}
                  currentUserName={currentUser.name}
                  tabs={selectedStudentDoc.tabs || null}
                  activeTabId={selectedStudentDoc.activeTabId || null}
                  onTabsUpdate={(tabs, activeTabId) =>
                    onStudentTabsUpdate(selectedStudentDoc.id, tabs, activeTabId)
                  }
                />
              </div>
            </div>
          )}
        </main>
      )}

      {/* Mentor Documents Tab — grid → docs grid → editor */}
      {tab === 'mentor-docs' && (
        <main className="flex-1 min-h-0 flex flex-col">
          {mentorDocsView === 'grid' && (
            <div className="flex-1 min-h-0 overflow-auto p-6"><div className="max-w-7xl mx-auto w-full">
              <h1 className="text-2xl font-semibold text-gray-800 mb-6" style={{ fontFamily: '"Playfair Display", serif' }}>
                Mentor Documents
              </h1>
              {mentorsListLoading ? (
                <p className="text-sm text-gray-400">Loading...</p>
              ) : mentorsList.length === 0 ? (
                <p className="text-sm text-gray-400">No mentors found.</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {mentorsList.map((m) => (
                    <PersonCard
                      key={m.email}
                      name={m.name}
                      role="mentor"
                      onClick={() => loadMentorDocs(m)}
                    />
                  ))}
                </div>
              )}
            </div></div>
          )}

          {mentorDocsView === 'mentorDocs' && selectedMentor && (
            <div className="flex-1 min-h-0 overflow-auto p-6"><div className="max-w-6xl mx-auto w-full">
              <div className="flex items-center gap-3 mb-6">
                <button
                  onClick={() => {
                    setMentorDocsView('grid')
                    setSelectedMentor(null)
                    setSelectedMentorDocId(null)
                  }}
                  className="text-xs text-gray-500 hover:text-[#A52A2A] transition-colors uppercase tracking-wide"
                >
                  &larr; Back to Mentors
                </button>
              </div>
              <h1 className="text-2xl font-semibold text-gray-800 mb-2" style={{ fontFamily: '"Playfair Display", serif' }}>
                {selectedMentor.name}
              </h1>
              <p className="text-sm text-gray-500 mb-6">Mentor Documents</p>
              {mentorDocsLoading ? (
                <p className="text-sm text-gray-400">Loading...</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {mentorDocs.map((doc) => (
                    <DocCard
                      key={doc.id}
                      title={doc.title}
                      onClick={() => {
                        setSelectedMentorDocId(doc.id)
                        setMentorDocsView('editor')
                      }}
                    />
                  ))}
                </div>
              )}
            </div></div>
          )}

          {mentorDocsView === 'editor' && selectedMentor && selectedMentorDoc && currentUser && (
            <div className="flex-1 min-h-0 flex flex-col">
              <div className="bg-white border-b border-gray-200 px-6 py-2 flex items-center gap-3 flex-none z-10">
                <button
                  onClick={() => setMentorDocsView('mentorDocs')}
                  className="text-xs text-gray-500 hover:text-[#A52A2A] uppercase tracking-wide"
                >
                  &larr; Back to {selectedMentor.name}'s Documents
                </button>
                <span className="text-xs text-gray-300">|</span>
                <span className="text-xs text-gray-500">Editing {selectedMentor.name} - {selectedMentorDoc.title}</span>
              </div>
              <DocumentTabsBar
                tabs={selectedMentorDoc.tabs || null}
                activeTabId={selectedMentorDoc.activeTabId || null}
                canEdit={true}
                onSwitch={(tabId) => {
                  setMentorDocs((prev) =>
                    prev.map((d) =>
                      d.id === selectedMentorDoc.id ? { ...d, activeTabId: tabId } : d,
                    ),
                  )
                }}
                onAdd={() => onMentorTabAdd(selectedMentorDoc.id)}
                onRename={(tabId, newTitle) => onMentorTabRename(selectedMentorDoc.id, tabId, newTitle)}
                onDelete={(tabId) => onMentorTabDelete(selectedMentorDoc.id, tabId)}
                onReorder={(reorderedTabs) => onMentorTabReorder(selectedMentorDoc.id, reorderedTabs)}
              />
              <div className="flex-1 min-h-0 bg-white">
                <Editor
                  key={mentorDocEditorKey}
                  docId={selectedMentorDoc.id}
                  userEmail={selectedMentor.email}
                  initialTitle={selectedMentorDoc.title}
                  initialContent={mentorDocActiveContent}
                  userRole="admin"
                  currentUserEmail={currentUser.email}
                  currentUserName={currentUser.name}
                  apiPath="/api/mentor-documents"
                  disableExport={true}
                  tabs={selectedMentorDoc.tabs || null}
                  activeTabId={selectedMentorDoc.activeTabId || null}
                  onTabsUpdate={(tabs, activeTabId) =>
                    onMentorTabsUpdate(selectedMentorDoc.id, tabs, activeTabId)
                  }
                />
              </div>
            </div>
          )}
        </main>
      )}

      {/* LITWITS Documents Tab — grid → editor */}
      {tab === 'litwits-docs' && (
        <main className="flex-1 min-h-0 flex flex-col">
          {litwitsView === 'grid' && (
            <div className="flex-1 min-h-0 overflow-auto p-6"><div className="max-w-6xl mx-auto w-full">
              <div className="flex items-center justify-between mb-6">
                <h1 className="text-2xl font-semibold text-gray-800" style={{ fontFamily: '"Playfair Display", serif' }}>
                  LITWITS Documents
                </h1>
                <button
                  onClick={initAllLitwitsDocs}
                  className="text-xs text-[#A52A2A] hover:underline"
                  title="Initialize all default LITWITS documents"
                >
                  Init All
                </button>
              </div>
              {litwitsLoading && litwitsDocs.length === 0 ? (
                <p className="text-sm text-gray-400">Loading...</p>
              ) : (
                <div className="space-y-6">
                  {groupedLitwitsDocs.map(([category, catDocs]) => {
                    const isManagedCategory =
                      category === 'Other Documents' || category === 'WSC Documents'
                    return (
                      <div key={category}>
                        <div className="flex items-center justify-between mb-3">
                          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                            {category}
                          </h2>
                          {isAdmin && isManagedCategory && (
                            <button
                              type="button"
                              onClick={() =>
                                createLitwitsDoc(category as 'Other Documents' | 'WSC Documents')
                              }
                              className="text-xs text-[#A52A2A] hover:underline font-medium"
                            >
                              + Create New Document
                            </button>
                          )}
                        </div>
                        {catDocs.length === 0 ? (
                          <p className="text-xs text-gray-400 italic">No documents in this section yet.</p>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                            {catDocs.map((doc) => (
                              <DocCard
                                key={doc.id}
                                title={doc.title}
                                onClick={() => {
                                  setSelectedLitwitsDocId(doc.id)
                                  setLitwitsView('editor')
                                }}
                                onDelete={
                                  isAdmin
                                    ? () => deleteLitwitsDoc(doc)
                                    : undefined
                                }
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div></div>
          )}

          {litwitsView === 'editor' && selectedLitwitsDoc && currentUser && (
            <div className="flex-1 min-h-0 flex flex-col">
              <div className="bg-white border-b border-gray-200 px-6 py-2 flex items-center gap-3 flex-none z-10">
                <button
                  onClick={() => setLitwitsView('grid')}
                  className="text-xs text-gray-500 hover:text-[#A52A2A] uppercase tracking-wide"
                >
                  &larr; Back to Documents
                </button>
                <span className="text-xs text-gray-300">|</span>
                <span className="text-xs text-gray-500">{selectedLitwitsDoc.title}</span>
              </div>
              <DocumentTabsBar
                tabs={selectedLitwitsDoc.tabs || null}
                activeTabId={selectedLitwitsDoc.activeTabId || null}
                canEdit={true}
                onSwitch={(tabId) => {
                  setLitwitsDocs((prev) =>
                    prev.map((d) =>
                      d.id === selectedLitwitsDoc.id ? { ...d, activeTabId: tabId } : d,
                    ),
                  )
                }}
                onAdd={() => {
                  const title = window.prompt('New tab name:', 'New Tab')
                  if (!title) return
                  setLitwitsDocs((prev) =>
                    prev.map((d) => {
                      if (d.id !== selectedLitwitsDoc.id) return d
                      const currentTabs: DocTab[] = d.tabs && d.tabs.length > 0
                        ? d.tabs
                        : [{ id: 'main', title: 'Main', content: d.content || '' }]
                      const newTab: DocTab = { id: `tab-${Date.now()}`, title, content: '' }
                      return { ...d, tabs: [...currentTabs, newTab], activeTabId: newTab.id }
                    }),
                  )
                }}
                onRename={(tabId, newTitle) => {
                  setLitwitsDocs((prev) =>
                    prev.map((d) =>
                      d.id === selectedLitwitsDoc.id && d.tabs
                        ? { ...d, tabs: d.tabs.map((t) => (t.id === tabId ? { ...t, title: newTitle } : t)) }
                        : d,
                    ),
                  )
                }}
                onDelete={(tabId) => {
                  setLitwitsDocs((prev) =>
                    prev.map((d) => {
                      if (d.id !== selectedLitwitsDoc.id || !d.tabs) return d
                      const remaining = d.tabs.filter((t) => t.id !== tabId)
                      const newActive = d.activeTabId === tabId ? (remaining[0]?.id ?? null) : d.activeTabId
                      return { ...d, tabs: remaining, activeTabId: newActive }
                    }),
                  )
                }}
                onReorder={(reorderedTabs) => onLitwitsTabReorder(selectedLitwitsDoc.id, reorderedTabs)}
              />
              <div className="flex-1 min-h-0 bg-white">
                <Editor
                  key={litwitsEditorKey}
                  docId={selectedLitwitsDoc.id}
                  userEmail={currentUser.email}
                  initialTitle={selectedLitwitsDoc.title}
                  initialContent={activeLitwitsContent}
                  userRole="admin"
                  currentUserEmail={currentUser.email}
                  currentUserName={currentUser.name}
                  apiPath="/api/litwits-doc-sync"
                  disableExport={true}
                  disableComments={true}
                  disableSuggestions={true}
                  activityLogPath="/api/litwits-doc-activity"
                  tabs={selectedLitwitsDoc.tabs || null}
                  activeTabId={selectedLitwitsDoc.activeTabId || null}
                  onTabsUpdate={(tabs, activeTabId) => {
                    setLitwitsDocs((prev) =>
                      prev.map((d) =>
                        d.id === selectedLitwitsDoc.id ? { ...d, tabs, activeTabId } : d,
                      ),
                    )
                  }}
                />
              </div>
            </div>
          )}
        </main>
      )}

      {/* Admin-only control pages */}
      {(tab === 'users' || tab === 'create' || tab === 'bulk' || tab === 'renewals' || tab === 'activity-logs') && (
        <main className="flex-1 min-h-0 overflow-auto p-6 w-full">
          {error && (
            <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded border border-red-200">
              {error}
            </div>
          )}

          {/* MANAGE USERS TAB */}
          {tab === 'users' && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <h2
                    className="text-xl font-semibold text-gray-800"
                    style={{ fontFamily: '"Playfair Display", serif' }}
                  >
                    All Users
                  </h2>
                  <SyncStatusPill state={syncState} message={syncStateMessage} />
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleExportUsers}
                    disabled={users.length === 0}
                    className="text-xs bg-green-700 text-white px-4 py-2 rounded hover:bg-green-800 transition-colors disabled:opacity-50 uppercase tracking-wide font-medium"
                  >
                    Export Users (.xlsx)
                  </button>
                  <button
                    onClick={handleSyncAssignments}
                    disabled={syncing}
                    className="text-xs bg-[#A52A2A] text-white px-4 py-2 rounded hover:bg-[#8B1A1A] transition-colors disabled:opacity-50 uppercase tracking-wide font-medium"
                  >
                    {syncing ? 'Syncing…' : 'Sync All Students to All Mentors'}
                  </button>
                  <button
                    onClick={() => fetchUsers()}
                    className="text-xs text-[#A52A2A] hover:underline"
                  >
                    Refresh
                  </button>
                </div>
              </div>

              {/* Filter bar — Mentor, Session Type, Expiring <7d */}
              <div className="flex flex-wrap items-end gap-3 mb-4 p-3 bg-gray-50 border border-gray-200 rounded">
                <div>
                  <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Mentor</label>
                  <select
                    value={filterMentor}
                    onChange={(e) => setFilterMentor(e.target.value)}
                    className="border border-gray-300 rounded px-2 py-1.5 text-xs outline-none focus:border-[#A52A2A] min-w-[160px]"
                  >
                    <option value="">All mentors</option>
                    {mentors.map((m) => (
                      <option key={m.email} value={m.email}>{m.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Session Type</label>
                  <select
                    value={filterSessionType}
                    onChange={(e) => setFilterSessionType(e.target.value)}
                    className="border border-gray-300 rounded px-2 py-1.5 text-xs outline-none focus:border-[#A52A2A]"
                  >
                    <option value="">All types</option>
                    <option value="Individual">Individual</option>
                    <option value="Group">Group</option>
                    <option value="Renewals">Renewals</option>
                  </select>
                </div>
                <label className="flex items-center gap-2 text-xs text-gray-700 mb-1">
                  <input
                    type="checkbox"
                    checked={filterExpiringOnly}
                    onChange={(e) => setFilterExpiringOnly(e.target.checked)}
                    className="accent-[#A52A2A]"
                  />
                  <span>Expiring in &lt; 7 days</span>
                </label>
                {(filterMentor || filterSessionType || filterExpiringOnly) && (
                  <button
                    onClick={() => {
                      setFilterMentor('')
                      setFilterSessionType('')
                      setFilterExpiringOnly(false)
                    }}
                    className="text-[11px] text-[#A52A2A] hover:underline ml-auto"
                  >
                    Clear filters
                  </button>
                )}
              </div>

              {syncResult && (
                <div
                  className={`mb-4 p-3 text-sm rounded border ${
                    syncResult.startsWith('Error')
                      ? 'bg-red-50 text-red-700 border-red-200'
                      : 'bg-green-50 text-green-700 border-green-200'
                  }`}
                >
                  {syncResult}
                </div>
              )}

              {loading ? (
                <p className="text-gray-400 text-sm">Loading…</p>
              ) : (
                <div className="overflow-x-auto bg-white rounded-lg border border-gray-200 shadow-sm">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        {['Name', 'Email', 'Phone', 'Role', 'Sessions', 'Assigned Mentors', 'Documents Shared', 'Validity Start', 'Validity End', 'Status', 'Password', 'Docs', 'Actions'].map(
                          (h, idx) => (
                            <th
                              key={h}
                              className={`text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap ${
                                idx === 0 ? 'sticky left-0 z-10 bg-gray-50 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]' : ''
                              }`}
                            >
                              {h}
                            </th>
                          )
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {filteredUsers.map((u) => (
                        <tr key={u.email} className="hover:bg-gray-50 group">
                          {/* Name — inline editable, frozen column */}
                          <td className="px-4 py-3 sticky left-0 z-10 bg-white group-hover:bg-gray-50 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                            {editingCell?.email === u.email && editingCell.field === 'name' ? (
                              <div className="flex items-center gap-1">
                                <input
                                  type="text"
                                  value={editValue}
                                  onChange={(e) => setEditValue(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') saveInlineEdit(u.email, 'name', editValue)
                                    if (e.key === 'Escape') setEditingCell(null)
                                  }}
                                  autoFocus
                                  className="border border-[#A52A2A] rounded px-2 py-1 text-sm outline-none w-32"
                                />
                                <button
                                  onClick={() => saveInlineEdit(u.email, 'name', editValue)}
                                  className="text-xs bg-[#A52A2A] text-white px-2 py-1 rounded hover:bg-[#8B1A1A]"
                                >
                                  Save
                                </button>
                                <button
                                  onClick={() => setEditingCell(null)}
                                  className="text-xs text-gray-400 hover:text-gray-600"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <span
                                className="font-medium text-gray-800 cursor-pointer hover:bg-yellow-50 px-1 py-0.5 rounded"
                                onClick={() => startEdit(u.email, 'name', u.name)}
                                title="Click to edit"
                              >
                                {u.name}
                              </span>
                            )}
                          </td>

                          {/* Email — inline editable */}
                          <td className="px-4 py-3">
                            {editingCell?.email === u.email && editingCell.field === 'email' ? (
                              <div className="flex items-center gap-1">
                                <input
                                  type="email"
                                  value={editValue}
                                  onChange={(e) => setEditValue(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') saveInlineEdit(u.email, 'email', editValue)
                                    if (e.key === 'Escape') setEditingCell(null)
                                  }}
                                  autoFocus
                                  className="border border-[#A52A2A] rounded px-2 py-1 text-sm outline-none w-44"
                                />
                                <button
                                  onClick={() => saveInlineEdit(u.email, 'email', editValue)}
                                  className="text-xs bg-[#A52A2A] text-white px-2 py-1 rounded hover:bg-[#8B1A1A]"
                                >
                                  Save
                                </button>
                                <button
                                  onClick={() => setEditingCell(null)}
                                  className="text-xs text-gray-400 hover:text-gray-600"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <span
                                className="text-gray-600 cursor-pointer hover:bg-yellow-50 px-1 py-0.5 rounded"
                                onClick={() => startEdit(u.email, 'email', u.email)}
                                title="Click to edit"
                              >
                                {u.email}
                              </span>
                            )}
                          </td>

                          {/* Phone — inline editable */}
                          <td className="px-4 py-3">
                            {editingCell?.email === u.email && editingCell.field === 'phone' ? (
                              <div className="flex items-center gap-1">
                                <input
                                  type="tel"
                                  value={editValue}
                                  onChange={(e) => setEditValue(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') saveInlineEdit(u.email, 'phone', editValue)
                                    if (e.key === 'Escape') setEditingCell(null)
                                  }}
                                  autoFocus
                                  className="border border-[#A52A2A] rounded px-2 py-1 text-sm outline-none w-28"
                                />
                                <button
                                  onClick={() => saveInlineEdit(u.email, 'phone', editValue)}
                                  className="text-xs bg-[#A52A2A] text-white px-2 py-1 rounded hover:bg-[#8B1A1A]"
                                >
                                  Save
                                </button>
                                <button
                                  onClick={() => setEditingCell(null)}
                                  className="text-xs text-gray-400 hover:text-gray-600"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <span
                                className="text-gray-600 cursor-pointer hover:bg-yellow-50 px-1 py-0.5 rounded"
                                onClick={() => startEdit(u.email, 'phone', u.phone || '')}
                                title="Click to edit"
                              >
                                {u.phone || '—'}
                              </span>
                            )}
                          </td>

                          {/* Role — inline editable dropdown */}
                          <td className="px-4 py-3">
                            {editingCell?.email === u.email && editingCell.field === 'role' ? (
                              <div className="flex items-center gap-1">
                                <select
                                  value={editValue}
                                  onChange={(e) => setEditValue(e.target.value)}
                                  autoFocus
                                  className="border border-[#A52A2A] rounded px-2 py-1 text-sm outline-none"
                                >
                                  {ROLES.map((r) => (
                                    <option key={r} value={r}>
                                      {r.charAt(0).toUpperCase() + r.slice(1)}
                                    </option>
                                  ))}
                                </select>
                                <button
                                  onClick={() => saveInlineEdit(u.email, 'role', editValue)}
                                  className="text-xs bg-[#A52A2A] text-white px-2 py-1 rounded hover:bg-[#8B1A1A]"
                                >
                                  Save
                                </button>
                                <button
                                  onClick={() => setEditingCell(null)}
                                  className="text-xs text-gray-400 hover:text-gray-600"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <span
                                className="cursor-pointer"
                                onClick={() => startEdit(u.email, 'role', u.role)}
                                title="Click to edit"
                              >
                                <span
                                  className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                                    u.role === 'admin'
                                      ? 'bg-red-100 text-red-700'
                                      : u.role === 'mentor'
                                        ? 'bg-blue-100 text-blue-700'
                                        : 'bg-green-100 text-green-700'
                                  }`}
                                >
                                  {u.role}
                                </span>
                              </span>
                            )}
                          </td>

                          {/* Sessions — Attended / Enrolled (Attended is editable) */}
                          <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                            {u.role === 'student' ? (
                              <span className="font-mono text-xs flex items-center gap-1">
                                {editingCell?.email === u.email && editingCell.field === 'attendedSessions' ? (
                                  <>
                                    <input
                                      type="number"
                                      min={0}
                                      value={editValue}
                                      onChange={(e) => setEditValue(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter')
                                          saveAttendedEdit(u, editValue)
                                        if (e.key === 'Escape') setEditingCell(null)
                                      }}
                                      autoFocus
                                      className="border border-[#A52A2A] rounded px-1 py-0.5 text-xs outline-none w-14 font-mono"
                                    />
                                    <span>/ {u.packageSessions ?? 0}</span>
                                    <button
                                      onClick={() => saveAttendedEdit(u, editValue)}
                                      className="text-[10px] bg-[#A52A2A] text-white px-1.5 py-0.5 rounded hover:bg-[#8B1A1A]"
                                    >
                                      Save
                                    </button>
                                    <button
                                      onClick={() => setEditingCell(null)}
                                      className="text-[10px] text-gray-400 hover:text-gray-600"
                                    >
                                      Cancel
                                    </button>
                                  </>
                                ) : (
                                  <span
                                    className="cursor-pointer hover:bg-yellow-50 px-1 py-0.5 rounded"
                                    onClick={() =>
                                      startEdit(
                                        u.email,
                                        'attendedSessions',
                                        String(u.attendedSessions ?? 0),
                                      )
                                    }
                                    title={`Click to edit. SR Count: ${u.srCount ?? 0}, Manual Adjustment: ${u.manualAdjustment ?? 0}`}
                                  >
                                    {(u.attendedSessions ?? 0)} / {(u.packageSessions ?? 0)}
                                  </span>
                                )}
                                {(u.manualAdjustment ?? 0) !== 0 ? (
                                  <span
                                    className="text-[9px] text-amber-600 uppercase font-semibold"
                                    title={`Manual adjustment of ${u.manualAdjustment} on top of SR count ${u.srCount ?? 0}`}
                                  >
                                    adj {(u.manualAdjustment ?? 0) > 0 ? '+' : ''}{u.manualAdjustment}
                                  </span>
                                ) : null}
                                {u.packagePlan && u.packagePlan !== 'numeric' ? (
                                  <span className="text-[10px] text-purple-600 uppercase font-semibold">
                                    {u.packagePlan === 'signature' ? 'Signature' : 'Platinum'}
                                  </span>
                                ) : null}
                                {u.sessionType ? (
                                  <span className="text-[10px] text-gray-400 uppercase">
                                    {u.sessionType}
                                  </span>
                                ) : null}
                                {u.needsRenewal ? (
                                  <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-orange-100 text-orange-700">
                                    Renewal
                                  </span>
                                ) : null}
                              </span>
                            ) : (
                              <span className="text-gray-300">—</span>
                            )}
                          </td>

                          {/* Assigned Mentors — multi-select dropdown */}
                          <td className="px-4 py-3">
                            {u.role === 'student' ? (
                              <div className="relative">
                                <button
                                  onClick={() =>
                                    setMentorDropdownOpen(mentorDropdownOpen === u.email ? null : u.email)
                                  }
                                  className="text-left text-xs border border-gray-300 rounded px-2 py-1.5 w-48 truncate hover:border-[#A52A2A] transition-colors bg-white"
                                  title="Click to manage assigned mentors"
                                >
                                  {u.assignedMentors.length > 0
                                    ? `${u.assignedMentors.length} mentor${u.assignedMentors.length > 1 ? 's' : ''} assigned`
                                    : 'No mentors assigned'}
                                </button>
                                {mentorDropdownOpen === u.email && (
                                  <div className="absolute z-20 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg w-64 max-h-52 overflow-y-auto">
                                    <div className="p-2 border-b border-gray-100">
                                      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                                        Select Mentors
                                      </span>
                                    </div>
                                    {mentors.length === 0 ? (
                                      <p className="px-3 py-2 text-xs text-gray-400">No mentors available</p>
                                    ) : (
                                      mentors.map((m) => (
                                        <label
                                          key={m.email}
                                          className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer text-sm"
                                        >
                                          <input
                                            type="checkbox"
                                            checked={u.assignedMentors.includes(m.email)}
                                            onChange={() =>
                                              toggleMentor(u.email, m.email, u.assignedMentors)
                                            }
                                            className="accent-[#A52A2A]"
                                          />
                                          <span className="text-gray-700">{m.name}</span>
                                          <span className="text-gray-400 text-xs ml-auto truncate max-w-[120px]">
                                            {m.email}
                                          </span>
                                        </label>
                                      ))
                                    )}
                                    <div className="p-2 border-t border-gray-100">
                                      <button
                                        onClick={() => setMentorDropdownOpen(null)}
                                        className="text-xs text-[#A52A2A] hover:underline w-full text-center"
                                      >
                                        Done
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-gray-400 text-xs">—</span>
                            )}
                          </td>

                          {/* Documents Shared — multi-select dropdown */}
                          <td className="px-4 py-3">
                            <div className="relative">
                              <button
                                onClick={() =>
                                  setLitwitsDocDropdownOpen(litwitsDocDropdownOpen === u.email ? null : u.email)
                                }
                                className="text-left text-xs border border-gray-300 rounded px-2 py-1.5 w-44 truncate hover:border-[#A52A2A] transition-colors bg-white"
                                title="Click to manage assigned LITWITS documents"
                              >
                                {(u.assignedLitwitsDocs || []).length > 0
                                  ? `${u.assignedLitwitsDocs.length} doc${u.assignedLitwitsDocs.length > 1 ? 's' : ''} assigned`
                                  : 'No docs assigned'}
                              </button>
                              {litwitsDocDropdownOpen === u.email && (
                                <div className="absolute z-20 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg w-64 max-h-52 overflow-y-auto">
                                  <div className="p-2 border-b border-gray-100">
                                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                                      Select Documents
                                    </span>
                                  </div>
                                  {litwitsDocs.map((doc) => (
                                    <label
                                      key={doc.id}
                                      className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer text-sm"
                                    >
                                      <input
                                        type="checkbox"
                                        checked={(u.assignedLitwitsDocs || []).includes(doc.id)}
                                        onChange={() =>
                                          toggleLitwitsDocAssignment(u.email, doc.id, u.assignedLitwitsDocs || [])
                                        }
                                        className="accent-[#A52A2A]"
                                      />
                                      <span className="text-gray-700">{doc.title}</span>
                                    </label>
                                  ))}
                                  <div className="p-2 border-t border-gray-100">
                                    <button
                                      onClick={() => setLitwitsDocDropdownOpen(null)}
                                      className="text-xs text-[#A52A2A] hover:underline w-full text-center"
                                    >
                                      Done
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          </td>

                          {/* Validity Start */}
                          <td className="px-4 py-3">
                            <input
                              type="date"
                              value={u.validityStart || ''}
                              onChange={(e) => updateUserValidity(u.email, 'validityStart', e.target.value)}
                              className="border border-gray-300 rounded px-2 py-1 text-xs outline-none focus:border-[#A52A2A] w-32"
                            />
                          </td>

                          {/* Validity End */}
                          <td className="px-4 py-3">
                            <div className="flex flex-col gap-1">
                              <input
                                type="date"
                                value={u.validityEnd || ''}
                                onChange={(e) => updateUserValidity(u.email, 'validityEnd', e.target.value)}
                                className="border border-gray-300 rounded px-2 py-1 text-xs outline-none focus:border-[#A52A2A] w-32"
                              />
                              {u.role === 'student' && (
                                <ValidityBadge
                                  status={u.validityStatus}
                                  daysUntilExpiry={u.daysUntilExpiry}
                                />
                              )}
                            </div>
                          </td>

                          {/* Status */}
                          <td className="px-4 py-3">
                            <button
                              onClick={() => toggleUserStatus(u.email, u.status || 'active')}
                              disabled={savingUser === u.email}
                              className={`inline-block px-2 py-0.5 rounded text-xs font-medium cursor-pointer ${
                                (u.status || 'active') === 'active'
                                  ? 'bg-green-100 text-green-700 hover:bg-green-200'
                                  : 'bg-red-100 text-red-700 hover:bg-red-200'
                              } transition-colors`}
                            >
                              {(u.status || 'active').charAt(0).toUpperCase() + (u.status || 'active').slice(1)}
                            </button>
                          </td>

                          {/* Password — inline editable */}
                          <td className="px-4 py-3">
                            {editingCell?.email === u.email && editingCell.field === 'password' ? (
                              <div className="flex items-center gap-1">
                                <input
                                  type="text"
                                  value={editValue}
                                  onChange={(e) => setEditValue(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') saveInlineEdit(u.email, 'password', editValue)
                                    if (e.key === 'Escape') setEditingCell(null)
                                  }}
                                  autoFocus
                                  className="border border-[#A52A2A] rounded px-2 py-1 text-sm outline-none font-mono w-28"
                                />
                                <button
                                  onClick={() => saveInlineEdit(u.email, 'password', editValue)}
                                  className="text-xs bg-[#A52A2A] text-white px-2 py-1 rounded hover:bg-[#8B1A1A]"
                                >
                                  Save
                                </button>
                                <button
                                  onClick={() => setEditingCell(null)}
                                  className="text-xs text-gray-400 hover:text-gray-600"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <span
                                className="text-gray-600 font-mono text-xs cursor-pointer hover:bg-yellow-50 px-1 py-0.5 rounded"
                                onClick={() => startEdit(u.email, 'password', u.password)}
                                title="Click to edit"
                              >
                                {u.password}
                              </span>
                            )}
                          </td>

                          {/* Docs count */}
                          <td className="px-4 py-3 text-center text-gray-600">
                            {u.role === 'student' ? '4' : '—'}
                          </td>

                          {/* Actions */}
                          <td className="px-4 py-3">
                            <button
                              onClick={() => handleDelete(u.email)}
                              disabled={savingUser === u.email}
                              className="text-xs text-red-500 hover:underline disabled:opacity-50"
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                      {filteredUsers.length === 0 && (
                        <tr>
                          <td colSpan={13} className="px-4 py-8 text-center text-gray-400 text-sm">
                            {users.length === 0
                              ? 'No users found. Create one using the Create User tab.'
                              : 'No users match the current filters.'}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* CREATE USER TAB */}
          {tab === 'create' && (
            <div className="max-w-lg">
              <h2
                className="text-xl font-semibold text-gray-800 mb-6"
                style={{ fontFamily: '"Playfair Display", serif' }}
              >
                Create New User
              </h2>
              <form onSubmit={handleCreate} className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
                {[
                  { label: 'Full Name', key: 'name', type: 'text', required: true },
                  { label: 'Email Address', key: 'email', type: 'email', required: true },
                  { label: 'Password', key: 'password', type: 'text', required: true },
                  { label: 'Phone', key: 'phone', type: 'tel', required: false },
                ].map(({ label, key, type, required }) => (
                  <div key={key}>
                    <label className="block text-xs font-medium text-gray-600 mb-1 uppercase tracking-wide">
                      {label}
                    </label>
                    <input
                      type={type}
                      required={required}
                      value={(form as any)[key]}
                      onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                      className="w-full border border-gray-300 rounded px-3 py-2 text-sm outline-none focus:border-[#A52A2A] transition-colors"
                    />
                  </div>
                ))}

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1 uppercase tracking-wide">
                    Role
                  </label>
                  <select
                    value={form.role}
                    onChange={(e) => setForm({ ...form, role: e.target.value })}
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm outline-none focus:border-[#A52A2A]"
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r.charAt(0).toUpperCase() + r.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>

                {formError && <p className="text-xs text-red-600">{formError}</p>}
                {formSuccess && <p className="text-xs text-green-600">{formSuccess}</p>}

                {form.role === 'student' && (
                  <p className="text-xs text-gray-500 bg-blue-50 px-3 py-2 rounded border border-blue-100">
                    All mentors will be automatically assigned to this student.
                  </p>
                )}

                {form.role === 'student' && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1 uppercase tracking-wide">
                          Package
                        </label>
                        <select
                          value={form.packagePlan}
                          onChange={(e) => {
                            const plan = e.target.value as 'numeric' | 'signature' | 'platinum'
                            setForm((prev) => {
                              const sessions = parseInt(prev.packageSessions || '0', 10) || 0
                              const start = prev.validityStart || todayISO()
                              return {
                                ...prev,
                                packagePlan: plan,
                                validityStart: prev.validityStart || start,
                                validityEnd: computeValidityEnd(start, plan, sessions),
                              }
                            })
                          }}
                          className="w-full border border-gray-300 rounded px-3 py-2 text-sm outline-none focus:border-[#A52A2A]"
                        >
                          <option value="numeric">Numeric (per-session)</option>
                          <option value="signature">Signature (6 months)</option>
                          <option value="platinum">Platinum (12 months)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1 uppercase tracking-wide">
                          Package of Sessions
                        </label>
                        <input
                          type="number"
                          min={0}
                          disabled={form.packagePlan !== 'numeric'}
                          value={form.packageSessions}
                          onChange={(e) => {
                            const v = e.target.value
                            setForm((prev) => {
                              const sessions = parseInt(v || '0', 10) || 0
                              const start = prev.validityStart || todayISO()
                              return {
                                ...prev,
                                packageSessions: v,
                                validityStart: prev.validityStart || start,
                                validityEnd: computeValidityEnd(start, prev.packagePlan, sessions),
                              }
                            })
                          }}
                          placeholder={form.packagePlan === 'numeric' ? 'e.g. 12' : 'n/a'}
                          className="w-full border border-gray-300 rounded px-3 py-2 text-sm outline-none focus:border-[#A52A2A] transition-colors disabled:bg-gray-50 disabled:text-gray-400"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1 uppercase tracking-wide">
                          Session Type
                        </label>
                        <select
                          value={form.sessionType}
                          onChange={(e) => setForm({ ...form, sessionType: e.target.value })}
                          className="w-full border border-gray-300 rounded px-3 py-2 text-sm outline-none focus:border-[#A52A2A]"
                        >
                          {['Individual', 'Group', 'Renewals'].map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <p className="text-[11px] text-gray-500 bg-amber-50 border border-amber-100 rounded px-3 py-2">
                      Validity end is auto-calculated:
                      {' '}
                      <b>
                        {form.packagePlan === 'signature'
                          ? '6 months'
                          : form.packagePlan === 'platinum'
                            ? '12 months'
                            : `${parseInt(form.packageSessions || '0', 10) || 0} sessions × 7 days`}
                      </b>
                      {' '}from the start date. Both dates remain editable below.
                    </p>
                  </div>
                )}

                {/* Assign LITWITS Documents */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-2 uppercase tracking-wide">
                    Assign LITWITS Documents
                  </label>
                  <div className="bg-gray-50 rounded border border-gray-200 p-3 space-y-1 max-h-48 overflow-y-auto">
                    {litwitsDocs.map((doc) => (
                      <label key={doc.id} className="flex items-center gap-2 cursor-pointer text-sm py-1">
                        <input
                          type="checkbox"
                          checked={form.assignedLitwitsDocs.includes(doc.id)}
                          onChange={() => {
                            const updated = form.assignedLitwitsDocs.includes(doc.id)
                              ? form.assignedLitwitsDocs.filter(d => d !== doc.id)
                              : [...form.assignedLitwitsDocs, doc.id]
                            setForm({ ...form, assignedLitwitsDocs: updated })
                          }}
                          className="accent-[#A52A2A]"
                        />
                        <span className="text-gray-700">{doc.title}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Validity Period */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1 uppercase tracking-wide">
                      Validity Start
                    </label>
                    <input
                      type="date"
                      value={form.validityStart}
                      onChange={(e) => {
                        const start = e.target.value
                        setForm((prev) => ({
                          ...prev,
                          validityStart: start,
                          validityEnd:
                            prev.role === 'student'
                              ? computeValidityEnd(
                                  start,
                                  prev.packagePlan,
                                  parseInt(prev.packageSessions || '0', 10) || 0,
                                )
                              : prev.validityEnd,
                        }))
                      }}
                      className="w-full border border-gray-300 rounded px-3 py-2 text-sm outline-none focus:border-[#A52A2A] transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1 uppercase tracking-wide">
                      Validity End
                    </label>
                    <input
                      type="date"
                      value={form.validityEnd}
                      onChange={(e) => setForm({ ...form, validityEnd: e.target.value })}
                      className="w-full border border-gray-300 rounded px-3 py-2 text-sm outline-none focus:border-[#A52A2A] transition-colors"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full bg-[#A52A2A] text-white py-2.5 text-xs tracking-widest uppercase font-medium hover:bg-[#8B1A1A] transition-colors rounded"
                >
                  Create User
                </button>
              </form>
            </div>
          )}

          {/* BULK USER UPLOAD — single page with 3 stacked sections */}
          {tab === 'bulk' && (
            <div className="max-w-4xl space-y-10">
              <div>
                <h2
                  className="text-2xl font-semibold text-gray-800"
                  style={{ fontFamily: '"Playfair Display", serif' }}
                >
                  Bulk User Upload
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                  Manage user imports, document uploads, and version history from one place.
                </p>
              </div>

              {/* SECTION 1 — BULK USER UPLOAD */}
              <section>
                <h3
                  className="text-lg font-semibold text-gray-800 mb-2"
                  style={{ fontFamily: '"Playfair Display", serif' }}
                >
                  Section 1 · Bulk User Upload
                </h3>
                <p className="text-sm text-gray-500 mb-4">
                  Upload an Excel (.xlsx, .xls) or CSV file with the following columns:
                </p>
                <div className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded p-3 mb-4 leading-relaxed">
                  <code className="font-mono">
                    Name, Email, Phone, Role, Assigned Mentors, Documents Shared, Package, Package of Sessions, Session Type, Validity Start, Validity End, Status, Password
                  </code>
                  <ul className="mt-2 ml-4 list-disc text-[11px] text-gray-500 space-y-0.5">
                    <li><b>Assigned Mentors</b> and <b>Documents Shared</b> may contain comma- or semicolon-separated values.</li>
                    <li>Mentors are auto-assigned to students <i>only</i> when the Assigned Mentors column is empty.</li>
                    <li><b>Package</b> may be a number, <code>Signature</code> (6 months) or <code>Platinum</code> (12 months). Validity end is auto-calculated when blank.</li>
                    <li><b>Validity Start / End</b> accept date strings (YYYY-MM-DD) or Excel date cells.</li>
                    <li><b>Status</b> defaults to <code>active</code> when omitted; <b>Role</b> defaults to <code>student</code>.</li>
                  </ul>
                </div>

                <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-2 uppercase tracking-wide">
                      Select File
                    </label>
                    <input
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      onChange={handleBulkFile}
                      className="block w-full text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-xs file:font-medium file:bg-[#A52A2A] file:text-white hover:file:bg-[#8B1A1A] file:cursor-pointer"
                    />
                  </div>

                  {bulkStatus && (
                    <p className="text-sm text-gray-600 bg-gray-50 px-3 py-2 rounded border border-gray-200">
                      {bulkStatus}
                    </p>
                  )}

                  {bulkRows.length > 0 && (
                    <>
                      <div className="overflow-x-auto border border-gray-200 rounded max-h-64">
                        <table className="min-w-full text-xs">
                          <thead className="bg-gray-50 border-b border-gray-200">
                            <tr>
                              {Object.keys(bulkRows[0]).map((k) => (
                                <th key={k} className="px-3 py-2 text-left font-semibold text-gray-500 whitespace-nowrap">
                                  {k}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {bulkRows.slice(0, 20).map((row, i) => (
                              <tr key={i}>
                                {Object.values(row).map((v: any, j) => (
                                  <td key={j} className="px-3 py-2 text-gray-700 whitespace-nowrap">
                                    {String(v)}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <button
                        onClick={handleBulkImport}
                        className="bg-[#A52A2A] text-white px-6 py-2.5 text-xs tracking-widest uppercase font-medium hover:bg-[#8B1A1A] transition-colors rounded"
                      >
                        Import {bulkRows.length} Users
                      </button>
                    </>
                  )}
                </div>
              </section>

              {/* SECTION 2 — AR BULK UPLOAD */}
              <section>
                <h3
                  className="text-lg font-semibold text-gray-800 mb-2"
                  style={{ fontFamily: '"Playfair Display", serif' }}
                >
                  Section 2 · AR Bulk Upload
                </h3>
                <p className="text-sm text-gray-500 mb-4">
                  Upload an Excel file with the Attendance Report columns. Existing students are matched by Email and updated; new emails create a student record. Uploaded Attended is converted to a manual adjustment so SR data is never overwritten.
                </p>
                <div className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded p-3 mb-4 leading-relaxed">
                  <code className="font-mono">
                    Name, Email, School Board, Parent Name, GMB Review, Remarks, Enrolled Sessions, Attended Sessions, Session Type
                  </code>
                  <ul className="mt-2 ml-4 list-disc text-[11px] text-gray-500 space-y-0.5">
                    <li>Match is by <b>Email</b> (case-insensitive). Existing → update; new → create.</li>
                    <li><b>Enrolled Sessions</b> sets the student's package size.</li>
                    <li><b>Attended Sessions</b> becomes <i>Manual Adjustment = Uploaded Attended − SR Count</i>.</li>
                    <li>Attended &gt; Enrolled is rejected for numeric packages (Signature/Platinum are unlimited).</li>
                    <li><b>Session Type</b> may be Group, Individual, or Renewals.</li>
                  </ul>
                </div>
                <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-2 uppercase tracking-wide">
                      Select File
                    </label>
                    <input
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      onChange={handleArBulkFile}
                      className="block w-full text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-xs file:font-medium file:bg-[#A52A2A] file:text-white hover:file:bg-[#8B1A1A] file:cursor-pointer"
                    />
                  </div>

                  {arBulkStatus && (
                    <p className="text-sm text-gray-600 bg-gray-50 px-3 py-2 rounded border border-gray-200">
                      {arBulkStatus}
                    </p>
                  )}

                  {arBulkRows.length > 0 && (
                    <>
                      <div className="overflow-x-auto border border-gray-200 rounded max-h-64">
                        <table className="min-w-full text-xs">
                          <thead className="bg-gray-50 border-b border-gray-200">
                            <tr>
                              {Object.keys(arBulkRows[0]).map((k) => (
                                <th key={k} className="px-3 py-2 text-left font-semibold text-gray-500 whitespace-nowrap">
                                  {k}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {arBulkRows.slice(0, 20).map((row, i) => (
                              <tr key={i}>
                                {Object.values(row).map((v: any, j) => (
                                  <td key={j} className="px-3 py-2 text-gray-700 whitespace-nowrap">
                                    {String(v)}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <button
                        onClick={handleArBulkImport}
                        className="bg-[#A52A2A] text-white px-6 py-2.5 text-xs tracking-widest uppercase font-medium hover:bg-[#8B1A1A] transition-colors rounded"
                      >
                        Import {arBulkRows.length} AR Rows
                      </button>
                    </>
                  )}

                  {arBulkErrors.length > 0 && (
                    <div className="border border-amber-200 bg-amber-50 rounded p-3">
                      <h4 className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-2">
                        Errors Panel ({arBulkErrors.length})
                      </h4>
                      <ul className="text-xs space-y-1 max-h-48 overflow-auto">
                        {arBulkErrors.map((e, i) => (
                          <li key={i} className="flex gap-2">
                            <span className="font-medium text-amber-800 min-w-[120px]">{e.name}</span>
                            <span className="text-amber-700">{e.issue}</span>
                            <span className="text-gray-500 ml-auto">{e.action}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </section>

              {/* SECTION 3 — SR BULK UPLOAD */}
              <section>
                <h3
                  className="text-lg font-semibold text-gray-800 mb-2"
                  style={{ fontFamily: '"Playfair Display", serif' }}
                >
                  Section 3 · SR Bulk Upload
                </h3>
                <p className="text-sm text-gray-500 mb-4">
                  Upload an Excel file with Session Report rows. Each valid row counts as one attended session. Sessions under 5 minutes are skipped, and duplicates (same student × same date) are removed automatically.
                </p>
                <div className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded p-3 mb-4 leading-relaxed">
                  <code className="font-mono">
                    Date, Student Name, Duration, Mentor, Topic
                  </code>
                  <ul className="mt-2 ml-4 list-disc text-[11px] text-gray-500 space-y-0.5">
                    <li>Date may be an Excel date or YYYY-MM-DD string.</li>
                    <li>Duration is in minutes; rows under 5 are dropped.</li>
                    <li>Names are matched against Manage Users (case-insensitive). Unmatched → "Name (Discovery Student)".</li>
                    <li>Each valid row contributes one session date — feeds the SR Count used by both AR and Manage Users.</li>
                  </ul>
                </div>
                <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-2 uppercase tracking-wide">
                      Select File
                    </label>
                    <input
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      onChange={handleSrBulkFile}
                      className="block w-full text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-xs file:font-medium file:bg-[#A52A2A] file:text-white hover:file:bg-[#8B1A1A] file:cursor-pointer"
                    />
                  </div>

                  {srBulkStatus && (
                    <p className="text-sm text-gray-600 bg-gray-50 px-3 py-2 rounded border border-gray-200">
                      {srBulkStatus}
                    </p>
                  )}

                  {srBulkRows.length > 0 && (
                    <>
                      <div className="overflow-x-auto border border-gray-200 rounded max-h-64">
                        <table className="min-w-full text-xs">
                          <thead className="bg-gray-50 border-b border-gray-200">
                            <tr>
                              {Object.keys(srBulkRows[0]).map((k) => (
                                <th key={k} className="px-3 py-2 text-left font-semibold text-gray-500 whitespace-nowrap">
                                  {k}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {srBulkRows.slice(0, 20).map((row, i) => (
                              <tr key={i}>
                                {Object.values(row).map((v: any, j) => (
                                  <td key={j} className="px-3 py-2 text-gray-700 whitespace-nowrap">
                                    {String(v)}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <button
                        onClick={handleSrBulkImport}
                        className="bg-[#A52A2A] text-white px-6 py-2.5 text-xs tracking-widest uppercase font-medium hover:bg-[#8B1A1A] transition-colors rounded"
                      >
                        Import {srBulkRows.length} SR Rows
                      </button>
                    </>
                  )}

                  {srBulkErrors.length > 0 && (
                    <div className="border border-amber-200 bg-amber-50 rounded p-3">
                      <h4 className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-2">
                        Errors Panel ({srBulkErrors.length})
                      </h4>
                      <ul className="text-xs space-y-1 max-h-48 overflow-auto">
                        {srBulkErrors.map((e, i) => (
                          <li key={i} className="flex gap-2">
                            <span className="font-medium text-amber-800 min-w-[160px]">{e.name}</span>
                            <span className="text-amber-700">{e.issue}</span>
                            <span className="text-gray-500 ml-auto">{e.action}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </section>

              {/* SECTION 4 — UPLOAD DOCUMENT */}
              <section>
                <h3
                  className="text-lg font-semibold text-gray-800 mb-2"
                  style={{ fontFamily: '"Playfair Display", serif' }}
                >
                  Section 4 · Upload Document
                </h3>
                <p className="text-sm text-gray-500 mb-4">
                  Upload a DOCX or PDF file to import content into a LITWITS document. The document will be parsed, formatting preserved, and mapped to the selected document type.
                </p>

                <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-5">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1 uppercase tracking-wide">
                      Document Type
                    </label>
                    <select
                      value={uploadDocType}
                      onChange={(e) => setUploadDocType(e.target.value)}
                      className="w-full border border-gray-300 rounded px-3 py-2 text-sm outline-none focus:border-[#A52A2A] transition-colors"
                    >
                      <option value="">Select document type...</option>
                      {UPLOAD_DOC_TYPES.map((doc) => (
                        <option key={doc.id} value={doc.id}>{doc.title}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1 uppercase tracking-wide">
                      Select File (.docx or .pdf)
                    </label>
                    <input
                      type="file"
                      accept=".docx,.pdf"
                      onChange={handleUploadFileChange}
                      className="block w-full text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-xs file:font-medium file:bg-[#A52A2A] file:text-white hover:file:bg-[#8B1A1A] file:cursor-pointer"
                    />
                    {uploadFile && (
                      <p className="text-xs text-gray-500 mt-1">
                        Selected: {uploadFile.name} ({(uploadFile.size / 1024).toFixed(1)} KB)
                      </p>
                    )}
                  </div>

                  {uploadDocType && (
                    <p className="text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded border border-amber-200">
                      If content already exists for "{UPLOAD_DOC_TYPES.find(d => d.id === uploadDocType)?.title}", it will be replaced. Previous versions are saved in Version History.
                    </p>
                  )}

                  <button
                    onClick={handleUploadParse}
                    disabled={!uploadFile || !uploadDocType || uploadParsing}
                    className="bg-[#A52A2A] text-white px-6 py-2.5 text-xs tracking-widest uppercase font-medium hover:bg-[#8B1A1A] transition-colors rounded disabled:opacity-50"
                  >
                    {uploadParsing ? 'Parsing...' : 'Parse Document'}
                  </button>

                  {uploadStatus && (
                    <p className={`text-sm px-3 py-2 rounded border ${
                      uploadStatus.startsWith('Error') || uploadStatus.startsWith('Failed') || uploadStatus === 'Only .docx and .pdf files are supported.'
                        ? 'bg-red-50 text-red-700 border-red-200'
                        : uploadStatus.includes('successfully')
                          ? 'bg-green-50 text-green-700 border-green-200'
                          : 'bg-blue-50 text-blue-700 border-blue-200'
                    }`}>
                      {uploadStatus}
                    </p>
                  )}

                  {uploadPreview && (
                    <div>
                      <h4 className="text-sm font-semibold text-gray-700 mb-2">Preview</h4>
                      <div
                        className="border border-gray-200 rounded p-4 max-h-96 overflow-y-auto prose prose-sm max-w-none bg-gray-50"
                        dangerouslySetInnerHTML={{ __html: uploadPreview }}
                      />
                      <button
                        onClick={handleUploadSave}
                        className="mt-4 bg-[#A52A2A] text-white px-6 py-2.5 text-xs tracking-widest uppercase font-medium hover:bg-[#8B1A1A] transition-colors rounded"
                      >
                        Upload to Document
                      </button>
                    </div>
                  )}
                </div>
              </section>

              {/* SECTION 5 — DOCUMENT VERSION HISTORY */}
              <section>
                <h3
                  className="text-lg font-semibold text-gray-800 mb-2"
                  style={{ fontFamily: '"Playfair Display", serif' }}
                >
                  Section 5 · Document Version History
                </h3>
                <p className="text-sm text-gray-500 mb-4">
                  Browse, preview, and restore previous versions of any LITWITS document.
                </p>

                <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
                  <div className="flex items-end gap-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Select Document</label>
                      <select
                        value={versionDocId}
                        onChange={(e) => { if (e.target.value) fetchVersions(e.target.value) }}
                        className="border border-gray-300 rounded px-3 py-1.5 text-sm outline-none focus:border-[#A52A2A] min-w-[240px]"
                      >
                        <option value="">Choose a document...</option>
                        {litwitsDocs.map((doc) => (
                          <option key={doc.id} value={doc.id}>{doc.title}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {versionsLoading ? (
                    <p className="text-gray-400 text-sm">Loading versions...</p>
                  ) : versionDocId ? (
                    <div className="flex gap-6">
                      <div className="w-72 shrink-0">
                        <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
                          <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
                            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Versions ({versions.length})</h4>
                          </div>
                          <div className="max-h-96 overflow-y-auto divide-y divide-gray-100">
                            {versions.map((v) => (
                              <div
                                key={v.timestamp}
                                className={`px-4 py-3 cursor-pointer hover:bg-gray-50 ${versionViewTimestamp === v.timestamp ? 'bg-blue-50 border-l-2 border-[#A52A2A]' : ''}`}
                                onClick={() => viewVersion(versionDocId, v.timestamp)}
                              >
                                <div className="text-xs text-gray-800 font-medium">{v.editedBy}</div>
                                <div className="text-[10px] text-gray-400 mt-0.5">
                                  {new Date(v.timestamp).toLocaleString()}
                                </div>
                                <button
                                  onClick={(e) => { e.stopPropagation(); restoreVersion(versionDocId, v.timestamp) }}
                                  className="text-[10px] text-[#A52A2A] hover:underline mt-1 block"
                                >
                                  Restore this version
                                </button>
                              </div>
                            ))}
                            {versions.length === 0 && (
                              <div className="px-4 py-8 text-center text-gray-400 text-xs">
                                No versions found for this document.
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {versionContent !== null && (
                        <div className="flex-1 bg-white rounded-lg border border-gray-200 p-6 overflow-y-auto max-h-[500px]">
                          <h4 className="text-sm font-semibold text-gray-700 mb-3">
                            Version Preview — {versionViewTimestamp && new Date(versionViewTimestamp).toLocaleString()}
                          </h4>
                          <div
                            className="prose prose-sm max-w-none"
                            dangerouslySetInnerHTML={{ __html: versionContent }}
                          />
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-gray-400 text-sm">Select a document to view its version history.</p>
                  )}
                </div>
              </section>
            </div>
          )}

          {/* UPLOAD DOCUMENT and VERSION HISTORY are rendered inside the Bulk User Upload page */}

          {/* RENEWALS TAB — students whose package has elapsed or whose
              session count is exhausted, per the Group / Individual rules. */}
          {tab === 'renewals' && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <h2
                    className="text-xl font-semibold text-gray-800"
                    style={{ fontFamily: '"Playfair Display", serif' }}
                  >
                    Renewals
                  </h2>
                  <SyncStatusPill state={syncState} message={syncStateMessage} />
                </div>
                <button
                  onClick={() => fetchUsers()}
                  className="text-xs text-[#A52A2A] hover:underline"
                >
                  Refresh
                </button>
              </div>
              <p className="text-xs text-gray-500 mb-4">
                Students appear here once their validity has expired or (for Individual / numeric packages) their attended count has caught up to the package size. Group packages renew on either condition. Click <b>Re-add</b> to start a new set — the next start date is auto-set.
              </p>
              {renewalUsers.length === 0 ? (
                <div className="bg-white border border-gray-200 rounded p-6 text-sm text-gray-400 text-center">
                  No students need renewal right now.
                </div>
              ) : (
                <div className="overflow-x-auto bg-white rounded-lg border border-gray-200 shadow-sm">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        {['Name', 'Session Type', 'Sessions', 'Validity End', 'Status', 'Next Set Starts', 'Action'].map((h) => (
                          <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {renewalUsers.map((u) => {
                        const baseEnd = u.validityEnd || todayISO()
                        const today = todayISO()
                        const nextStart = baseEnd > today ? addDaysISO(baseEnd, 1) : today
                        return (
                          <tr key={u.email} className="hover:bg-gray-50">
                            <td className="px-4 py-3 font-medium text-gray-800">{u.name}</td>
                            <td className="px-4 py-3 text-xs text-gray-600">{u.sessionType || '—'}</td>
                            <td className="px-4 py-3 font-mono text-xs">
                              {(u.attendedSessions ?? 0)} / {(u.packageSessions ?? 0)}
                              {u.packagePlan && u.packagePlan !== 'numeric' ? (
                                <span className="ml-2 text-[10px] text-purple-600 uppercase font-semibold">
                                  {u.packagePlan}
                                </span>
                              ) : null}
                            </td>
                            <td className="px-4 py-3 text-xs text-gray-600">
                              {u.validityEnd || '—'}
                              <div className="mt-1">
                                <ValidityBadge
                                  status={u.validityStatus}
                                  daysUntilExpiry={u.daysUntilExpiry}
                                />
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${(u.status || 'active') === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                {u.status || 'active'}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-xs text-gray-700">
                              <span className="font-mono">NEW SET : {nextStart}</span>
                            </td>
                            <td className="px-4 py-3">
                              <button
                                onClick={() => handleReAdd(u)}
                                disabled={savingUser === u.email}
                                className="text-xs bg-[#A52A2A] text-white px-3 py-1.5 rounded hover:bg-[#8B1A1A] transition-colors disabled:opacity-50"
                              >
                                Re-add
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ACTIVITY LOGS TAB */}
          {tab === 'activity-logs' && (
            <div>
              <h2
                className="text-xl font-semibold text-gray-800 mb-4"
                style={{ fontFamily: '"Playfair Display", serif' }}
              >
                Document Activity Logs
              </h2>

              {/* Filters */}
              <div className="flex items-end gap-3 mb-4 flex-wrap">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Filter by User</label>
                  <input
                    type="text"
                    value={activityFilterUser}
                    onChange={(e) => setActivityFilterUser(e.target.value)}
                    placeholder="user@email.com"
                    className="border border-gray-300 rounded px-3 py-1.5 text-sm outline-none focus:border-[#A52A2A] w-48"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Filter by Document</label>
                  <select
                    value={activityFilterDoc}
                    onChange={(e) => setActivityFilterDoc(e.target.value)}
                    className="border border-gray-300 rounded px-3 py-1.5 text-sm outline-none focus:border-[#A52A2A]"
                  >
                    <option value="">All Documents</option>
                    {litwitsDocs.map((doc) => (
                      <option key={doc.id} value={doc.id}>{doc.title}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Filter by Date</label>
                  <input
                    type="date"
                    value={activityFilterDate}
                    onChange={(e) => setActivityFilterDate(e.target.value)}
                    className="border border-gray-300 rounded px-3 py-1.5 text-sm outline-none focus:border-[#A52A2A]"
                  />
                </div>
                <button
                  onClick={fetchActivityLogs}
                  className="bg-[#A52A2A] text-white px-4 py-1.5 rounded text-xs uppercase tracking-wide hover:bg-[#8B1A1A] transition-colors"
                >
                  Search
                </button>
                <button
                  onClick={() => { setActivityFilterUser(''); setActivityFilterDoc(''); setActivityFilterDate(''); fetchActivityLogs() }}
                  className="text-xs text-gray-500 hover:text-[#A52A2A]"
                >
                  Clear Filters
                </button>
              </div>

              {/* Logs table */}
              {activityLoading ? (
                <p className="text-gray-400 text-sm">Loading...</p>
              ) : (
                <div className="overflow-x-auto bg-white rounded-lg border border-gray-200 shadow-sm">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        {['User', 'Role', 'Document', 'Action', 'Duration', 'Timestamp'].map((h) => (
                          <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {activityLogs.map((log, i) => (
                        <tr key={i} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-gray-800">{log.userName}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                              log.userRole === 'admin' ? 'bg-red-100 text-red-700'
                                : log.userRole === 'mentor' ? 'bg-blue-100 text-blue-700'
                                  : 'bg-green-100 text-green-700'
                            }`}>
                              {log.userRole}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-gray-600">{log.documentId}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-block px-2 py-0.5 rounded text-xs ${
                              log.action === 'edited' ? 'bg-yellow-100 text-yellow-700'
                                : log.action === 'opened' ? 'bg-blue-100 text-blue-700'
                                  : 'bg-gray-100 text-gray-700'
                            }`}>
                              {log.action}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-gray-600">{log.duration > 0 ? `${Math.round(log.duration / 60)}m ${log.duration % 60}s` : '-'}</td>
                          <td className="px-4 py-3 text-gray-500 text-xs">{new Date(log.timestamp).toLocaleString()}</td>
                        </tr>
                      ))}
                      {activityLogs.length === 0 && (
                        <tr>
                          <td colSpan={6} className="px-4 py-8 text-center text-gray-400 text-sm">
                            No activity logs found.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* VERSION HISTORY is rendered inside the Bulk User Upload page */}
        </main>
      )}
    </div>
  )
}
