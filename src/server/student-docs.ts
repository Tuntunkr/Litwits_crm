import type { SupabaseConfig } from '@/server/env'
import { kvGet, kvSet } from '@/server/kv'

const BUCKET = 'student_docs'

export type DocRow = Record<string, unknown> & { id: number }
export type DocStore = { documents: DocRow[]; versions: Record<string, number> }

export async function loadStudentDocStore(
  config: SupabaseConfig,
  email: string,
): Promise<DocStore> {
  const row = await kvGet<DocStore>(config, BUCKET, email.toLowerCase())
  if (!row) return { documents: [], versions: {} }
  if (!Array.isArray(row.documents)) return { documents: [], versions: row.versions || {} }
  return {
    documents: row.documents as DocRow[],
    versions: row.versions && typeof row.versions === 'object' ? row.versions : {},
  }
}

export async function saveStudentDocStore(
  config: SupabaseConfig,
  email: string,
  store: DocStore,
): Promise<void> {
  await kvSet(config, BUCKET, email.toLowerCase(), store)
}
