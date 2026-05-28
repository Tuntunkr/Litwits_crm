import { getStore } from '@netlify/blobs'
import { enrichArForUser } from './ar-enrich.mts'

export const config = { path: '/api/users' }

function emailToKey(email: string): string {
  return email.toLowerCase().replace(/[^a-z0-9]/g, '_')
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function withCors(response: Response) {
  const headers = new Headers(response.headers)
  Object.entries(corsHeaders()).forEach(([k, v]) => headers.set(k, v))
  return new Response(response.body, { status: response.status, headers })
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }
}

async function getSession(request: Request) {
  const auth = request.headers.get('Authorization')
  if (!auth?.startsWith('Bearer ')) return null
  const token = auth.slice(7)
  try {
    const store = getStore('litwits-sessions')
    const session = await store.get(token, { type: 'json' }) as any
    if (!session || session.exp < Date.now()) return null
    return session
  } catch {
    return null
  }
}

const DEFAULT_DOC_NAMES: Record<number, string> = {
  1: 'Competition Related Writing',
  2: 'WSC Writing',
  3: 'Debating',
  4: 'MUN',
  5: 'Writing Document',
}

async function initStudentDocs(email: string) {
  const docStore = getStore('litwits-documents')
  const key = emailToKey(email)
  for (let i = 1; i <= 5; i++) {
    const docKey = `${key}:doc:${i}`
    const existing = await docStore.getMetadata(docKey)
    if (!existing) {
      await docStore.setJSON(docKey, { title: DEFAULT_DOC_NAMES[i], content: '' })
    }
  }
}

async function getAllMentorEmails(): Promise<string[]> {
  const userStore = getStore('litwits-users')
  const { blobs } = await userStore.list()
  const users = await Promise.all(blobs.map((b) => userStore.get(b.key, { type: 'json' })))
  return (users.filter(Boolean) as any[])
    .filter((u) => u.role === 'mentor')
    .map((u) => u.email)
}

// Collapse runs of whitespace and strip leading/trailing whitespace so that
// "  Jane   Doe " and "Jane Doe" hash to the same logical name everywhere.
function normalizeName(raw: unknown): string {
  return String(raw ?? '').replace(/\s+/g, ' ').trim()
}

const PACKAGE_PLAN_VALUES = ['numeric', 'signature', 'platinum'] as const
type PackagePlan = (typeof PACKAGE_PLAN_VALUES)[number]

function normalizePackagePlan(raw: unknown): PackagePlan {
  const v = String(raw ?? '').trim().toLowerCase()
  if (v === 'signature') return 'signature'
  if (v === 'platinum') return 'platinum'
  return 'numeric'
}

