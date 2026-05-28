import { getStore } from '@netlify/blobs'
import { loadAttendanceRoster, findRosterMatch } from './google-sheets-fetch.mts'

export const config = { path: '/api/ar-enrich' }

type Section = 'sr' | 'ar'

interface Sheet {
  id: string
  name: string
  columns: string[]
  rows: Record<string, string>[]
  createdAt: number
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

interface Workbook {
  section: Section
  sheets: Sheet[]
  activeSheetId: string | null
  errors: ErrorEntry[]
  studentSessions: Record<string, string[]>
  studentUserMap?: Record<string, string>
  updatedAt: number
}

interface PendingEntry {
  email: string
  name: string
  attempts: number
  lastAttempt: number
  reason: string
}

const AR_SHEET_NAMES = ['Group', 'Individual', 'Renewals'] as const
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

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }
}

function withCors(response: Response) {
  const headers = new Headers(response.headers)
  Object.entries(corsHeaders()).forEach(([k, v]) => headers.set(k, v))
  return new Response(response.body, { status: response.status, headers })
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
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

function emptyRow(columns: string[]): Record<string, string> {
  const r: Record<string, string> = {}
  for (const c of columns) r[c] = ''
  return r
}

function emptySheet(name: string, columns: string[]): Sheet {
  const id = `sheet_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  return {
    id,
    name,
    columns,
    rows: Array.from({ length: 30 }, () => emptyRow(columns)),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}

function ensureArWorkbook(existing: Workbook | null): Workbook {
  if (existing && Array.isArray(existing.sheets) && existing.sheets.length > 0) {
    const haveNames = new Set(existing.sheets.map((s) => s.name.toLowerCase()))
    const sheets = [...existing.sheets]
    for (const target of AR_SHEET_NAMES) {
      if (!haveNames.has(target.toLowerCase())) {
        sheets.push(emptySheet(target, AR_DEFAULT_COLUMNS))
      }
    }
    for (const s of sheets) {
      const cols = s.columns.slice()
      for (const c of AR_DEFAULT_COLUMNS) {
        if (!cols.includes(c)) cols.push(c)
      }
      const visibleCols = cols.filter((c) => !AR_LEGACY_COLUMNS.includes(c))
      s.columns = visibleCols
      s.rows = s.rows.map((r) => {
        const next: Record<string, string> = {}
        for (const c of visibleCols) next[c] = r[c] || ''
        if (r['Email']) next['Email'] = r['Email']
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
    }
    return {
      ...existing,
      sheets,
      activeSheetId: existing.activeSheetId || sheets[0].id,
    }
  }
  const sheets = AR_SHEET_NAMES.map((n) => emptySheet(n, AR_DEFAULT_COLUMNS))
  return {
    section: 'ar',
    sheets,
    activeSheetId: sheets[0].id,
    errors: [],
    studentSessions: {},
    updatedAt: Date.now(),
  }
}

function findExistingRow(
  sheets: Sheet[],
  email: string,
  name: string,
): { sheetIndex: number; rowIndex: number } | null {
  const emailNorm = email.trim().toLowerCase()
  const nameNorm = name
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9 ]/g, '')
    .trim()
  for (let si = 0; si < sheets.length; si++) {
    const s = sheets[si]
    for (let ri = 0; ri < s.rows.length; ri++) {
      const r = s.rows[ri]
      const rEmail = htmlToText(r['Email'] || '').toLowerCase()
      const rName = htmlToText(r['Name'] || r['Student'] || '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .replace(/[^a-z0-9 ]/g, '')
        .trim()
      if (emailNorm && rEmail && rEmail === emailNorm) return { sheetIndex: si, rowIndex: ri }
      if (nameNorm && rName && rName === nameNorm) return { sheetIndex: si, rowIndex: ri }
    }
  }
  return null
}

function findEmptyRowIndex(sheet: Sheet): number {
  for (let i = 0; i < sheet.rows.length; i++) {
    const r = sheet.rows[i]
    const hasContent = (r['Name'] && htmlToText(r['Name'])) || (r['Email'] && htmlToText(r['Email']))
    if (!hasContent) return i
  }
  sheet.rows.push(emptyRow(sheet.columns))
  return sheet.rows.length - 1
}

export async function enrichArForUser(input: {
  email: string
  name: string
  validity?: string
  packageSessions?: number
  sessionType?: string
}): Promise<{ ok: boolean; matched: boolean; sheet?: string; reason?: string }> {
  const arStore = getStore({ name: 'litwits-arsr', consistency: 'strong' })
  const pendingStore = getStore({ name: 'litwits-arsr-pending', consistency: 'strong' })
  const existing = (await arStore.get('workbook:ar', { type: 'json' })) as Workbook | null
  const wb = ensureArWorkbook(existing)

  const email = (input.email || '').trim()
  const name = (input.name || '').trim()
  const validity = (input.validity || '').trim()
  const packageSessions = Number.isFinite(input.packageSessions as number)
    ? Math.max(0, Math.floor(input.packageSessions as number))
    : 0
  const requestedType = (input.sessionType || '').trim()
  if (!email && !name) return { ok: false, matched: false, reason: 'no-identifier' }

  const roster = await loadAttendanceRoster(false)
  const match = roster.ok ? findRosterMatch(roster.rows, email, name) : null

  // Decide target sheet: explicit sessionType > matched roster sheet > existing row's sheet > Individual default
  const explicitTarget = (AR_SHEET_NAMES as readonly string[]).find(
    (s) => s.toLowerCase() === requestedType.toLowerCase(),
  )
  const targetSheetName = explicitTarget || match?.sheet || 'Individual'
  let targetSheetIndex = wb.sheets.findIndex(
    (s) => s.name.toLowerCase() === targetSheetName.toLowerCase(),
  )
  if (targetSheetIndex < 0) {
    const newSheet = emptySheet(targetSheetName, AR_DEFAULT_COLUMNS)
    wb.sheets.push(newSheet)
    targetSheetIndex = wb.sheets.length - 1
  }

  const existingLoc = findExistingRow(wb.sheets, email, name)
  let sheetIndex: number
  let rowIndex: number
  // When the admin (or user record) explicitly requests a sessionType (Group
  // / Individual / Renewals) and the existing row sits on a different sheet,
  // MOVE it — preserving every cell — rather than leaving the row stranded.
  // This is the integration point that makes Manage Users → AR sheet
  // membership a single connected system instead of two parallel views.
  if (existingLoc && explicitTarget && existingLoc.sheetIndex !== targetSheetIndex) {
    const fromSheet = wb.sheets[existingLoc.sheetIndex]
    const movingRow = { ...fromSheet.rows[existingLoc.rowIndex] }
    // Replace the vacated row with an empty placeholder so column widths /
    // sheet length stay consistent — append-only, no overwrite.
    const newFromRows = fromSheet.rows.slice()
    newFromRows[existingLoc.rowIndex] = emptyRow(fromSheet.columns)
    wb.sheets[existingLoc.sheetIndex] = {
      ...fromSheet,
      rows: newFromRows,
      updatedAt: Date.now(),
    }
    const targetSheet = wb.sheets[targetSheetIndex]
    const targetCols = targetSheet.columns
    // Carry every column the source row had — including month-day cells —
    // so attendance history travels with the student.
    const carried: Record<string, string> = {}
    for (const c of targetCols) carried[c] = movingRow[c] || ''
    for (const k of Object.keys(movingRow)) {
      if (!(k in carried)) carried[k] = movingRow[k]
    }
    const insertAt = findEmptyRowIndex(targetSheet)
    const newTargetRows = targetSheet.rows.slice()
    newTargetRows[insertAt] = carried
    wb.sheets[targetSheetIndex] = {
      ...targetSheet,
      rows: newTargetRows,
      updatedAt: Date.now(),
    }
    sheetIndex = targetSheetIndex
    rowIndex = insertAt
  } else if (existingLoc) {
    sheetIndex = existingLoc.sheetIndex
    rowIndex = existingLoc.rowIndex
  } else {
    sheetIndex = targetSheetIndex
    rowIndex = findEmptyRowIndex(wb.sheets[sheetIndex])
  }

  const sheet = wb.sheets[sheetIndex]
  const row = { ...sheet.rows[rowIndex] }
  if (!htmlToText(row['Name'] || '')) row['Name'] = textToHtml(name)
  // Email is stored on the row for matching but not rendered as a column.
  if (!htmlToText(row['Email'] || '') && email) row['Email'] = textToHtml(email)
  if (validity && !htmlToText(row['Validity'] || '')) row['Validity'] = textToHtml(validity)
  if (match) {
    if (match.schoolBoard) row['School Board'] = textToHtml(match.schoolBoard)
    if (match.parentName) row['Parent Name'] = textToHtml(match.parentName)
    if (match.registrationData) {
      for (const [key, val] of Object.entries(match.registrationData)) {
        if (!val) continue
        const colMatch = sheet.columns.find((c) => c.toLowerCase() === key.toLowerCase())
        if (colMatch && !htmlToText(row[colMatch] || '')) {
          row[colMatch] = textToHtml(val)
        }
      }
    }
  }
  // Seed NO. OF SESSION as "0 / packageSessions" when the cell is empty and a
  // package size was supplied. SR uploads update the attended count later.
  if (packageSessions > 0) {
    const current = htmlToText(row['NO. OF SESSION'] || '')
    if (!current) {
      row['NO. OF SESSION'] = textToHtml(`0 / ${packageSessions}`)
    } else {
      // Update enrolled if package changed but keep attended.
      const m = current.match(/^(\d+)\s*\/\s*(\d+)$/)
      const attended = m ? parseInt(m[1], 10) : 0
      row['NO. OF SESSION'] = textToHtml(`${attended} / ${packageSessions}`)
    }
  }
  const updatedRows = sheet.rows.slice()
  updatedRows[rowIndex] = row
  const updatedSheet: Sheet = { ...sheet, rows: updatedRows, updatedAt: Date.now() }
  const sheetsNext = wb.sheets.slice()
  sheetsNext[sheetIndex] = updatedSheet
  const wbNext: Workbook = { ...wb, sheets: sheetsNext, updatedAt: Date.now() }
  await arStore.setJSON('workbook:ar', wbNext)

  const pendingKey = (email || name).toLowerCase().replace(/[^a-z0-9]/g, '_')
  if (!match) {
    const reason = roster.ok ? 'no-roster-match' : roster.reason || 'fetch-failed'
    const prev = (await pendingStore.get(pendingKey, { type: 'json' })) as PendingEntry | null
    const entry: PendingEntry = {
      email,
      name,
      attempts: (prev?.attempts || 0) + 1,
      lastAttempt: Date.now(),
      reason,
    }
    await pendingStore.setJSON(pendingKey, entry)
    return { ok: true, matched: false, sheet: targetSheetName, reason }
  }
  await pendingStore.delete(pendingKey).catch(() => {})
  return { ok: true, matched: true, sheet: match.sheet }
}

export default async (request: Request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() })
  }
  const session = await getSession(request)
  if (!session) return withCors(json({ error: 'Unauthorized' }, 401))
  if (session.role !== 'admin') return withCors(json({ error: 'Forbidden' }, 403))

  if (request.method === 'GET') {
    // List pending entries
    const pendingStore = getStore({ name: 'litwits-arsr-pending', consistency: 'strong' })
    const { blobs } = await pendingStore.list()
    const entries = await Promise.all(
      blobs.map((b) => pendingStore.get(b.key, { type: 'json' })),
    )
    return withCors(json({ pending: entries.filter(Boolean) }))
  }

  if (request.method === 'POST') {
    try {
      const body = (await request.json()) as {
        email?: string
        name?: string
        validity?: string
        packageSessions?: number
        sessionType?: string
        retryAll?: boolean
      }
      if (body.retryAll) {
        const pendingStore = getStore({ name: 'litwits-arsr-pending', consistency: 'strong' })
        const { blobs } = await pendingStore.list()
        const entries = (await Promise.all(
          blobs.map((b) => pendingStore.get(b.key, { type: 'json' })),
        )) as (PendingEntry | null)[]
        const results: any[] = []
        for (const e of entries) {
          if (!e) continue
          const r = await enrichArForUser({ email: e.email, name: e.name })
          results.push({ email: e.email, name: e.name, ...r })
        }
        return withCors(json({ ok: true, results }))
      }
      if (!body.email && !body.name) {
        return withCors(json({ error: 'email or name required' }, 400))
      }
      const result = await enrichArForUser({
        email: body.email || '',
        name: body.name || '',
        validity: body.validity,
        packageSessions: body.packageSessions,
        sessionType: body.sessionType,
      })
      return withCors(json(result))
    } catch (err) {
      console.error('POST /api/ar-enrich', err)
      return withCors(json({ error: 'Server error' }, 500))
    }
  }

  return withCors(json({ error: 'Method not allowed' }, 405))
}
