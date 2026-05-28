import { getStore } from '@netlify/blobs'
import crypto from 'node:crypto'

export const config = { path: '/api/google-sheets-fetch' }

const SHEET_ID = '1RPCYrIl3CDtuaT-kIL_P8-LftYKJaEgSa6Y5DmLzlOk'
const TARGET_SHEETS = ['Group', 'Individual', 'Renewals']
const CACHE_TTL_MS = 5 * 60 * 1000

interface SheetRow {
  sheet: string
  email: string
  name: string
  schoolBoard: string
  parentName: string
  registrationData: Record<string, string>
}

interface CacheBlob {
  fetchedAt: number
  rows: SheetRow[]
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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

function base64UrlEncode(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input) : input
  return buf
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

function getServiceAccount(): { client_email: string; private_key: string } | null {
  const raw = process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (!parsed.client_email || !parsed.private_key) return null
    return {
      client_email: parsed.client_email,
      private_key: String(parsed.private_key).replace(/\\n/g, '\n'),
    }
  } catch {
    return null
  }
}

async function getAccessToken(): Promise<string | null> {
  const sa = getServiceAccount()
  if (!sa) return null

  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'RS256', typ: 'JWT' }
  const claims = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  }
  const headerB64 = base64UrlEncode(JSON.stringify(header))
  const claimsB64 = base64UrlEncode(JSON.stringify(claims))
  const signingInput = `${headerB64}.${claimsB64}`
  const signer = crypto.createSign('RSA-SHA256')
  signer.update(signingInput)
  signer.end()
  const signature = signer.sign(sa.private_key)
  const jwt = `${signingInput}.${base64UrlEncode(signature)}`

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })
  if (!res.ok) {
    console.error('Google token exchange failed', res.status)
    return null
  }
  const data = (await res.json()) as { access_token?: string }
  return data.access_token || null
}

function pickColumn(headers: string[], candidates: RegExp[]): number {
  for (let i = 0; i < headers.length; i++) {
    const h = (headers[i] || '').toLowerCase().trim()
    if (candidates.some((rx) => rx.test(h))) return i
  }
  return -1
}

async function fetchSheet(token: string, sheetName: string): Promise<SheetRow[]> {
  const range = encodeURIComponent(`${sheetName}!A1:Z2000`)
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${range}`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) {
    console.error(`Sheet ${sheetName} fetch failed`, res.status)
    return []
  }
  const data = (await res.json()) as { values?: string[][] }
  const values = data.values || []
  if (values.length < 2) return []
  const headers = values[0]
  const emailIdx = pickColumn(headers, [/^email$/, /e-mail/, /^mail$/])
  const nameIdx = pickColumn(headers, [/student name/, /^name$/, /^full name$/, /child/])
  const boardIdx = pickColumn(headers, [/school board/, /^board$/, /curriculum/])
  const parentIdx = pickColumn(headers, [/parent name/, /^parent$/, /guardian/, /father|mother/])
  const coreIndices = new Set([emailIdx, nameIdx, boardIdx, parentIdx].filter((i) => i >= 0))
  const out: SheetRow[] = []
  for (let i = 1; i < values.length; i++) {
    const row = values[i]
    if (!row || row.length === 0) continue
    const email = emailIdx >= 0 ? String(row[emailIdx] || '').trim().toLowerCase() : ''
    const name = nameIdx >= 0 ? String(row[nameIdx] || '').trim() : ''
    if (!email && !name) continue
    const registrationData: Record<string, string> = {}
    for (let ci = 0; ci < headers.length; ci++) {
      if (coreIndices.has(ci)) continue
      const hdr = (headers[ci] || '').trim()
      const val = String(row[ci] || '').trim()
      if (hdr && val) registrationData[hdr] = val
    }
    out.push({
      sheet: sheetName,
      email,
      name,
      schoolBoard: boardIdx >= 0 ? String(row[boardIdx] || '').trim() : '',
      parentName: parentIdx >= 0 ? String(row[parentIdx] || '').trim() : '',
      registrationData,
    })
  }
  return out
}

export async function loadAttendanceRoster(
  forceRefresh = false,
): Promise<{ ok: boolean; rows: SheetRow[]; reason?: string }> {
  const cacheStore = getStore({ name: 'litwits-arsr-cache', consistency: 'strong' })
  const cached = (await cacheStore.get('roster', { type: 'json' })) as CacheBlob | null
  if (!forceRefresh && cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return { ok: true, rows: cached.rows }
  }
  const token = await getAccessToken()
  if (!token) {
    if (cached) return { ok: true, rows: cached.rows, reason: 'stale-cache' }
    return { ok: false, rows: [], reason: 'no-credentials' }
  }
  try {
    const allRows: SheetRow[] = []
    for (const name of TARGET_SHEETS) {
      const rows = await fetchSheet(token, name)
      allRows.push(...rows)
    }
    const blob: CacheBlob = { fetchedAt: Date.now(), rows: allRows }
    await cacheStore.setJSON('roster', blob)
    return { ok: true, rows: allRows }
  } catch (err) {
    console.error('Sheets fetch error', err)
    if (cached) return { ok: true, rows: cached.rows, reason: 'stale-cache' }
    return { ok: false, rows: [], reason: 'fetch-failed' }
  }
}

export function findRosterMatch(
  rows: SheetRow[],
  email: string,
  name: string,
): SheetRow | null {
  const emailNorm = email.trim().toLowerCase()
  if (emailNorm) {
    const byEmail = rows.find((r) => r.email && r.email === emailNorm)
    if (byEmail) return byEmail
  }
  const nameNorm = name
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9 ]/g, '')
    .trim()
  if (!nameNorm) return null
  return (
    rows.find((r) => {
      const n = r.name
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .replace(/[^a-z0-9 ]/g, '')
        .trim()
      return n === nameNorm
    }) || null
  )
}

export default async (request: Request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() })
  }

  const session = await getSession(request)
  if (!session) return withCors(json({ error: 'Unauthorized' }, 401))
  if (session.role !== 'admin') return withCors(json({ error: 'Forbidden' }, 403))

  const url = new URL(request.url)
  const force = url.searchParams.get('refresh') === '1'
  const email = (url.searchParams.get('email') || '').trim()
  const name = (url.searchParams.get('name') || '').trim()

  const roster = await loadAttendanceRoster(force)
  if (!roster.ok) {
    return withCors(json({ ok: false, reason: roster.reason || 'fetch-failed' }, 200))
  }

  if (email || name) {
    const match = findRosterMatch(roster.rows, email, name)
    return withCors(
      json({
        ok: true,
        match: match
          ? {
              sheet: match.sheet,
              schoolBoard: match.schoolBoard,
              parentName: match.parentName,
              registrationData: match.registrationData,
            }
          : null,
        stale: roster.reason === 'stale-cache',
      }),
    )
  }

  return withCors(
    json({
      ok: true,
      count: roster.rows.length,
      stale: roster.reason === 'stale-cache',
    }),
  )
}
