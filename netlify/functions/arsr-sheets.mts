import { getStore } from '@netlify/blobs'
import { writeAttendedAudit, validateAttended } from './users.mts'

export const config = { path: '/api/arsr-sheets' }

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }
}

function withCors(response: Response) {
  const headers = new Headers(response.headers)
  Object.entries(corsHeaders()).forEach(([k, v]) => headers.set(k, v))
  return new Response(response.body, { status: response.status, headers })
}

async function getSession(request: Request) {
  const auth = request.headers.get('Authorization')
  if (!auth?.startsWith('Bearer ')) return null
  const token = auth.slice(7)
  try {
    const store = getStore('litwits-sessions')
    const session = (await store.get(token, { type: 'json' })) as any
    if (!session || session.exp < Date.now()) return null
    return session
  } catch {
    return null
  }
}

type Section = 'sr' | 'ar'

interface Sheet {
  id: string
  name: string
  columns: string[]
  rows: Record<string, string>[]
  createdAt: number
  updatedAt: number
}

interface Workbook {
  section: Section
  sheets: Sheet[]
  activeSheetId: string | null
  errors: ErrorEntry[]
  studentSessions: Record<string, string[]>
  studentUserMap?: Record<string, string>
  updatedAt: number
}

interface ErrorEntry {
  id: string
  type: 'unmatched' | 'duplicate' | 'invalid'
  message: string
  context?: any
  createdAt: number
  resolved?: boolean
}

const SR_DEFAULT_COLUMNS = ['Date', 'Session', 'Mentor', 'Topic', 'Attendance']
const AR_DEFAULT_COLUMNS = [
  'Name',
  'Documents',
  'School Board',
  'GMB Review',
  'Remarks',
  'Parent Name',
  'NO. OF SESSION',
  'Validity',
]
const AR_LEGACY_COLUMNS = ['Email', 'Enrolled Sessions', 'Attended Sessions', 'Remaining Sessions']
const AR_SHEET_NAMES = ['Group', 'Individual', 'Renewals']
const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function emailToKey(email: string): string {
  return email.toLowerCase().replace(/[^a-z0-9]/g, '_')
}

function normalizeStudentKey(raw: string): string {
  return (raw || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9 ]/g, '')
    .trim()
}

// Builds a name → user record index for the recompute path so AR rows can
// pick up each student's manualAdjustment in O(1) without re-scanning the
// users blob list per row.
async function loadUserAdjustmentIndex(): Promise<{
  byName: Map<string, { email: string; name: string; manualAdjustment: number; packageSessions: number; packagePlan: string }>
  byEmail: Map<string, { email: string; name: string; manualAdjustment: number; packageSessions: number; packagePlan: string }>
}> {
  const byName = new Map<string, any>()
  const byEmail = new Map<string, any>()
  try {
    const store = getStore('litwits-users')
    const { blobs } = await store.list()
    const users = await Promise.all(blobs.map((b) => store.get(b.key, { type: 'json' })))
    for (const u of users.filter(Boolean) as any[]) {
      if (u.role !== 'student') continue
      const entry = {
        email: String(u.email || ''),
        name: String(u.name || ''),
        manualAdjustment: Number.isFinite(u.manualAdjustment) ? Number(u.manualAdjustment) : 0,
        packageSessions: Number.isFinite(u.packageSessions) ? Number(u.packageSessions) : 0,
        packagePlan: u.packagePlan === 'signature' || u.packagePlan === 'platinum' ? u.packagePlan : 'numeric',
      }
      const k = normalizeStudentKey(entry.name)
      if (k) byName.set(k, entry)
      if (entry.email) byEmail.set(entry.email.toLowerCase(), entry)
    }
  } catch (err) {
    console.error('loadUserAdjustmentIndex', err)
  }
  return { byName, byEmail }
}