function todayISO(): string {
  const d = new Date()
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map((s) => parseInt(s, 10))
  if (!y || !m || !d) return ''
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + days)
  const yy = dt.getUTCFullYear()
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(dt.getUTCDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split('-').map((s) => parseInt(s, 10))
  if (!y || !m || !d) return ''
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCMonth(dt.getUTCMonth() + months)
  const yy = dt.getUTCFullYear()
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(dt.getUTCDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

// Validity end is derived from the package plan + sessions count when the
// admin has not pinned an explicit end date. Numeric → 7 days per session;
// Signature → 6 months; Platinum → 12 months.
function computeValidityEnd(
  start: string,
  plan: PackagePlan,
  packageSessions: number,
): string {
  const startISO = start && /^\d{4}-\d{2}-\d{2}$/.test(start) ? start : ''
  if (!startISO) return ''
  if (plan === 'signature') return addMonths(startISO, 6)
  if (plan === 'platinum') return addMonths(startISO, 12)
  const sessions = Math.max(0, Math.floor(packageSessions || 0))
  if (sessions <= 0) return ''
  return addDays(startISO, sessions * 7)
}

// Reads the SR-derived attendance count for a single student from the AR
// workbook's studentSessions index. Used by the attended-sessions edit path
// to compute manualAdjustment = newAttended - srCount.
async function srCountForName(name: string): Promise<number> {
  if (!name) return 0
  try {
    const arStore = getStore({ name: 'litwits-arsr', consistency: 'strong' })
    const wb = (await arStore.get('workbook:ar', { type: 'json' })) as any
    const sessions: Record<string, string[]> = wb?.studentSessions || {}
    const direct = sessions[name]
    if (Array.isArray(direct)) return new Set(direct).size
    const key = name.trim().toLowerCase()
    for (const k of Object.keys(sessions)) {
      if (k.trim().toLowerCase() === key) return new Set(sessions[k] || []).size
    }
  } catch {}
  return 0
}

// Writes one entry to the attended-sessions audit log so every adjustment can
// be traced back to who made it, when, and what the value was before.
export async function writeAttendedAudit(entry: {
  userEmail: string
  userName: string
  editorEmail: string
  editorName: string
  oldAttended: number
  newAttended: number
  oldAdjustment: number
  newAdjustment: number
  source: 'users-tab' | 'ar-cell' | 'ar-bulk' | 'sr-bulk'
}) {
  try {
    const store = getStore({ name: 'litwits-attended-audit', consistency: 'strong' })
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    await store.setJSON(id, { id, timestamp: Date.now(), ...entry })
  } catch (err) {
    console.error('writeAttendedAudit failed', err)
  }
}

// Validates a proposed attended count against the package size. Returns null
// when the value is acceptable, or a string error otherwise. Plan-based
// (Signature / Platinum) packages are unlimited, so they only fail on
// negative values.
export function validateAttended(
  newAttended: number,
  enrolled: number,
  plan: PackagePlan,
): string | null {
  if (!Number.isFinite(newAttended)) return 'Attended must be a number'
  if (newAttended < 0) return 'Attended cannot be negative'
  if (plan === 'signature' || plan === 'platinum') return null
  if (enrolled > 0 && newAttended > enrolled) {
    return `Attended (${newAttended}) cannot exceed Enrolled (${enrolled})`
  }
  return null
}

export default async (request: Request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() })
  }

  const session = await getSession(request)
  if (!session) return withCors(json({ error: 'Unauthorized' }, 401))

  const method = request.method.toUpperCase()

  // GET — list users
  if (method === 'GET') {
    try {
      const userStore = getStore('litwits-users')
      const { blobs } = await userStore.list()
      const users = await Promise.all(blobs.map((b) => userStore.get(b.key, { type: 'json' })))
      const valid = users.filter(Boolean) as any[]

      // Auto-migration: ensure every student has ALL mentors assigned
      if (session.role === 'admin') {
        const allMentorEmails = valid
          .filter((u) => u.role === 'mentor')
          .map((u) => u.email)

        for (const user of valid) {
          if (user.role !== 'student') continue

          // Normalize legacy mentorEmail field
          let current: string[] = Array.isArray(user.assignedMentors)
            ? user.assignedMentors
            : user.mentorEmail
              ? [user.mentorEmail]
              : []

          const merged = Array.from(new Set([...current, ...allMentorEmails]))
          const needsUpdate =
            merged.length !== current.length ||
            !merged.every((m: string) => current.includes(m)) ||
            user.mentorEmail !== undefined

          if (needsUpdate) {
            user.assignedMentors = merged
            delete user.mentorEmail
            await userStore.setJSON(emailToKey(user.email), user)
          }
        }
      }

      // Attendance reflection: count unique session dates per student from
      // the AR workbook's studentSessions index (single source of truth).
      let studentSessions: Record<string, string[]> = {}
      let studentUserMap: Record<string, string> = {}
      try {
        const arStore = getStore({ name: 'litwits-arsr', consistency: 'strong' })
        const wb = (await arStore.get('workbook:ar', { type: 'json' })) as any
        if (wb && wb.studentSessions && typeof wb.studentSessions === 'object') {
          studentSessions = wb.studentSessions
        }
        if (wb && wb.studentUserMap && typeof wb.studentUserMap === 'object') {
          studentUserMap = wb.studentUserMap
        }
      } catch {}
      const attendedFor = (name: string, email: string): number => {
        const direct = studentSessions[name]
        if (Array.isArray(direct)) return new Set(direct).size
        const key = name.trim().toLowerCase()
        for (const k of Object.keys(studentSessions)) {
          if (k.trim().toLowerCase() === key) return new Set(studentSessions[k] || []).size
        }
        if (email) {
          const emailLower = email.toLowerCase()
          for (const [mappedName, mappedEmail] of Object.entries(studentUserMap)) {
            if (mappedEmail.toLowerCase() === emailLower && studentSessions[mappedName]) {
              return new Set(studentSessions[mappedName]).size
            }
          }
        }
        return 0
      }
      const decorate = (u: any) => {
        if (u.role !== 'student') return u
        const enrolled = Number.isFinite(u.packageSessions) ? Number(u.packageSessions) : 0
        const srCount = attendedFor(u.name || '', u.email || '')
        const manualAdjustment = Number.isFinite(u.manualAdjustment) ? Number(u.manualAdjustment) : 0
        // Final Attended = SR Count + Manual Adjustment. SR remains the source
        // of truth; admin edits only ever land on manualAdjustment so SR data
        // is never overwritten.
        const attended = Math.max(0, srCount + manualAdjustment)
        const plan = (u.packagePlan as string) || 'numeric'

        // Validity status — Expiring Soon if end date is within 7 days, Expired
        // if past. Returned alongside the user so every surface (table, filter,
        // Renewals view) reads the same computed value.
        let validityStatus: 'expired' | 'expiring' | 'ok' | 'unset' = 'unset'
        let daysUntilExpiry: number | null = null
        if (u.validityEnd) {
          const end = new Date(`${u.validityEnd}T23:59:59Z`).getTime()
          const now = Date.now()
          const diffDays = Math.ceil((end - now) / (24 * 60 * 60 * 1000))
          daysUntilExpiry = diffDays
          if (diffDays < 0) validityStatus = 'expired'
          else if (diffDays <= 7) validityStatus = 'expiring'
          else validityStatus = 'ok'
        }

        // "Move to Renewals" rule:
        //  - Group: validity expired OR all sessions used
        //  - Individual: sessions complete only
        //  - Plan-based (Signature/Platinum) packages have no session ceiling,
        //    so they only renew on validity expiry.
        const sessionsComplete = plan === 'numeric' && enrolled > 0 && attended >= enrolled
        const expired = validityStatus === 'expired'
        const sessionType = String(u.sessionType || '').toLowerCase()
        let needsRenewal = false
        if (sessionType === 'group') needsRenewal = expired || sessionsComplete
        else if (sessionType === 'individual') needsRenewal = sessionsComplete
        else if (sessionType === 'renewals') needsRenewal = expired || sessionsComplete
        else needsRenewal = sessionsComplete || expired

        return {
          ...u,
          attendedSessions: attended,
          srCount,
          manualAdjustment,
          packageSessions: enrolled,
          packagePlan: plan,
          validityStatus,
          daysUntilExpiry,
          needsRenewal,
        }
      }

      if (session.role === 'mentor') {
        // Mentors see ALL students (since all students are assigned to all mentors by default)
        // Only return name and documents count — hide email, phone, password
        const filtered = valid
          .filter((u) => u.role === 'student' && Array.isArray(u.assignedMentors) && u.assignedMentors.includes(session.email))
          .map(({ name, email, assignedMentors }) => ({ name, email, assignedMentors }))
        return withCors(json({ users: filtered }))
      }
      if (session.role === 'admin') {
        return withCors(json({ users: valid.map(decorate) }))
      }
      return withCors(json({ error: 'Forbidden' }, 403))
    } catch (err) {
      console.error('GET /api/users', err)
      return withCors(json({ error: 'Server error' }, 500))
    }
  }

  // POST — create user (admin only)
  if (method === 'POST') {
    if (session.role !== 'admin') return withCors(json({ error: 'Forbidden' }, 403))
    try {
      const body = await request.json() as any
      const { email, password, role, phone } = body
      const name = normalizeName(body.name)
      if (!name || !email || !password || !role) {
        return withCors(json({ error: 'name, email, password, role required' }, 400))
      }
      const userStore = getStore('litwits-users')

      // Honor explicit mentors when provided; otherwise auto-assign ALL mentors to students.
      let assignedMentors: string[] = []
      const explicitMentors = Array.isArray(body.assignedMentors)
        ? body.assignedMentors.map((m: unknown) => String(m).trim()).filter(Boolean)
        : []
      if (explicitMentors.length > 0) {
        assignedMentors = explicitMentors
      } else if (role === 'student') {
        assignedMentors = await getAllMentorEmails()
      }

      const sessionType = typeof body.sessionType === 'string' ? body.sessionType : ''
      const packageSessionsRaw = body.packageSessions
      const packageSessions =
        typeof packageSessionsRaw === 'number'
          ? Math.max(0, Math.floor(packageSessionsRaw))
          : Math.max(0, parseInt(String(packageSessionsRaw || ''), 10) || 0)
      const packagePlan = normalizePackagePlan(body.packagePlan)

      // Auto-fill start = today and end = derived if unspecified.
      const validityStart = body.validityStart || (role === 'student' ? todayISO() : '')
      const validityEnd =
        body.validityEnd ||
        (role === 'student' ? computeValidityEnd(validityStart, packagePlan, packageSessions) : '')

      const user = {
        name,
        email,
        password,
        role,
        phone: phone || '',
        assignedMentors,
        assignedLitwitsDocs: Array.isArray(body.assignedLitwitsDocs) ? body.assignedLitwitsDocs : [],
        validityStart,
        validityEnd,
        status: body.status || 'active',
        packageSessions,
        sessionType,
        packagePlan,
        lastModified: Date.now(),
      }
      await userStore.setJSON(emailToKey(email), user)
      if (role === 'student') await initStudentDocs(email)

      // Trigger AR enrichment for students (non-blocking, best-effort).
      if (role === 'student') {
        const validity = user.validityEnd ? `${user.validityStart || ''} → ${user.validityEnd}` : ''
        enrichArForUser({
          email,
          name,
          validity,
          packageSessions,
          sessionType,
        }).catch((err) => {
          console.error('AR enrichment (create) failed', err)
        })
      }

      // If a new mentor is created, add them to ALL existing students
      if (role === 'mentor') {
        const { blobs } = await userStore.list()
        const allUsers = await Promise.all(blobs.map((b) => userStore.get(b.key, { type: 'json' })))
        const students = (allUsers.filter(Boolean) as any[]).filter((u) => u.role === 'student')
        for (const student of students) {
          const mentors = Array.isArray(student.assignedMentors) ? [...student.assignedMentors] : []
          if (!mentors.includes(email)) {
            mentors.push(email)
            await userStore.setJSON(emailToKey(student.email), { ...student, assignedMentors: mentors })
          }
        }
      }

      return withCors(json({ user }))
    } catch (err) {
      console.error('POST /api/users', err)
      return withCors(json({ error: 'Server error' }, 500))
    }
  }

  // PUT — update user (admin only)
  if (method === 'PUT') {
    if (session.role !== 'admin') return withCors(json({ error: 'Forbidden' }, 403))
    try {
      const body = await request.json() as any
      const { email, expectedLastModified, ...rest } = body
      const updates: any = { ...rest }
      if ('name' in updates) updates.name = normalizeName(updates.name)
      if (!email) return withCors(json({ error: 'email required' }, 400))
      const userStore = getStore('litwits-users')
      const existing = await userStore.get(emailToKey(email), { type: 'json' }) as any
      if (!existing) return withCors(json({ error: 'User not found' }, 404))

      // Optimistic-concurrency check: clients pass the lastModified value they
      // last observed; if the stored record has moved on, refuse the write so
      // the caller can refetch and re-apply rather than clobber a peer.
      if (
        typeof expectedLastModified === 'number' &&
        typeof existing.lastModified === 'number' &&
        existing.lastModified !== expectedLastModified
      ) {
        return withCors(
          json({ error: 'Conflict — record was modified by another user', user: existing }, 409),
        )
      }

      const updated = { ...existing, ...updates }

      // Migrate old mentorEmail field to assignedMentors if needed
      if (updated.mentorEmail && !Array.isArray(updated.assignedMentors)) {
        updated.assignedMentors = updated.mentorEmail ? [updated.mentorEmail] : []
      }
      delete updated.mentorEmail

      // If a student's name changed, rekey the AR workbook's studentSessions
      // index from the old name to the new one so their attended-sessions
      // count and AR row stay attached to the same identity. Without this,
      // a rename would silently zero out attendance.
      const oldName = existing.name
      const newName = updated.name
      const isRename =
        updated.role === 'student' &&
        typeof oldName === 'string' &&
        typeof newName === 'string' &&
        oldName.trim() &&
        newName.trim() &&
        oldName.trim().toLowerCase() !== newName.trim().toLowerCase()
      if (isRename) {
        try {
          const arStore = getStore({ name: 'litwits-arsr', consistency: 'strong' })
          const wb = (await arStore.get('workbook:ar', { type: 'json' })) as any
          if (wb && wb.studentSessions && typeof wb.studentSessions === 'object') {
            const sessions: Record<string, string[]> = wb.studentSessions
            const fromKey = oldName.trim().toLowerCase()
            const collected = new Set<string>(sessions[oldName] || [])
            for (const k of Object.keys(sessions)) {
              if (k.trim().toLowerCase() === fromKey) {
                for (const d of sessions[k] || []) collected.add(d)
                if (k !== newName) delete sessions[k]
              }
            }
            sessions[newName] = Array.from(
              new Set([...(sessions[newName] || []), ...collected]),
            )
            wb.studentSessions = sessions
            // Also update every AR sheet row whose Name cell still carries
            // the old name, so the server-side recompute can match the new
            // studentSessions key. Email cells stay untouched — they're the
            // canonical match key for ar-enrich.
            if (Array.isArray(wb.sheets)) {
              const oldKey = oldName
                .toLowerCase()
                .replace(/\s+/g, ' ')
                .replace(/[^a-z0-9 ]/g, '')
                .trim()
              for (const sh of wb.sheets) {
                if (!Array.isArray(sh.rows)) continue
                for (let i = 0; i < sh.rows.length; i++) {
                  const r = sh.rows[i]
                  const txt = String(r['Name'] || r['Student'] || '')
                    .replace(/<br\s*\/?\s*>/gi, '\n')
                    .replace(/<[^>]+>/g, '')
                    .trim()
                  const k = txt
                    .toLowerCase()
                    .replace(/\s+/g, ' ')
                    .replace(/[^a-z0-9 ]/g, '')
                    .trim()
                  if (k && k === oldKey) {
                    const escaped = newName
                      .replace(/&/g, '&amp;')
                      .replace(/</g, '&lt;')
                      .replace(/>/g, '&gt;')
                    r['Name'] = `<p>${escaped}</p>`
                  }
                }
              }
            }
            wb.updatedAt = Date.now()
            await arStore.setJSON('workbook:ar', wb)
          }
        } catch (err) {
          console.error('rename studentSessions migration failed', err)
        }
      }

      // If package, plan, or start date changed and the caller did not pin a
      // new end date in the same request, recompute validityEnd so the table
      // mirrors the package logic without manual entry.
      const startChanged = 'validityStart' in updates
      const packageChanged =
        'packageSessions' in updates || 'packagePlan' in updates
      if (
        updated.role === 'student' &&
        (startChanged || packageChanged) &&
        !('validityEnd' in updates)
      ) {
        const plan = normalizePackagePlan(updated.packagePlan)
        const sessions = Number(updated.packageSessions) || 0
        const start = updated.validityStart || todayISO()
        const computed = computeValidityEnd(start, plan, sessions)
        if (computed) updated.validityEnd = computed
        if (!updated.validityStart) updated.validityStart = start
      }

      // Attended-sessions edits — admin sets the desired Attended directly,
      // and the server translates that into a manualAdjustment so SR data is
      // never overwritten. attendedSessions and manualAdjustment are siblings:
      // either may be passed; attendedSessions wins if both are present.
      let attendedAuditPayload:
        | { oldAttended: number; newAttended: number; oldAdjustment: number; newAdjustment: number; source: 'users-tab' | 'ar-cell' }
        | null = null
      if (
        updated.role === 'student' &&
        ('attendedSessions' in updates || 'manualAdjustment' in updates)
      ) {
        const enrolled = Math.max(
          0,
          Math.floor(Number(updated.packageSessions) || 0),
        )
        const plan = normalizePackagePlan(updated.packagePlan)
        const srCount = await srCountForName(updated.name || existing.name || '')
        const oldAdjustment = Number.isFinite(existing.manualAdjustment)
          ? Number(existing.manualAdjustment)
          : 0
        const oldAttended = Math.max(0, srCount + oldAdjustment)
        let newAdjustment = oldAdjustment
        let newAttended = oldAttended
        if ('attendedSessions' in updates) {
          newAttended = Math.max(
            0,
            Math.floor(Number(updates.attendedSessions) || 0),
          )
          const err = validateAttended(newAttended, enrolled, plan)
          if (err) return withCors(json({ error: err }, 400))
          newAdjustment = newAttended - srCount
        } else {
          newAdjustment = Math.floor(Number(updates.manualAdjustment) || 0)
          newAttended = Math.max(0, srCount + newAdjustment)
          const err = validateAttended(newAttended, enrolled, plan)
          if (err) return withCors(json({ error: err }, 400))
        }
        updated.manualAdjustment = newAdjustment
        // Strip the surface field so we never persist it on the record;
        // attendedSessions is always a derived value.
        delete (updated as any).attendedSessions
        const source =
          (updates as any).__source === 'ar-cell' ? 'ar-cell' : 'users-tab'
        delete (updated as any).__source
        attendedAuditPayload = {
          oldAttended,
          newAttended,
          oldAdjustment,
          newAdjustment,
          source,
        }
      }

      updated.lastModified = Date.now()

      // If package or session type changed for a student, re-enrich AR so the
      // NO. OF SESSION cell and target sheet stay in sync.
      const arRelevantChange =
        updated.role === 'student' &&
        ('packageSessions' in updates || 'sessionType' in updates || 'packagePlan' in updates)

      await userStore.setJSON(emailToKey(email), updated)

      if (attendedAuditPayload) {
        await writeAttendedAudit({
          userEmail: updated.email,
          userName: updated.name,
          editorEmail: session.email || '',
          editorName: session.name || '',
          ...attendedAuditPayload,
        })
      }

      if (arRelevantChange) {
        const validity = updated.validityEnd
          ? `${updated.validityStart || ''} → ${updated.validityEnd}`
          : ''
        enrichArForUser({
          email: updated.email,
          name: updated.name,
          validity,
          packageSessions: Number(updated.packageSessions) || 0,
          sessionType: updated.sessionType || '',
        }).catch((err) => console.error('AR enrichment (update) failed', err))
      }

      return withCors(json({ user: updated }))
    } catch (err) {
      console.error('PUT /api/users', err)
      return withCors(json({ error: 'Server error' }, 500))
    }
  }

  // DELETE — remove user (admin only)
  if (method === 'DELETE') {
    if (session.role !== 'admin') return withCors(json({ error: 'Forbidden' }, 403))
    try {
      const url = new URL(request.url)
      const email = url.searchParams.get('email')
      if (!email) return withCors(json({ error: 'email query param required' }, 400))
      const userStore = getStore('litwits-users')
      await userStore.delete(emailToKey(email))
      return withCors(json({ success: true }))
    } catch (err) {
      console.error('DELETE /api/users', err)
      return withCors(json({ error: 'Server error' }, 500))
    }
  }

  return withCors(json({ error: 'Method not allowed' }, 405))
}
