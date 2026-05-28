import type { SupabaseConfig } from './env'

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  Accept: 'application/json',
}

export async function sbFetch(
  config: SupabaseConfig,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const url = `${config.url}/rest/v1/${path.replace(/^\//, '')}`
  const headers = new Headers(init.headers)
  headers.set('apikey', config.serviceKey)
  headers.set('Authorization', `Bearer ${config.serviceKey}`)
  if (!headers.has('Accept')) headers.set('Accept', 'application/json')
  return fetch(url, { ...init, headers })
}

export async function kvGet<T>(
  config: SupabaseConfig,
  bucket: string,
  key: string,
): Promise<T | null> {
  const q = `crm_kv?bucket=eq.${encodeURIComponent(bucket)}&key=eq.${encodeURIComponent(key)}&select=value&limit=1`
  const res = await sbFetch(config, q)
  if (!res.ok) return null
  const rows = (await res.json()) as { value: T }[]
  return rows[0]?.value ?? null
}

export async function kvSet<T>(
  config: SupabaseConfig,
  bucket: string,
  key: string,
  value: T,
): Promise<void> {
  const res = await sbFetch(config, 'crm_kv?on_conflict=bucket,key', {
    method: 'POST',
    headers: {
      ...JSON_HEADERS,
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify({
      bucket,
      key,
      value,
      updated_at: new Date().toISOString(),
    }),
  })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(`kvSet failed: ${res.status} ${t}`)
  }
}

export async function kvDelete(
  config: SupabaseConfig,
  bucket: string,
  key: string,
): Promise<void> {
  const path = `crm_kv?bucket=eq.${encodeURIComponent(bucket)}&key=eq.${encodeURIComponent(key)}`
  const res = await sbFetch(config, path, { method: 'DELETE' })
  if (!res.ok && res.status !== 406) {
    const t = await res.text()
    throw new Error(`kvDelete failed: ${res.status} ${t}`)
  }
}

export async function kvListBucket(
  config: SupabaseConfig,
  bucket: string,
): Promise<{ key: string; value: unknown }[]> {
  const path = `crm_kv?bucket=eq.${encodeURIComponent(bucket)}&select=key,value`
  const res = await sbFetch(config, path)
  if (!res.ok) return []
  return (await res.json()) as { key: string; value: unknown }[]
}