// Recompute "NO. OF SESSION" (attended / enrolled) for every AR row. Attended
// is derived from SR's studentSessions index PLUS each user's
// manualAdjustment, so SR data is never overwritten by admin edits — every
// adjustment is layered on top. Enrolled is preserved from whatever the row
// already carries (seeded by the user's package on creation).
function recomputeAllArRows(
  wb: Workbook,
  adjustments?: Map<string, { manualAdjustment: number }>,
): Workbook {
  if (wb.section !== 'ar') return wb
  const sessions = wb.studentSessions || {}
  const sessionsByKey = new Map<string, Set<string>>()
  for (const [name, dates] of Object.entries(sessions)) {
    const k = normalizeStudentKey(name)
    if (!k) continue
    const set = sessionsByKey.get(k) || new Set<string>()
    for (const d of dates || []) set.add(d)
    sessionsByKey.set(k, set)
  }
  const sheets = wb.sheets.map((s) => {
    const cols = s.columns
    const monthCols = cols.filter((c) => /^[A-Za-z]+ \d{4}$/.test(c))
    const rows = s.rows.map((r) => {
      const nameTxt = htmlToText(r['Name'] || r['Student'] || '')
      if (!nameTxt) return r
      const key = normalizeStudentKey(nameTxt)
      const set = new Set<string>(sessionsByKey.get(key) || [])
      for (const c of monthCols) {
        const m = c.match(/^([A-Za-z]+) (\d{4})$/)
        if (!m) continue
        const monthIdx = MONTH_LABELS.indexOf(m[1])
        if (monthIdx < 0) continue
        const year = m[2]
        const days = htmlToText(r[c] || '')
          .split(/[,\s]+/)
          .map((x) => x.trim())
          .filter((x) => /^\d+$/.test(x))
        for (const d of days) {
          const padDay = d.padStart(2, '0')
          const padMonth = String(monthIdx + 1).padStart(2, '0')
          set.add(`${year}-${padMonth}-${padDay}`)
        }
      }
      const srCount = set.size
      const adj = adjustments?.get(key)?.manualAdjustment || 0
      const attended = Math.max(0, srCount + adj)
      const current = htmlToText(r['NO. OF SESSION'] || '')
      const m = current.match(/^(\d+)\s*\/\s*(\d+)$/)
      const enrolled = m ? parseInt(m[2], 10) : 0
      const next = `${attended} / ${enrolled}`
      if (current === next) return r
      return { ...r, 'NO. OF SESSION': textToHtml(next) }
    })
    return { ...s, rows }
  })
  return { ...wb, sheets }
}

function htmlToText(html: string): string {
  if (!html) return ''
  return html
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/p>\s*<p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .trim()
}

