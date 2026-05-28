export interface User {
  name: string
  email: string
  role: 'admin' | 'mentor' | 'student'
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('litwits_token')
}

export function setToken(token: string): void {
  localStorage.setItem('litwits_token', token)
}

export function clearAuth(): void {
  localStorage.removeItem('litwits_token')
  localStorage.removeItem('litwits_user')
}

export function getUser(): User | null {
  if (typeof window === 'undefined') return null
  const raw = localStorage.getItem('litwits_user')
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function setUser(user: User): void {
  localStorage.setItem('litwits_user', JSON.stringify(user))
}

export function authHeaders(): Record<string, string> {
  const token = getToken()
  if (!token) return { 'Content-Type': 'application/json' }
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
}

export async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = getToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  }
  if (token) headers['Authorization'] = `Bearer ${token}`
  return fetch(url, { ...options, headers })
}
