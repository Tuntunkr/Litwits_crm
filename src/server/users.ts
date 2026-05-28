import type { SupabaseConfig } from './env'
import { kvGet, kvListBucket, kvSet } from './kv'

const USER_BUCKET = 'user'

export type StoredUser = Record<string, unknown> & {
  name: string
  email: string
  password: string
  role: string
  phone?: string
  assignedMentors?: string[]
  assignedLitwitsDocs?: string[]
  validityStart?: string
  validityEnd?: string
  status?: string
  packageSessions?: number
  sessionType?: string
  packagePlan?: string
  attendedSessions?: number
  srCount?: number
  manualAdjustment?: number
  lastModified?: number
}

function todayISO(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function enrichUser(u: StoredUser): StoredUser {
  const end = String(u.validityEnd || '')
  const start = String(u.validityStart || '')
  let validityStatus: 'expired' | 'expiring' | 'ok' | 'unset' = 'unset'
  let daysUntilExpiry: number | null = null
  let needsRenewal = false
  if (u.role === 'student' && /^\d{4}-\d{2}-\d{2}$/.test(end)) {
    const t = new Date(`${end}T23:59:59`)
    const now = new Date()
    const diffDays = Math.ceil((t.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    daysUntilExpiry = diffDays
    if (diffDays < 0) {
      validityStatus = 'expired'
      needsRenewal = true
    } else if (diffDays <= 14) {
      validityStatus = 'expiring'
      needsRenewal = diffDays <= 7
    } else {
      validityStatus = 'ok'
    }
  } else if (start || end) {
    validityStatus = 'ok'
  }

  return {
    ...u,
    assignedMentors: Array.isArray(u.assignedMentors) ? u.assignedMentors : [],
    assignedLitwitsDocs: Array.isArray(u.assignedLitwitsDocs) ? u.assignedLitwitsDocs : [],
    validityStart: u.validityStart || '',
    validityEnd: u.validityEnd || '',
    status: u.status || 'active',
    packageSessions: typeof u.packageSessions === 'number' ? u.packageSessions : 0,
    sessionType: u.sessionType || '',
    packagePlan: u.packagePlan || 'numeric',
    attendedSessions: typeof u.attendedSessions === 'number' ? u.attendedSessions : 0,
    srCount: typeof u.srCount === 'number' ? u.srCount : 0,
    manualAdjustment: typeof u.manualAdjustment === 'number' ? u.manualAdjustment : 0,
    validityStatus,
    daysUntilExpiry,
    needsRenewal,
    lastModified: typeof u.lastModified === 'number' ? u.lastModified : 0,
  }
}

export async function listUsers(config: SupabaseConfig): Promise<StoredUser[]> {
  const rows = await kvListBucket(config, USER_BUCKET)
  const users = rows.map((r) =>
    enrichUser({ ...(r.value as StoredUser), email: r.key }),
  )
  return users.sort((a, b) =>
    String(a.name || a.email).localeCompare(String(b.name || b.email)),
  )
}

export async function getUserByEmail(
  config: SupabaseConfig,
  email: string,
): Promise<StoredUser | null> {
  const raw = await kvGet<StoredUser>(config, USER_BUCKET, email.toLowerCase())
  if (!raw) return null
  return enrichUser({ ...raw, email: email.toLowerCase() })
}

export async function saveUser(
  config: SupabaseConfig,
  email: string,
  data: StoredUser,
): Promise<StoredUser> {
  const key = email.toLowerCase()
  const next = enrichUser({
    ...data,
    email: key,
    lastModified: Date.now(),
  })
  const { email: _e, ...rest } = next
  await kvSet(config, USER_BUCKET, key, rest)
  return next
}

export function checkStudentValidity(u: StoredUser): { ok: true } | { expired: true; end: string } {
  if (u.role !== 'student') return { ok: true }
  const end = String(u.validityEnd || '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(end)) return { ok: true }
  const t = new Date(`${end}T23:59:59`)
  if (t.getTime() < Date.now()) return { expired: true, end }
  return { ok: true }
}

export function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map((s) => parseInt(s, 10))
  if (!y || !m || !d) return ''
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() + days)
  const yy = dt.getFullYear()
  const mm = String(dt.getMonth() + 1).padStart(2, '0')
  const dd = String(dt.getDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

export function addMonthsISO(iso: string, months: number): string {
  const [y, m, d] = iso.split('-').map((s) => parseInt(s, 10))
  if (!y || !m || !d) return ''
  const dt = new Date(y, m - 1, d)
  dt.setMonth(dt.getMonth() + months)
  const yy = dt.getFullYear()
  const mm = String(dt.getMonth() + 1).padStart(2, '0')
  const dd = String(dt.getDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

export function computeValidityEnd(
  start: string,
  plan: string,
  sessions: number,
): string {
  if (!start) return ''
  if (plan === 'signature') return addMonthsISO(start, 6)
  if (plan === 'platinum') return addMonthsISO(start, 12)
  const n = Math.max(0, Math.floor(sessions || 0))
  if (n <= 0) return ''
  return addDaysISO(start, n * 7)
}

export { todayISO, enrichUser }