function textToHtml(text: string): string {
  const escaped = (text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  return `<p>${escaped.replace(/\n/g, '<br/>')}</p>`
}

function defaultRow(columns: string[]): Record<string, string> {
  const row: Record<string, string> = {}
  for (const c of columns) row[c] = ''
  return row
}

function emptySheet(name: string, columns: string[]): Sheet {
  const id = `sheet_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  return {
    id,
    name,
    columns,
    rows: Array.from({ length: 30 }, () => defaultRow(columns)),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}

function defaultWorkbook(section: Section): Workbook {
  if (section === 'ar') {
    const sheets = AR_SHEET_NAMES.map((n) => emptySheet(n, AR_DEFAULT_COLUMNS))
    return {
      section,
      sheets,
      activeSheetId: sheets[0].id,
      errors: [],
      studentSessions: {},
      updatedAt: Date.now(),
    }
  }
  const sheet = emptySheet('Sheet 1', SR_DEFAULT_COLUMNS)
  return {
    section,
    sheets: [sheet],
    activeSheetId: sheet.id,
    errors: [],
    studentSessions: {},
    updatedAt: Date.now(),
  }
}

function migrateArWorkbook(wb: Workbook): { workbook: Workbook; changed: boolean } {
  if (wb.section !== 'ar') return { workbook: wb, changed: false }
  let changed = false
  let sheets = wb.sheets.slice()
  const existingNames = new Set(sheets.map((s) => s.name.toLowerCase()))
  for (const target of AR_SHEET_NAMES) {
    if (!existingNames.has(target.toLowerCase())) {
      sheets.push(emptySheet(target, AR_DEFAULT_COLUMNS))
      changed = true
    }
  }
  sheets = sheets.map((s) => {
    const cols = s.columns.slice()
    let colsChanged = false
    // Insert new defaults at canonical positions (after Parent Name).
    for (const c of AR_DEFAULT_COLUMNS) {
      if (!cols.includes(c)) {
        cols.push(c)
        colsChanged = true
      }
    }
    // Drop legacy columns from the visible structure but preserve any data
    // already in the rows so we can fold it into NO. OF SESSION.
    const visibleCols = cols.filter((c) => !AR_LEGACY_COLUMNS.includes(c))
    if (visibleCols.length !== cols.length) colsChanged = true
    if (!colsChanged) return s
    changed = true
    const rows = s.rows.map((r) => {
      const next: Record<string, string> = {}
      for (const c of visibleCols) next[c] = r[c] || ''
      // Preserve email key in row data for matching, even though it is no
      // longer a visible column.
      if (r['Email']) next['Email'] = r['Email']
      // Migrate legacy Enrolled / Attended into NO. OF SESSION.
      if (!htmlToText(next['NO. OF SESSION'] || '')) {
        const enrolled = parseInt(htmlToText(r['Enrolled Sessions'] || ''), 10)
        const attended = parseInt(htmlToText(r['Attended Sessions'] || ''), 10)
        if (Number.isFinite(enrolled)) {
          const a = Number.isFinite(attended) ? attended : 0
          next['NO. OF SESSION'] = textToHtml(`${a} / ${enrolled}`)
        }
      }
      return next
    })
    return { ...s, columns: visibleCols, rows }
  })
  if (!changed) return { workbook: wb, changed: false }
  return {
    workbook: {
      ...wb,
      sheets,
      activeSheetId: wb.activeSheetId || sheets[0].id,
    },
    changed: true,
  }
}

function workbookKey(section: Section) {
  return `workbook:${section}`
}

// Walks the incoming AR sheets, looks at every NO. OF SESSION cell where the
// "attended" half changed vs. the prior persisted workbook, finds the matching
// user (by Name → Email cache), and updates that user's manualAdjustment.
// Validation is enforced server-side: negative values are clamped to zero,
// and overshoot beyond Enrolled is rejected for numeric packages (Signature
// and Platinum are unlimited). Audit entries are written for every accepted
// change.
async function propagateArCellEdits(params: {
  existing: Workbook
  merged: Workbook
  userIndex: Awaited<ReturnType<typeof loadUserAdjustmentIndex>>
  editorEmail: string
  editorName: string
}) {
  const { existing, merged, userIndex, editorEmail, editorName } = params
  const userStore = getStore('litwits-users')
  // Index existing rows by sheet id + email/name so we can compute "before"
  // for each "after" row. AR rows aren't keyed, but Email is preserved on the
  // row data for matching, and otherwise we fall back to normalized Name.
  const existingRowKey = (
    sheetId: string,
    rowIndex: number,
    row: Record<string, string>,
  ): string => {
    const email = htmlToText(row['Email'] || '').toLowerCase().trim()
    const name = normalizeStudentKey(htmlToText(row['Name'] || row['Student'] || ''))
    return email ? `e:${email}` : name ? `n:${sheetId}:${name}` : `i:${sheetId}:${rowIndex}`
  }
  const beforeAttended = new Map<string, number>()
  for (const sh of existing.sheets) {
    sh.rows.forEach((r, ri) => {
      const txt = htmlToText(r['NO. OF SESSION'] || '')
      const m = txt.match(/^(\d+)\s*\/\s*(\d+)$/)
      if (!m) return
      beforeAttended.set(existingRowKey(sh.id, ri, r), parseInt(m[1], 10))
    })
  }
  const seen = new Set<string>()
  for (const sh of merged.sheets) {
    for (let ri = 0; ri < sh.rows.length; ri++) {
      const r = sh.rows[ri]
      const cellText = htmlToText(r['NO. OF SESSION'] || '')
      const m = cellText.match(/^(\d+)\s*\/\s*(\d+)$/)
      if (!m) continue
      const newAttended = parseInt(m[1], 10)
      const enrolled = parseInt(m[2], 10) || 0
      const key = existingRowKey(sh.id, ri, r)
      if (seen.has(key)) continue
      seen.add(key)
      const prior = beforeAttended.get(key)
      if (prior === undefined || prior === newAttended) continue
      // Locate the user record. Prefer Email cell, fall back to Name.
      const email = htmlToText(r['Email'] || '').toLowerCase().trim()
      const name = htmlToText(r['Name'] || r['Student'] || '')
      const nameKey = normalizeStudentKey(name)
      let user = email ? userIndex.byEmail.get(email) : undefined
      if (!user && nameKey) user = userIndex.byName.get(nameKey)
      if (!user) continue
      const plan = (user.packagePlan as 'numeric' | 'signature' | 'platinum') || 'numeric'
      const err = validateAttended(newAttended, user.packageSessions || enrolled, plan)
      if (err) {
        // Restore prior cell value so the bad input doesn't stick.
        sh.rows[ri] = { ...r, 'NO. OF SESSION': textToHtml(`${prior} / ${enrolled}`) }
        continue
      }
      // SR count = newAttended - existing manualAdjustment + correction.
      // Compute SR count from the merged studentSessions index for this user.
      const sessions = merged.studentSessions || {}
      const lookup = (n: string): number => {
        const direct = sessions[n]
        if (Array.isArray(direct)) return new Set(direct).size
        const k = n.trim().toLowerCase()
        for (const x of Object.keys(sessions)) {
          if (x.trim().toLowerCase() === k) return new Set(sessions[x] || []).size
        }
        return 0
      }
      const srCount = lookup(user.name)
      const oldAdjustment = user.manualAdjustment || 0
      const newAdjustment = newAttended - srCount
      const oldAttended = Math.max(0, srCount + oldAdjustment)
      try {
        const fresh = (await userStore.get(emailToKey(user.email), { type: 'json' })) as any
        if (!fresh) continue
        fresh.manualAdjustment = newAdjustment
        fresh.lastModified = Date.now()
        await userStore.setJSON(emailToKey(user.email), fresh)
        await writeAttendedAudit({
          userEmail: user.email,
          userName: user.name,
          editorEmail,
          editorName,
          oldAttended,
          newAttended,
          oldAdjustment,
          newAdjustment,
          source: 'ar-cell',
        })
        // Reflect the new adjustment in the in-memory index so the subsequent
        // recompute pass uses the correct value.
        userIndex.byEmail.set(user.email.toLowerCase(), {
          ...user,
          manualAdjustment: newAdjustment,
        })
        if (nameKey) {
          userIndex.byName.set(nameKey, { ...user, manualAdjustment: newAdjustment })
        }
      } catch (err) {
        console.error('propagateArCellEdits write failed', err)
      }
    }
  }
}

export default async (request: Request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() })
  }

  const session = await getSession(request)
  if (!session) return withCors(json({ error: 'Unauthorized' }, 401))
  if (session.role !== 'admin') return withCors(json({ error: 'Forbidden' }, 403))

  const store = getStore({ name: 'litwits-arsr', consistency: 'strong' })
  const url = new URL(request.url)
  const section = (url.searchParams.get('section') as Section) || 'sr'
  if (section !== 'sr' && section !== 'ar') {
    return withCors(json({ error: 'Invalid section' }, 400))
  }

  const method = request.method.toUpperCase()

  if (method === 'GET') {
    const existing = (await store.get(workbookKey(section), { type: 'json' })) as Workbook | null
    let workbook = existing || defaultWorkbook(section)
    if (section === 'ar') {
      const migrated = migrateArWorkbook(workbook)
      workbook = migrated.workbook
      // Always derive NO. OF SESSION attended count from studentSessions +
      // each user's manualAdjustment on read so any drift between the
      // persisted cell and the dataset of truth is reconciled.
      const { byName } = await loadUserAdjustmentIndex()
      workbook = recomputeAllArRows(workbook, byName)
      if (!existing || migrated.changed) {
        await store.setJSON(workbookKey(section), workbook)
      }
    } else if (!existing) {
      await store.setJSON(workbookKey(section), workbook)
    }
    return withCors(json({ workbook }))
  }

  if (method === 'PUT') {
    try {
      const body = (await request.json()) as Partial<Workbook>
      const existing =
        ((await store.get(workbookKey(section), { type: 'json' })) as Workbook | null) ||
        defaultWorkbook(section)
      // Merge studentSessions instead of replacing — the AR & SR workbooks
      // share a single attendance index, so a stale PUT from one tab must
      // never erase dates recorded by another. Each name's date list is
      // unioned with what the server already has.
      const incomingSessions =
        body.studentSessions && typeof body.studentSessions === 'object'
          ? (body.studentSessions as Record<string, string[]>)
          : null
      const mergedSessions: Record<string, string[]> = { ...(existing.studentSessions || {}) }
      if (incomingSessions) {
        for (const [name, dates] of Object.entries(incomingSessions)) {
          const set = new Set<string>(mergedSessions[name] || [])
          for (const d of dates || []) if (d) set.add(d)
          mergedSessions[name] = Array.from(set)
        }
      }
      const incomingUserMap =
        body.studentUserMap && typeof body.studentUserMap === 'object'
          ? (body.studentUserMap as Record<string, string>)
          : null
      const mergedUserMap: Record<string, string> = { ...(existing.studentUserMap || {}) }
      if (incomingUserMap) {
        for (const [name, userId] of Object.entries(incomingUserMap)) {
          if (userId) mergedUserMap[name] = userId
        }
      }
      let merged: Workbook = {
        ...existing,
        ...body,
        section,
        sheets: Array.isArray(body.sheets) ? (body.sheets as Sheet[]) : existing.sheets,
        activeSheetId:
          body.activeSheetId !== undefined ? body.activeSheetId : existing.activeSheetId,
        errors: Array.isArray(body.errors) ? (body.errors as ErrorEntry[]) : existing.errors,
        studentSessions: mergedSessions,
        studentUserMap: mergedUserMap,
        updatedAt: Date.now(),
      }
      // Detect NO. OF SESSION edits on AR rows: when the admin types a new
      // attended count into an AR cell, find the matching user, write the
      // diff to manualAdjustment, and audit. SR data is never overwritten;
      // only the user's adjustment moves.
      if (section === 'ar') {
        const userIndex = await loadUserAdjustmentIndex()
        await propagateArCellEdits({
          existing,
          merged,
          userIndex,
          editorEmail: session.email || '',
          editorName: session.name || '',
        })
        // Reload the index after potential adjustment writes so the recompute
        // uses the freshest values.
        const fresh = await loadUserAdjustmentIndex()
        merged = recomputeAllArRows(merged, fresh.byName)
      }
      await store.setJSON(workbookKey(section), merged)
      return withCors(json({ success: true, workbook: merged }))
    } catch (err) {
      console.error('PUT /api/arsr-sheets', err)
      return withCors(json({ error: 'Server error' }, 500))
    }
  }

  return withCors(json({ error: 'Method not allowed' }, 405))
}
