import { apiFetch } from '@/lib/auth'
import type { DocTab } from '@/components/DocumentTabsBar'

export async function saveTabOrder(documentKey: string, tabIds: string[]) {
  try {
    await apiFetch('/api/tab-order', {
      method: 'POST',
      body: JSON.stringify({ documentKey, tabOrder: tabIds }),
    })
  } catch {}
}

export async function loadTabOrder(documentKey: string): Promise<string[] | null> {
  try {
    const res = await apiFetch(`/api/tab-order?documentKey=${encodeURIComponent(documentKey)}`)
    const data = await res.json()
    return data.tabOrder ?? null
  } catch {
    return null
  }
}

export function applyTabOrder(tabs: DocTab[], order: string[]): DocTab[] {
  const tabMap = new Map(tabs.map((t) => [t.id, t]))
  const ordered: DocTab[] = []
  for (const id of order) {
    const tab = tabMap.get(id)
    if (tab) {
      ordered.push(tab)
      tabMap.delete(id)
    }
  }
  for (const tab of tabMap.values()) {
    ordered.push(tab)
  }
  return ordered
}
