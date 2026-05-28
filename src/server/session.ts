import { createHmac, timingSafeEqual } from 'node:crypto'
import { getAuthSecret } from './env'

export type SessionPayload = {
  email: string
  name: string
  role: 'admin' | 'mentor' | 'student'
  exp: number
}

const B64 = {
  enc: (s: string) => Buffer.from(s, 'utf8').toString('base64url'),
  dec: (s: string) => Buffer.from(s, 'base64url').toString('utf8'),
}

export function signSession(payload: Omit<SessionPayload, 'exp'>, ttlSec = 60 * 60 * 24 * 30): string {
  const body: SessionPayload = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + ttlSec,
  }
  const data = B64.enc(JSON.stringify(body))
  const sig = createHmac('sha256', getAuthSecret()).update(data).digest('base64url')
  return `${data}.${sig}`
}

export function verifySession(token: string | null): SessionPayload | null {
  if (!token) return null
  const parts = token.split('.')
  if (parts.length !== 2) return null
  const [data, sig] = parts
  const expected = createHmac('sha256', getAuthSecret()).update(data).digest()
  let sigBuf: Buffer
  try {
    sigBuf = Buffer.from(sig, 'base64url')
  } catch {
    return null
  }
  if (sigBuf.length !== expected.length || !timingSafeEqual(sigBuf, expected)) return null
  try {
    const payload = JSON.parse(B64.dec(data)) as SessionPayload
    if (payload.exp < Math.floor(Date.now() / 1000)) return null
    return payload
  } catch {
    return null
  }
}

export function getBearerSession(request: Request): SessionPayload | null {
  const h = request.headers.get('Authorization')
  if (!h?.startsWith('Bearer ')) return null
  return verifySession(h.slice(7).trim())
}
