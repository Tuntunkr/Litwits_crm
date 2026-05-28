import { useEffect, useMemo, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { apiFetch } from '@/lib/auth'
import Spreadsheet, { type SheetData } from './Spreadsheet'

type Section = 'sr' | 'ar'

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
  sheets: SheetData[]
  activeSheetId: string | null
  errors: ErrorEntry[]
  studentSessions: Record<string, string[]>
  studentUserMap?: Record<string, string>
  updatedAt: number
}

interface UserLite {
  name: string
  email: string
  role: string
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
const AR_LOCKED_COLUMNS: string[] = []

const MONTH_LABELS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

function monthColumnFor(dateStr: string): { column: string; day: number } | null {
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return null
  const year = parseInt(m[1], 10)
  const month = parseInt(m[2], 10)
  const day = parseInt(m[3], 10)
  if (!month || month < 1 || month > 12) return null
  return { column: `${MONTH_LABELS[month - 1]} ${year}`, day }
}

function htmlToText(html: string): string {
  if (!html) return ''
  const tmp = document.createElement('div')
  tmp.innerHTML = html
  return (tmp.textContent || tmp.innerText || '').trim()
}

function textToHtml(text: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  return `<p>${escaped.replace(/\n/g, '<br/>')}</p>`
}

function emptySheet(name: string, columns: string[]): SheetData {
  const id = `sheet_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  return {
    id,
    name,
    columns,
    rows: Array.from({ length: 30 }, () => Object.fromEntries(columns.map((c) => [c, '']))),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}

function normalizeName(n: string): string {
  return n
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9 ]/g, '')
    .trim()
}

function splitName(normalized: string): { firstName: string; lastName: string } {
  const parts = normalized.split(' ').filter(Boolean)
  if (parts.length === 0) return { firstName: '', lastName: '' }
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') }
}

function nameSimilarity(a: string, b: string): number {
  if (a === b) return 1
  if (!a || !b) return 0
  const maxLen = Math.max(a.length, b.length)
  const matrix: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  )
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      )
    }
  }
  return 1 - matrix[a.length][b.length] / maxLen
}

function parseExcelDate(value: any): string | null {
  if (value == null || value === '') return null
  if (typeof value === 'number' && value > 30000 && value < 100000) {
    const d = new Date(Math.round((value - 25569) * 86400000))
    if (isNaN(d.getTime())) return null
    const y = d.getUTCFullYear()
    const m = String(d.getUTCMonth() + 1).padStart(2, '0')
    const day = String(d.getUTCDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return null
    const y = value.getUTCFullYear()
    const m = String(value.getUTCMonth() + 1).padStart(2, '0')
    const day = String(value.getUTCDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }
  const str = String(value).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const d = new Date(str + 'T00:00:00Z')
    if (isNaN(d.getTime())) return null
    return str
  }
  const slashMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (slashMatch) {
    const [, a, b, y] = slashMatch
    const iso = `${y}-${a.padStart(2, '0')}-${b.padStart(2, '0')}`
    const d = new Date(iso + 'T00:00:00Z')
    if (!isNaN(d.getTime())) return iso
  }
  return null
}

interface ZoomEntry {
  name: string
  durationMinutes: number
  email?: string
  date?: string
}

function parseZoomWorkbook(buf: ArrayBuffer): {
  entries: ZoomEntry[]
  invalidRows: { row: any; reason: string }[]
} {
  const wb = XLSX.read(buf, { type: 'array' })
  const all: ZoomEntry[] = []
  const invalid: { row: any; reason: string }[] = []
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName]
    const rows = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: '' })
    if (rows.length === 0) continue
    const sample = rows[0]
    const keys = Object.keys(sample)
    const nameKey =
      keys.find((k) => /name/i.test(k) && !/email/i.test(k)) ||
      keys.find((k) => /participant|attendee|user/i.test(k))
    const durationKey =
      keys.find((k) => /duration.*\(.*minute/i.test(k)) ||
      keys.find((k) => /duration/i.test(k)) ||
      keys.find((k) => /minutes/i.test(k)) ||
      keys.find((k) => /time.*spent/i.test(k))
    const emailKey = keys.find((k) => /email/i.test(k))
    const dateKey =
      keys.find((k) => /\bdate\b/i.test(k)) ||
      keys.find((k) => /join.*time|start.*time|session.*date/i.test(k))
    if (!nameKey) continue
    for (const row of rows) {
      const rawName = String(row[nameKey] || '').trim()
      if (!rawName) {
        invalid.push({ row, reason: 'Missing name' })
        continue
      }
      let dur = 0
      if (durationKey) {
        const v = row[durationKey]
        if (typeof v === 'number') dur = v
        else if (typeof v === 'string') {
          const m = v.match(/(\d+)/)
          if (m) dur = parseInt(m[1], 10)
        }
      }
      const email = emailKey ? String(row[emailKey] || '').trim() : ''
      const date = dateKey ? parseExcelDate(row[dateKey]) : undefined
      all.push({ name: rawName, durationMinutes: dur, email: email || undefined, date: date || undefined })
    }
  }
  return { entries: all, invalidRows: invalid }
}

interface MatchResult {
  matched: { name: string; source: 'user' | 'sheet'; email?: string; zoomName: string }[]
  unmatched: { name: string }[]
  duplicates: { name: string; count: number }[]
  invalid: { row: any; reason: string }[]
}

function matchAttendees(
  zoom: ZoomEntry[],
  invalidRows: { row: any; reason: string }[],
  users: UserLite[],
  arSheet: SheetData | null,
): MatchResult {
  const counts = new Map<string, number>()
  for (const e of zoom) {
    const k = normalizeName(e.name)
    counts.set(k, (counts.get(k) || 0) + 1)
  }
  const seen = new Set<string>()

  const userByNorm = new Map<string, UserLite>()
  const usersByFirstName = new Map<string, UserLite[]>()
  for (const u of users) {
    const norm = normalizeName(u.name)
    userByNorm.set(norm, u)
    const { firstName } = splitName(norm)
    if (firstName) {
      const list = usersByFirstName.get(firstName) || []
      list.push(u)
      usersByFirstName.set(firstName, list)
    }
  }

  const sheetNamesNorm = new Set<string>()
  if (arSheet) {
    for (const r of arSheet.rows) {
      const txt = htmlToText(r['Name'] || r['Student'] || '')
      if (txt) sheetNamesNorm.add(normalizeName(txt))
    }
  }

  const matched: MatchResult['matched'] = []
  const unmatched: MatchResult['unmatched'] = []
  const duplicates: MatchResult['duplicates'] = []

  for (const e of zoom) {
    const key = normalizeName(e.name)
    if (counts.get(key)! > 1 && !seen.has(key)) {
      duplicates.push({ name: e.name, count: counts.get(key)! })
    }
    if (seen.has(key)) continue
    seen.add(key)

    // Priority 1: Exact full name match (user)
    const exactMatch = userByNorm.get(key)
    if (exactMatch) {
      matched.push({ name: exactMatch.name, source: 'user', email: exactMatch.email, zoomName: e.name })
      continue
    }

    // Priority 2+: First name match with disambiguation
    const { firstName: zoomFirst, lastName: zoomLast } = splitName(key)
    let userMatch: UserLite | null = null
    if (zoomFirst) {
      const candidates = usersByFirstName.get(zoomFirst)
      if (candidates) {
        if (candidates.length === 1) {
          userMatch = candidates[0]
        } else if (candidates.length > 1) {
          if (zoomLast) {
            // Priority 3: Disambiguate by last name
            const lastMatches = candidates.filter((u) => {
              const { lastName } = splitName(normalizeName(u.name))
              return lastName === zoomLast
            })
            if (lastMatches.length === 1) {
              userMatch = lastMatches[0]
            } else {
              // Priority 4: Closest full-name similarity among candidates
              const pool = lastMatches.length > 0 ? lastMatches : candidates
              let best: UserLite | null = null
              let bestScore = 0
              for (const c of pool) {
                const score = nameSimilarity(key, normalizeName(c.name))
                if (score > bestScore) {
                  bestScore = score
                  best = c
                }
              }
              if (best && bestScore > 0.5) userMatch = best
            }
          } else {
            // Only first name provided, multiple users share it — pick closest
            let best: UserLite | null = null
            let bestScore = 0
            for (const c of candidates) {
              const score = nameSimilarity(key, normalizeName(c.name))
              if (score > bestScore) {
                bestScore = score
                best = c
              }
            }
            if (best && bestScore > 0.5) userMatch = best
          }
        }
      }
    }
    if (userMatch) {
      matched.push({ name: userMatch.name, source: 'user', email: userMatch.email, zoomName: e.name })
      continue
    }

    // Fallback: exact AR sheet name match
    if (sheetNamesNorm.has(key)) {
      matched.push({ name: e.name, source: 'sheet', zoomName: e.name })
      continue
    }

    unmatched.push({ name: e.name })
  }

  return { matched, unmatched, duplicates, invalid: invalidRows }
}

interface UploadModalProps {
  open: boolean
  onClose: () => void
  onApply: (params: {
    entries: { name: string; date: string }[]
    matchResult: MatchResult
    stats: { totalParsed: number; filteredOut: number; invalidCount: number }
  }) => Promise<UploadSummary>
  arSheet: SheetData | null
  users: UserLite[]
}

interface UploadSummary {
  total: number
  saved: number
  skipped: number
  reasons: { name: string; reason: string }[]
}

function UploadModal({ open, onClose, onApply, arSheet, users }: UploadModalProps) {
  const [file, setFile] = useState<File | null>(null)
  const [parsed, setParsed] = useState<{
    entries: ZoomEntry[]
    invalidRows: { row: any; reason: string }[]
  } | null>(null)
  const [minMinutes, setMinMinutes] = useState(5)
  const [sessionDate, setSessionDate] = useState<string>(() =>
    new Date().toISOString().slice(0, 10),
  )
  const [parsing, setParsing] = useState(false)
  const [summary, setSummary] = useState<UploadSummary | null>(null)
  const [processing, setProcessing] = useState(false)

  useEffect(() => {
    if (!open) {
      setFile(null)
      setParsed(null)
      setSummary(null)
      setProcessing(false)
    }
  }, [open])

  async function handleFile(f: File) {
    setFile(f)
    setParsing(true)
    setSummary(null)
    try {
      const buf = await f.arrayBuffer()
      const result = parseZoomWorkbook(buf)
      setParsed(result)
      const firstDate = result.entries.find((e) => e.date)?.date
      if (firstDate) setSessionDate(firstDate)
    } catch (err) {
      console.error('Parse error', err)
      alert('Could not read this Excel file.')
    } finally {
      setParsing(false)
    }
  }

  const hasDatesInFile = useMemo(() => {
    if (!parsed) return false
    return parsed.entries.some((e) => e.date)
  }, [parsed])

  const filtered = useMemo(() => {
    if (!parsed) return []
    return parsed.entries.filter((e) => e.durationMinutes >= minMinutes)
  }, [parsed, minMinutes])

  const matchResult = useMemo(() => {
    if (!parsed) return null
    return matchAttendees(filtered, parsed.invalidRows, users, arSheet)
  }, [parsed, filtered, users, arSheet])

  if (!open) return null

  async function applyUpload() {
    if (!matchResult || !parsed) return
    setProcessing(true)
    try {
      const entries: { name: string; date: string }[] = []
      for (const m of matchResult.matched) {
        const entry = filtered.find((e) => normalizeName(e.name) === normalizeName(m.zoomName))
        const date = entry?.date || sessionDate
        entries.push({ name: m.name, date })
      }
      for (const u of matchResult.unmatched) {
        const entry = filtered.find((e) => normalizeName(e.name) === normalizeName(u.name))
        const date = entry?.date || sessionDate
        entries.push({ name: `${u.name} (Discovery Student)`, date })
      }
      const filteredOut = (parsed.entries.length || 0) - filtered.length
      const result = await onApply({
        entries,
        matchResult,
        stats: { totalParsed: parsed.entries.length, filteredOut, invalidCount: parsed.invalidRows.length },
      })
      setSummary(result)
    } finally {
      setProcessing(false)
    }
  }

  if (summary) {
    return (
      <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
          <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
            <h2
              className="text-lg font-semibold text-gray-800"
              style={{ fontFamily: '"Playfair Display", serif' }}
            >
              Upload Summary
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-700 text-xl leading-none"
            >
              &times;
            </button>
          </div>
          <div className="flex-1 overflow-auto px-5 py-4 space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-gray-50 border border-gray-200 rounded p-3 text-center">
                <div className="text-2xl font-bold text-gray-800">{summary.total}</div>
                <div className="text-xs text-gray-500 uppercase tracking-wide">Total Rows</div>
              </div>
              <div className="bg-green-50 border border-green-200 rounded p-3 text-center">
                <div className="text-2xl font-bold text-green-700">{summary.saved}</div>
                <div className="text-xs text-green-600 uppercase tracking-wide">Saved</div>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded p-3 text-center">
                <div className="text-2xl font-bold text-amber-700">{summary.skipped}</div>
                <div className="text-xs text-amber-600 uppercase tracking-wide">Skipped</div>
              </div>
            </div>
            {summary.reasons.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-gray-600 uppercase mb-2">Skip Reasons</div>
                <div className="border border-gray-200 rounded bg-gray-50 max-h-48 overflow-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="px-3 py-1.5 text-left text-gray-500">Name</th>
                        <th className="px-3 py-1.5 text-left text-gray-500">Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.reasons.map((r, i) => (
                        <tr key={i} className="border-b border-gray-100 last:border-0">
                          <td className="px-3 py-1 text-gray-700">{r.name || '—'}</td>
                          <td className="px-3 py-1 text-amber-700">{r.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
          <div className="border-t border-gray-200 px-5 py-3 flex items-center justify-end">
            <button
              onClick={onClose}
              className="text-xs px-4 py-1.5 rounded bg-[#A52A2A] text-white hover:bg-[#8b1f1f] uppercase tracking-wide"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <h2
            className="text-lg font-semibold text-gray-800"
            style={{ fontFamily: '"Playfair Display", serif' }}
          >
            Upload Zoom Attendance
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 text-xl leading-none"
          >
            &times;
          </button>
        </div>

        <div className="flex-1 overflow-auto px-5 py-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase mb-2">
              Zoom Excel File
            </label>
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) handleFile(f)
              }}
              className="text-sm"
            />
            {file && (
              <p className="text-xs text-gray-500 mt-1">
                {file.name} ({Math.round(file.size / 1024)} KB)
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">
                Min duration (minutes)
              </label>
              <input
                type="number"
                value={minMinutes}
                min={0}
                onChange={(e) => setMinMinutes(parseInt(e.target.value || '0', 10))}
                className="w-full text-sm border border-gray-200 rounded px-2 py-1"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">
                Session Date {hasDatesInFile && <span className="text-green-600 normal-case">(auto-detected from file)</span>}
              </label>
              <input
                type="date"
                value={sessionDate}
                onChange={(e) => setSessionDate(e.target.value)}
                className="w-full text-sm border border-gray-200 rounded px-2 py-1"
                title={hasDatesInFile ? 'Dates detected in file — this is a fallback for rows without dates' : undefined}
              />
              {hasDatesInFile && (
                <p className="text-[10px] text-green-600 mt-0.5">
                  Per-row dates found in file. This date is a fallback for rows missing a date.
                </p>
              )}
            </div>
          </div>

          {parsing && <p className="text-sm text-gray-500">Parsing file...</p>}

          {matchResult && (
            <div className="border border-gray-200 rounded p-3 bg-gray-50 space-y-3">
              <div className="text-xs">
                <span className="font-semibold">Found:</span>{' '}
                {parsed?.entries.length || 0} rows; kept {filtered.length} after &lt;
                {minMinutes}m filter.
                {(parsed?.entries.length || 0) - filtered.length > 0 && (
                  <span className="text-amber-600 ml-1">
                    ({(parsed?.entries.length || 0) - filtered.length} skipped for short duration)
                  </span>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <div className="text-xs font-semibold text-green-700 uppercase mb-1">
                    Matched ({matchResult.matched.length})
                  </div>
                  <ul className="text-xs space-y-0.5 max-h-40 overflow-auto">
                    {matchResult.matched.map((m, i) => {
                      const fuzzy = normalizeName(m.zoomName) !== normalizeName(m.name)
                      return (
                        <li key={i}>
                          {fuzzy ? (
                            <>
                              <span className="text-gray-500">{m.zoomName}</span>
                              <span className="text-gray-400"> → </span>
                              {m.name}
                            </>
                          ) : (
                            m.name
                          )}{' '}
                          <span className="text-gray-400">
                            ({m.source === 'user' ? 'user' : 'sheet'})
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                </div>
                <div>
                  <div className="text-xs font-semibold text-amber-700 uppercase mb-1">
                    Unmatched → Discovery ({matchResult.unmatched.length})
                  </div>
                  <ul className="text-xs space-y-0.5 max-h-40 overflow-auto">
                    {matchResult.unmatched.map((m, i) => (
                      <li key={i}>{m.name} (Discovery Student)</li>
                    ))}
                  </ul>
                </div>
                {matchResult.duplicates.length > 0 && (
                  <div className="md:col-span-2">
                    <div className="text-xs font-semibold text-blue-700 uppercase mb-1">
                      Duplicates collapsed ({matchResult.duplicates.length})
                    </div>
                    <ul className="text-xs space-y-0.5 max-h-24 overflow-auto">
                      {matchResult.duplicates.map((d, i) => (
                        <li key={i}>
                          {d.name} &times;{d.count}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {matchResult.invalid.length > 0 && (
                  <div className="md:col-span-2">
                    <div className="text-xs font-semibold text-red-700 uppercase mb-1">
                      Invalid rows ({matchResult.invalid.length})
                    </div>
                    <ul className="text-xs space-y-0.5 max-h-24 overflow-auto">
                      {matchResult.invalid.map((d, i) => (
                        <li key={i}>{d.reason}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-gray-200 px-5 py-3 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="text-xs text-gray-500 hover:text-gray-800 px-3 py-1.5 uppercase tracking-wide"
          >
            Cancel
          </button>
          <button
            disabled={!matchResult || processing}
            onClick={applyUpload}
            className="text-xs px-3 py-1.5 rounded bg-[#A52A2A] text-white hover:bg-[#8b1f1f] disabled:opacity-50 uppercase tracking-wide"
          >
            {processing ? 'Saving…' : 'Apply to SR'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function ARSRModule({
  currentUser: _currentUser,
  onUploadComplete,
}: {
  currentUser: { name: string; email: string; role: string } | null
  onUploadComplete?: () => void
}) {
  const [section, setSection] = useState<Section>('sr')
  const [workbooks, setWorkbooks] = useState<Record<Section, Workbook | null>>({
    sr: null,
    ar: null,
  })
  const [loading, setLoading] = useState(true)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [rosterStatus, setRosterStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle')
  const [users, setUsers] = useState<UserLite[]>([])
  const [showUpload, setShowUpload] = useState(false)
  const [showErrors, setShowErrors] = useState(false)
  const saveTimers = useRef<Record<Section, any>>({ sr: null, ar: null })

  const wb = workbooks[section]

  async function loadWorkbook(s: Section) {
    try {
      const res = await apiFetch(`/api/arsr-sheets?section=${s}`)
      if (!res.ok) throw new Error(`Load ${s} failed`)
      const data = await res.json()
      setWorkbooks((prev) => ({ ...prev, [s]: data.workbook as Workbook }))
    } catch (err) {
      console.error(err)
    }
  }

  useEffect(() => {
    let mounted = true
    ;(async () => {
      setLoading(true)
      await Promise.all([loadWorkbook('sr'), loadWorkbook('ar')])
      try {
        const r = await apiFetch('/api/users')
        if (r.ok) {
          const d = await r.json()
          if (mounted) setUsers((d.users || []) as UserLite[])
        }
      } catch {}
      if (mounted) setLoading(false)
    })()
    return () => {
      mounted = false
    }
  }, [])

  // Warn before page unload if a debounced save is still in flight, so a
  // closed tab cannot lose AR/SR edits that haven't yet been PUT to blob
  // storage. Pairs with flushPendingSaves on section switches.
  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      const hasPending = Boolean(saveTimers.current.sr || saveTimers.current.ar)
      if (hasPending || saveStatus === 'saving') {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [saveStatus])

  function scheduleSave(s: Section, next: Workbook) {
    if (saveTimers.current[s]) clearTimeout(saveTimers.current[s])
    setSaveStatus('saving')
    saveTimers.current[s] = setTimeout(async () => {
      try {
        const res = await apiFetch(`/api/arsr-sheets?section=${s}`, {
          method: 'PUT',
          body: JSON.stringify(next),
        })
        if (!res.ok) throw new Error('Save failed')
        setSaveStatus('saved')
        setTimeout(() => setSaveStatus('idle'), 1500)
      } catch (err) {
        console.error(err)
        setSaveStatus('error')
      }
    }, 700)
  }

  // Flush any pending debounced saves immediately so a section switch (or
  // other navigation) cannot strand unsaved edits in the previous view.
  // Returns a promise that resolves once every pending section has been
  // PUT to the server.
  async function flushPendingSaves() {
    const pending = (Object.keys(saveTimers.current) as Section[]).filter(
      (k) => saveTimers.current[k],
    )
    if (pending.length === 0) return
    setSaveStatus('saving')
    try {
      await Promise.all(
        pending.map(async (s) => {
          if (saveTimers.current[s]) clearTimeout(saveTimers.current[s])
          saveTimers.current[s] = null
          const wbk = workbooks[s]
          if (!wbk) return
          const res = await apiFetch(`/api/arsr-sheets?section=${s}`, {
            method: 'PUT',
            body: JSON.stringify(wbk),
          })
          if (!res.ok) throw new Error(`Flush ${s} failed`)
        }),
      )
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 1200)
    } catch (err) {
      console.error('flushPendingSaves', err)
      setSaveStatus('error')
    }
  }

  async function switchSection(next: Section) {
    if (next === section) return
    await flushPendingSaves()
    setSection(next)
  }

  function updateWorkbook(s: Section, updater: (w: Workbook) => Workbook) {
    setWorkbooks((prev) => {
      const current = prev[s]
      if (!current) return prev
      const next = updater(current)
      scheduleSave(s, next)
      return { ...prev, [s]: next }
    })
  }

  function handleSheetsChange(sheets: SheetData[], activeSheetId: string | null) {
    updateWorkbook(section, (w) => ({ ...w, sheets, activeSheetId }))
  }

  function addSheet() {
    if (!wb) return
    const cols = section === 'sr' ? SR_DEFAULT_COLUMNS : AR_DEFAULT_COLUMNS
    const newSheet = emptySheet(`Sheet ${wb.sheets.length + 1}`, cols)
    updateWorkbook(section, (w) => ({
      ...w,
      sheets: [...w.sheets, newSheet],
      activeSheetId: newSheet.id,
    }))
  }

  function renameSheet(id: string, name: string) {
    updateWorkbook(section, (w) => ({
      ...w,
      sheets: w.sheets.map((s) => (s.id === id ? { ...s, name } : s)),
    }))
  }

  function deleteSheet(id: string) {
    updateWorkbook(section, (w) => {
      const remaining = w.sheets.filter((s) => s.id !== id)
      const newActive = w.activeSheetId === id ? remaining[0]?.id || null : w.activeSheetId
      return { ...w, sheets: remaining, activeSheetId: newActive }
    })
  }

  function switchSheet(id: string) {
    updateWorkbook(section, (w) => ({ ...w, activeSheetId: id }))
  }

  async function refreshRoster() {
    setRosterStatus('loading')
    try {
      // Force a refresh of the cached Google Sheets roster.
      const r = await apiFetch('/api/google-sheets-fetch?refresh=1')
      if (!r.ok) {
        setRosterStatus('error')
        return
      }
      // Retry every pending enrichment with the fresh roster.
      const r2 = await apiFetch('/api/ar-enrich', {
        method: 'POST',
        body: JSON.stringify({ retryAll: true }),
      })
      if (!r2.ok) {
        setRosterStatus('error')
        return
      }
      // Reload AR workbook so the freshly enriched rows appear.
      await loadWorkbook('ar')
      setRosterStatus('ok')
      setTimeout(() => setRosterStatus('idle'), 1500)
    } catch {
      setRosterStatus('error')
    }
  }

  function activeSheetOf(s: Section): SheetData | null {
    const wbk = workbooks[s]
    if (!wbk) return null
    return wbk.sheets.find((sh) => sh.id === wbk.activeSheetId) || wbk.sheets[0] || null
  }

  async function applyZoomUpload(params: {
    entries: { name: string; date: string }[]
    matchResult: MatchResult
    stats: { totalParsed: number; filteredOut: number; invalidCount: number }
  }): Promise<UploadSummary> {
    const srWb = workbooks.sr
    const arWb = workbooks.ar
    const skipReasons: { name: string; reason: string }[] = []
    let savedCount = 0

    if (!srWb) {
      return { total: params.stats.totalParsed, saved: 0, skipped: params.stats.totalParsed, reasons: [{ name: '', reason: 'SR workbook not loaded' }] }
    }

    const srActive = srWb.sheets.find((s) => s.id === srWb.activeSheetId) || srWb.sheets[0]
    if (!srActive) {
      return { total: params.stats.totalParsed, saved: 0, skipped: params.stats.totalParsed, reasons: [{ name: '', reason: 'No active SR sheet' }] }
    }

    // Add filtered-out and invalid entries to skip reasons
    for (let i = 0; i < params.stats.filteredOut; i++) {
      skipReasons.push({ name: '', reason: 'Duration below minimum' })
    }
    for (let i = 0; i < params.stats.invalidCount; i++) {
      skipReasons.push({ name: '', reason: 'Invalid row in file' })
    }

    const newStudentSessions = { ...srWb.studentSessions }
    const newStudentUserMap: Record<string, string> = { ...(srWb.studentUserMap || {}) }
    for (const m of params.matchResult.matched) {
      if (m.email) newStudentUserMap[m.name] = m.email
    }
    const rows = srActive.rows.slice()

    // Group entries by date
    const byDate = new Map<string, string[]>()
    for (const e of params.entries) {
      if (!e.date) {
        console.log(`[SR Upload] Skipped [${e.name}] — no date`)
        skipReasons.push({ name: e.name, reason: 'No date' })
        continue
      }
      console.log(`[SR Upload] Processing [${e.name}] for date [${e.date}]`)
      const list = byDate.get(e.date) || []
      list.push(e.name)
      byDate.set(e.date, list)
    }

    // For each date, find or create an SR row and add attendance
    for (const [date, names] of byDate) {
      let rowIdx = rows.findIndex((r) => {
        const cellDate = htmlToText(r['Date'] || '').trim()
        return cellDate === date
      })

      if (rowIdx === -1) {
        rowIdx = rows.findIndex((r) =>
          Object.values(r).every((v) => !htmlToText(v || '')),
        )
        if (rowIdx === -1) {
          rows.push({})
          rowIdx = rows.length - 1
        }
        rows[rowIdx] = { ...rows[rowIdx], Date: textToHtml(date) }
      }

      const existing = rows[rowIdx]
      const existingNames = htmlToText(existing['Attendance'] || '')
        .split(/\n|,/)
        .map((s) => s.trim())
        .filter(Boolean)
      const seen = new Set(existingNames.map((n) => n.toLowerCase()))
      const merged = existingNames.slice()

      for (const name of names) {
        const sessions = newStudentSessions[name] || []
        if (sessions.includes(date)) {
          console.log(`[SR Upload] Duplicate skipped — [${name}] already has session on [${date}]`)
          skipReasons.push({ name, reason: `Already has session on ${date}` })
          continue
        }

        if (seen.has(name.toLowerCase())) {
          console.log(`[SR Upload] Duplicate skipped — [${name}] already in attendance for [${date}]`)
          skipReasons.push({ name, reason: `Already in attendance for ${date}` })
          continue
        }

        console.log(`[SR Upload] Matched [${name}]`)
        console.log(`[SR Upload] Session added for [${name}] on [${date}]`)
        merged.push(name)
        seen.add(name.toLowerCase())
        newStudentSessions[name] = [...(newStudentSessions[name] || []), date]
        savedCount++
      }

      rows[rowIdx] = {
        ...rows[rowIdx],
        Attendance: textToHtml(merged.join('\n')),
      }
    }

    const updatedSrSheet: SheetData = { ...srActive, rows, updatedAt: Date.now() }

    // Error entries for the workbook error panel
    const newErrors: ErrorEntry[] = []
    for (const u of params.matchResult.unmatched) {
      newErrors.push({
        id: `err_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        type: 'unmatched',
        message: `"${u.name}" not matched — added as Discovery Student`,
        createdAt: Date.now(),
      })
    }
    for (const d of params.matchResult.duplicates) {
      newErrors.push({
        id: `err_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        type: 'duplicate',
        message: `"${d.name}" appeared ${d.count}× in upload`,
        createdAt: Date.now(),
      })
    }
    for (const i of params.matchResult.invalid) {
      newErrors.push({
        id: `err_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        type: 'invalid',
        message: i.reason,
        context: i.row,
        createdAt: Date.now(),
      })
    }

    const nextSr: Workbook = {
      ...srWb,
      sheets: srWb.sheets.map((s) => (s.id === updatedSrSheet.id ? updatedSrSheet : s)),
      studentSessions: newStudentSessions,
      studentUserMap: newStudentUserMap,
      errors: [...srWb.errors, ...newErrors],
      updatedAt: Date.now(),
    }

    // Update ALL AR sheets: map session dates into monthly columns and
    // recompute NO. OF SESSION across Group, Individual, and Renewals so
    // students on any sheet get updated — not just the active one.
    let nextAr: Workbook | null = null
    if (arWb) {
      const allDates = Array.from(byDate.keys())

      // Add month columns to every sheet that needs them
      const updatedArSheets = arWb.sheets.map((sheet) => {
        const cols = sheet.columns.slice()
        for (const date of allDates) {
          const monthInfo = monthColumnFor(date)
          if (monthInfo && !cols.includes(monthInfo.column)) cols.push(monthInfo.column)
        }
        const arRows = sheet.rows.map((r) => {
          const next: Record<string, string> = {}
          for (const c of cols) next[c] = r[c] || ''
          return next
        })
        return { ...sheet, columns: cols, rows: arRows }
      })

      // Cross-sheet index: student name (lowercase) → { si, ri }
      const crossIndex = new Map<string, { si: number; ri: number }>()
      updatedArSheets.forEach((sheet, si) => {
        const studentCol = sheet.columns.includes('Name')
          ? 'Name'
          : sheet.columns.includes('Student')
            ? 'Student'
            : sheet.columns[0]
        sheet.rows.forEach((r, ri) => {
          const t = htmlToText(r[studentCol] || '').toLowerCase()
          if (t && !crossIndex.has(t)) crossIndex.set(t, { si, ri })
        })
      })

      const appendDay = (cellHtml: string, day: number): string => {
        const text = htmlToText(cellHtml)
        const days = text
          .split(/[,\s]+/)
          .map((s) => s.trim())
          .filter(Boolean)
        if (days.includes(String(day))) return cellHtml
        days.push(String(day))
        return textToHtml(days.join(', '))
      }

      // Collect all unique names that had sessions added
      const allNames = new Set<string>()
      for (const names of byDate.values()) {
        for (const n of names) allNames.add(n)
      }

      for (const name of allNames) {
        const key = name.toLowerCase()
        let target = crossIndex.get(key)

        if (!target) {
          // Default to the first sheet (Group) — find an empty row or append
          const defaultIdx = 0
          const sheet = updatedArSheets[defaultIdx]
          const studentCol = sheet.columns.includes('Name')
            ? 'Name'
            : sheet.columns.includes('Student')
              ? 'Student'
              : sheet.columns[0]
          let emptyIdx = sheet.rows.findIndex((r) =>
            Object.values(r).every((v) => !htmlToText(v || '')),
          )
          if (emptyIdx === -1) {
            const newRow: Record<string, string> = {}
            for (const c of sheet.columns) newRow[c] = ''
            sheet.rows.push(newRow)
            emptyIdx = sheet.rows.length - 1
          }
          sheet.rows[emptyIdx][studentCol] = textToHtml(name)
          target = { si: defaultIdx, ri: emptyIdx }
          crossIndex.set(key, target)
        }

        const sheet = updatedArSheets[target.si]
        const row = sheet.rows[target.ri]

        // Add day entries for each date this student attended
        const studentDates = newStudentSessions[name] || []
        for (const date of studentDates) {
          const monthInfo = monthColumnFor(date)
          if (monthInfo) {
            row[monthInfo.column] = appendDay(row[monthInfo.column] || '', monthInfo.day)
          }
        }

        // Recompute NO. OF SESSION from all session data
        const sessions = new Set<string>(newStudentSessions[name] || [])
        for (const c of sheet.columns) {
          if (!/^[A-Za-z]+ \d{4}$/.test(c)) continue
          const monthMatch = c.match(/^([A-Za-z]+) (\d{4})$/)
          if (!monthMatch) continue
          const monthIdx = MONTH_LABELS.indexOf(monthMatch[1])
          if (monthIdx < 0) continue
          const year = monthMatch[2]
          const days = htmlToText(row[c] || '')
            .split(/[,\s]+/)
            .map((s) => s.trim())
            .filter((s) => /^\d+$/.test(s))
          for (const d of days) {
            const padDay = String(d).padStart(2, '0')
            const padMonth = String(monthIdx + 1).padStart(2, '0')
            sessions.add(`${year}-${padMonth}-${padDay}`)
          }
        }
        const attended = sessions.size
        const current = htmlToText(row['NO. OF SESSION'] || '')
        const m = current.match(/^\d+\s*\/\s*(\d+)$/)
        const enrolled = m ? parseInt(m[1], 10) : 0
        row['NO. OF SESSION'] = textToHtml(`${attended} / ${enrolled}`)
        console.log(`[SR Upload] AR updated for [${name}] on sheet [${sheet.name}]: ${attended} / ${enrolled}`)

        sheet.rows[target.ri] = row
      }

      nextAr = {
        ...arWb,
        sheets: updatedArSheets.map((s) => ({ ...s, updatedAt: Date.now() })),
        studentSessions: newStudentSessions,
        studentUserMap: newStudentUserMap,
        updatedAt: Date.now(),
      }
    }

    // Update local state immediately for optimistic display
    setWorkbooks((prev) => ({
      ...prev,
      sr: nextSr,
      ...(nextAr ? { ar: nextAr } : {}),
    }))

    if (newErrors.length > 0) setShowErrors(true)

    // Cancel pending debounced saves — we'll save immediately so the
    // server has the data before Manage Users refreshes.
    if (saveTimers.current.sr) { clearTimeout(saveTimers.current.sr); saveTimers.current.sr = null }
    if (saveTimers.current.ar) { clearTimeout(saveTimers.current.ar); saveTimers.current.ar = null }
    setSaveStatus('saving')
    try {
      const saves: Promise<Response>[] = [
        apiFetch('/api/arsr-sheets?section=sr', { method: 'PUT', body: JSON.stringify(nextSr) }),
      ]
      if (nextAr) {
        saves.push(apiFetch('/api/arsr-sheets?section=ar', { method: 'PUT', body: JSON.stringify(nextAr) }))
      }
      const results = await Promise.all(saves)
      const allOk = results.every((r) => r.ok)
      setSaveStatus(allOk ? 'saved' : 'error')
      if (allOk) setTimeout(() => setSaveStatus('idle'), 1500)
    } catch {
      setSaveStatus('error')
    }

    // Notify parent AFTER server saves complete so Manage Users reads
    // the freshly persisted studentSessions index.
    console.log('[SR Upload] Server saves complete — notifying Manage Users to refresh')
    onUploadComplete?.()

    const summary: UploadSummary = {
      total: params.stats.totalParsed,
      saved: savedCount,
      skipped: skipReasons.length,
      reasons: skipReasons,
    }

    console.log(`[SR Upload] === Summary: ${summary.total} total, ${summary.saved} saved, ${summary.skipped} skipped ===`)

    return summary
  }

  function resolveError(id: string) {
    if (!wb) return
    updateWorkbook(section, (w) => ({
      ...w,
      errors: w.errors.map((e) => (e.id === id ? { ...e, resolved: true } : e)),
    }))
  }

  function clearResolvedErrors() {
    updateWorkbook(section, (w) => ({ ...w, errors: w.errors.filter((e) => !e.resolved) }))
  }

  if (loading) {
    return <div className="p-6 text-sm text-gray-500">Loading AR &amp; SR…</div>
  }
  if (!wb) {
    return <div className="p-6 text-sm text-red-500">Failed to load workbook.</div>
  }

  const errorCount = wb.errors.filter((e) => !e.resolved).length

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* Section header */}
      <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between flex-none">
        <div className="flex items-center gap-2">
          <button
            onClick={() => switchSection('sr')}
            className={`text-sm font-semibold px-4 py-1.5 rounded-md border transition-colors ${
              section === 'sr'
                ? 'bg-[#A52A2A] text-white border-[#A52A2A]'
                : 'bg-white text-gray-600 border-gray-200 hover:border-[#A52A2A] hover:text-[#A52A2A]'
            }`}
          >
            SR — Session Report
          </button>
          <button
            onClick={() => switchSection('ar')}
            className={`text-sm font-semibold px-4 py-1.5 rounded-md border transition-colors ${
              section === 'ar'
                ? 'bg-[#A52A2A] text-white border-[#A52A2A]'
                : 'bg-white text-gray-600 border-gray-200 hover:border-[#A52A2A] hover:text-[#A52A2A]'
            }`}
          >
            AR — Attendance Report
          </button>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400">
            {saveStatus === 'saving'
              ? 'Saving…'
              : saveStatus === 'saved'
                ? 'Saved'
                : saveStatus === 'error'
                  ? 'Save failed'
                  : ''}
          </span>
          <button
            type="button"
            onClick={() => setShowErrors((v) => !v)}
            className={`text-xs px-3 py-1.5 rounded border ${
              errorCount > 0
                ? 'bg-amber-50 border-amber-200 text-amber-700'
                : 'bg-white border-gray-200 text-gray-500'
            }`}
          >
            Errors ({errorCount})
          </button>
          {section === 'ar' && (
            <button
              type="button"
              onClick={refreshRoster}
              disabled={rosterStatus === 'loading'}
              title="Re-fetch School Board / Parent Name from Google Sheets and retry pending enrichments"
              className="text-xs px-3 py-1.5 rounded border bg-white border-gray-200 text-gray-600 hover:border-[#A52A2A] hover:text-[#A52A2A] disabled:opacity-50"
            >
              {rosterStatus === 'loading'
                ? 'Refreshing…'
                : rosterStatus === 'error'
                  ? 'Refresh roster ⚠'
                  : 'Refresh roster'}
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowUpload(true)}
            className="text-xs px-3 py-1.5 rounded bg-[#A52A2A] text-white hover:bg-[#8b1f1f] uppercase tracking-wide"
          >
            Upload Zoom Excel
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex">
        <div className="flex-1 min-h-0 flex flex-col">
          <Spreadsheet
            sheets={wb.sheets}
            activeSheetId={wb.activeSheetId}
            onChange={handleSheetsChange}
            onAddSheet={addSheet}
            onRenameSheet={renameSheet}
            onDeleteSheet={deleteSheet}
            onSwitchSheet={switchSheet}
            lockedColumns={section === 'sr'}
            readOnlyColumns={section === 'ar' ? AR_LOCKED_COLUMNS : []}
          />
        </div>
        {showErrors && (
          <aside className="w-80 border-l border-gray-200 bg-white flex flex-col flex-none">
            <div className="border-b border-gray-200 px-4 py-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-700">Errors</h3>
              <button
                onClick={clearResolvedErrors}
                className="text-[10px] text-gray-400 hover:text-[#A52A2A] uppercase"
              >
                Clear resolved
              </button>
            </div>
            <div className="flex-1 overflow-auto p-3 space-y-2">
              {wb.errors.length === 0 ? (
                <p className="text-xs text-gray-400">No errors.</p>
              ) : (
                wb.errors.map((e) => (
                  <div
                    key={e.id}
                    className={`text-xs rounded border p-2 ${
                      e.resolved
                        ? 'opacity-50 line-through bg-gray-50 border-gray-200'
                        : e.type === 'unmatched'
                          ? 'bg-amber-50 border-amber-200 text-amber-800'
                          : e.type === 'duplicate'
                            ? 'bg-blue-50 border-blue-200 text-blue-800'
                            : 'bg-red-50 border-red-200 text-red-800'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-semibold uppercase text-[10px] tracking-wide">
                          {e.type}
                        </div>
                        <div>{e.message}</div>
                      </div>
                      {!e.resolved && (
                        <button
                          onClick={() => resolveError(e.id)}
                          className="text-[10px] text-gray-500 hover:text-[#A52A2A]"
                          title="Mark resolved"
                        >
                          &#10003;
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </aside>
        )}
      </div>

      <UploadModal
        open={showUpload}
        onClose={() => setShowUpload(false)}
        onApply={applyZoomUpload}
        arSheet={activeSheetOf('ar')}
        users={users}
      />
    </div>
  )
}
