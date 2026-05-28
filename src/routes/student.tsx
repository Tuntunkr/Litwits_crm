import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState, useEffect, useMemo } from 'react'
import { getUser, clearAuth, apiFetch } from '@/lib/auth'
import { saveTabOrder } from '@/lib/tab-order'
import Editor from '@/components/Editor'
import DocumentTabsBar, { type DocTab } from '@/components/DocumentTabsBar'

export const Route = createFileRoute('/student')({
  component: StudentDashboard,
})

type Tab = 'documents' | 'litwits-docs'
type View = 'grid' | 'editor'

interface DocRecord {
  id: number
  title: string
  content: string
  tabs?: DocTab[] | null
  activeTabId?: string | null
}

interface LitwitsDoc {
  id: string
  title: string
  category: string
  content: string
  tabs?: DocTab[] | null
  activeTabId?: string | null
}

function Wordmark() {
  return (
    <span
      className="text-2xl font-bold text-[#A52A2A] tracking-tight"
      style={{ fontFamily: '"Playfair Display", serif' }}
    >
      LITWITS
    </span>
  )
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
        active
          ? 'border-[#A52A2A] text-[#A52A2A]'
          : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300'
      }`}
    >
      {children}
    </button>
  )
}

function DocCard({ title, onClick, icon }: { title: string; onClick: () => void; icon?: string }) {
  return (
    <button
      onClick={onClick}
      className="group bg-white rounded-lg border border-gray-200 hover:border-[#A52A2A] hover:shadow-md transition-all p-6 text-left flex flex-col gap-3 aspect-[4/3]"
    >
      <div className="text-3xl text-gray-300 group-hover:text-[#A52A2A] transition-colors">
        {icon ?? '\u{1F4C4}'}
      </div>
      <div className="flex-1 flex items-end">
        <h3
          className="text-base font-semibold text-gray-800 group-hover:text-[#A52A2A] transition-colors leading-tight"
          style={{ fontFamily: '"Playfair Display", serif' }}
        >
          {title}
        </h3>
      </div>
    </button>
  )
}

export default function StudentDashboard() {
  const navigate = useNavigate()
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [tab, setTab] = useState<Tab>('documents')

  const [docs, setDocs] = useState<DocRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<View>('grid')
  const [selectedDocId, setSelectedDocId] = useState<number | null>(null)

  const [litwitsDocs, setLitwitsDocs] = useState<LitwitsDoc[]>([])
  const [litwitsLoading, setLitwitsLoading] = useState(false)
  const [litwitsView, setLitwitsView] = useState<View>('grid')
  const [selectedLitwitsDocId, setSelectedLitwitsDocId] = useState<string | null>(null)

  useEffect(() => {
    const u = getUser()
    if (!u || u.role !== 'student') {
      navigate({ to: '/login' })
      return
    }
    setCurrentUser(u)
    fetchDocs(u.email)
    fetchLitwitsDocs()
  }, [])

  // Live sync: poll the LITWITS catalog while the grid is visible so admin
  // creates/deletes appear without a manual refresh.
  useEffect(() => {
    if (tab !== 'litwits-docs' || litwitsView !== 'grid') return
    const interval = setInterval(() => {
      fetchLitwitsDocs()
    }, 6000)
    return () => clearInterval(interval)
  }, [tab, litwitsView])

  async function fetchDocs(email: string) {
    setLoading(true)
    try {
      const res = await apiFetch(`/api/documents?email=${encodeURIComponent(email)}`)
      const data = await res.json()
      setDocs(data.documents || [])
    } catch {
      setDocs([])
    } finally {
      setLoading(false)
    }
  }

  async function fetchLitwitsDocs() {
    setLitwitsLoading(true)
    try {
      const res = await apiFetch('/api/litwits-docs')
      const data = await res.json()
      setLitwitsDocs(data.documents || [])
    } catch {
      setLitwitsDocs([])
    } finally {
      setLitwitsLoading(false)
    }
  }

  async function handleLogout() {
    await apiFetch('/api/auth', { method: 'DELETE' })
    clearAuth()
    navigate({ to: '/login' })
  }

  const selectedDoc = useMemo(
    () => docs.find((d) => d.id === selectedDocId) ?? null,
    [docs, selectedDocId],
  )
  const selectedLitwitsDoc = useMemo(
    () => litwitsDocs.find((d) => d.id === selectedLitwitsDocId) ?? null,
    [litwitsDocs, selectedLitwitsDocId],
  )

  function handleTitleChange(docId: number, newTitle: string) {
    setDocs((prev) => prev.map((d) => (d.id === docId ? { ...d, title: newTitle } : d)))
  }

  function updateDocTabs(docId: number, tabs: DocTab[], activeTabId: string) {
    setDocs((prev) => prev.map((d) => (d.id === docId ? { ...d, tabs, activeTabId } : d)))
  }

  function onDocTabAdd(docId: number) {
    setDocs((prev) =>
      prev.map((d) => {
        if (d.id !== docId) return d
        const currentTabs: DocTab[] = d.tabs && d.tabs.length > 0
          ? d.tabs
          : [{ id: 'main', title: 'Main', content: d.content || '' }]
        const title = window.prompt('New tab name:', `Tab ${currentTabs.length + 1}`)
        if (!title) return d
        const newTab: DocTab = { id: `tab-${Date.now()}`, title, content: '' }
        return { ...d, tabs: [...currentTabs, newTab], activeTabId: newTab.id }
      }),
    )
  }

  function onDocTabRename(docId: number, tabId: string, newTitle: string) {
    setDocs((prev) =>
      prev.map((d) =>
        d.id === docId && d.tabs
          ? { ...d, tabs: d.tabs.map((t) => (t.id === tabId ? { ...t, title: newTitle } : t)) }
          : d,
      ),
    )
  }

  function onDocTabDelete(docId: number, tabId: string) {
    setDocs((prev) =>
      prev.map((d) => {
        if (d.id !== docId || !d.tabs) return d
        const remaining = d.tabs.filter((t) => t.id !== tabId)
        const newActive = d.activeTabId === tabId ? (remaining[0]?.id ?? null) : d.activeTabId
        return { ...d, tabs: remaining, activeTabId: newActive }
      }),
    )
  }

  function onLitwitsTabAdd(docId: string) {
    setLitwitsDocs((prev) =>
      prev.map((d) => {
        if (d.id !== docId) return d
        const currentTabs: DocTab[] = d.tabs && d.tabs.length > 0
          ? d.tabs
          : [{ id: 'main', title: 'Main', content: d.content || '' }]
        const title = window.prompt('New tab name:', `Tab ${currentTabs.length + 1}`)
        if (!title) return d
        const newTab: DocTab = { id: `tab-${Date.now()}`, title, content: '' }
        return { ...d, tabs: [...currentTabs, newTab], activeTabId: newTab.id }
      }),
    )
  }

  function onLitwitsTabRename(docId: string, tabId: string, newTitle: string) {
    setLitwitsDocs((prev) =>
      prev.map((d) =>
        d.id === docId && d.tabs
          ? { ...d, tabs: d.tabs.map((t) => (t.id === tabId ? { ...t, title: newTitle } : t)) }
          : d,
      ),
    )
  }

  function onLitwitsTabDelete(docId: string, tabId: string) {
    setLitwitsDocs((prev) =>
      prev.map((d) => {
        if (d.id !== docId || !d.tabs) return d
        const remaining = d.tabs.filter((t) => t.id !== tabId)
        const newActive = d.activeTabId === tabId ? (remaining[0]?.id ?? null) : d.activeTabId
        return { ...d, tabs: remaining, activeTabId: newActive }
      }),
    )
  }

  function onDocTabReorder(docId: number, reorderedTabs: DocTab[]) {
    setDocs((prev) => prev.map((d) => (d.id === docId ? { ...d, tabs: reorderedTabs } : d)))
    if (currentUser) {
      saveTabOrder(`doc:${currentUser.email}:${docId}`, reorderedTabs.map((t) => t.id))
    }
  }

  function onLitwitsTabReorder(docId: string, reorderedTabs: DocTab[]) {
    setLitwitsDocs((prev) => prev.map((d) => (d.id === docId ? { ...d, tabs: reorderedTabs } : d)))
    saveTabOrder(`litwits:${docId}`, reorderedTabs.map((t) => t.id))
  }

  // Strict render order: Other Documents first, WSC Documents second.
  const LITWITS_CATEGORY_ORDER = ['Other Documents', 'WSC Documents']
  const groupedLitwitsDocs: [string, LitwitsDoc[]][] = (() => {
    const map: Record<string, LitwitsDoc[]> = {}
    for (const doc of litwitsDocs) {
      const cat = doc.category || 'Other Documents'
      if (!map[cat]) map[cat] = []
      map[cat].push(doc)
    }
    const ordered: [string, LitwitsDoc[]][] = []
    for (const cat of LITWITS_CATEGORY_ORDER) {
      if (map[cat]?.length) ordered.push([cat, map[cat]])
    }
    for (const cat of Object.keys(map)) {
      if (!LITWITS_CATEGORY_ORDER.includes(cat)) ordered.push([cat, map[cat]])
    }
    return ordered
  })()

  const docIcons: Record<number, string> = {
    1: '\u{1F3C6}',
    2: '\u270D\uFE0F',
    3: '\u{1F3A4}',
    4: '\u{1F310}',
    5: '\u{1F4DD}',
  }

  // Compose the active content for editor (active tab's content, or top-level)
  const activeContent = selectedDoc
    ? (selectedDoc.tabs && selectedDoc.activeTabId
        ? selectedDoc.tabs.find((t) => t.id === selectedDoc.activeTabId)?.content ?? selectedDoc.content
        : selectedDoc.content)
    : ''
  // Deliberately does NOT include activeTabId — the Editor stays mounted across
  // tab switches and swaps content internally so edits don't get lost on switch.
  const editorKey = selectedDoc
    ? `${currentUser?.email}-${selectedDoc.id}`
    : 'none'

  const activeLitwitsContent = selectedLitwitsDoc
    ? (selectedLitwitsDoc.tabs && selectedLitwitsDoc.activeTabId
        ? selectedLitwitsDoc.tabs.find((t) => t.id === selectedLitwitsDoc.activeTabId)?.content ?? selectedLitwitsDoc.content
        : selectedLitwitsDoc.content)
    : ''
  const litwitsEditorKey = selectedLitwitsDoc
    ? `${selectedLitwitsDoc.id}`
    : 'none'

  return (
    <div className="h-screen bg-gray-50 flex flex-col overflow-hidden">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between flex-none z-20">
        <Wordmark />
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-500 hidden sm:block">{currentUser?.name}</span>
          <button
            onClick={handleLogout}
            className="text-xs text-gray-500 hover:text-[#A52A2A] transition-colors uppercase tracking-wide"
          >
            Logout
          </button>
        </div>
      </header>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-200 px-6 flex gap-0 overflow-x-auto flex-none z-10">
        <TabBtn active={tab === 'documents'} onClick={() => setTab('documents')}>
          My Documents
        </TabBtn>
        <TabBtn active={tab === 'litwits-docs'} onClick={() => setTab('litwits-docs')}>
          LITWITS Documents
        </TabBtn>
      </div>

      {/* My Documents Tab */}
      {tab === 'documents' && (
        <main className="flex-1 min-h-0 flex flex-col">
          {view === 'grid' && (
            <div className="flex-1 min-h-0 overflow-auto">
              <div className="p-6 max-w-6xl mx-auto w-full">
                <h1
                  className="text-2xl font-semibold text-gray-800 mb-6"
                  style={{ fontFamily: '"Playfair Display", serif' }}
                >
                  My Documents
                </h1>
                {loading ? (
                  <p className="text-sm text-gray-400">Loading...</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {docs.map((doc) => (
                      <DocCard
                        key={doc.id}
                        title={doc.title}
                        icon={docIcons[doc.id]}
                        onClick={() => {
                          setSelectedDocId(doc.id)
                          setView('editor')
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {view === 'editor' && selectedDoc && currentUser && (
            <div className="flex-1 min-h-0 flex flex-col">
              <div className="bg-white border-b border-gray-200 px-6 py-2 flex items-center gap-3 flex-none z-10">
                <button
                  onClick={() => setView('grid')}
                  className="text-xs text-gray-500 hover:text-[#A52A2A] transition-colors uppercase tracking-wide flex items-center gap-1"
                >
                  <span>&larr;</span> Back to Documents
                </button>
                <span className="text-xs text-gray-300">|</span>
                <span className="text-xs text-gray-500">{selectedDoc.title}</span>
              </div>
              {/* Document tabs (sub-pages within a document) */}
              <DocumentTabsBar
                tabs={selectedDoc.tabs || null}
                activeTabId={selectedDoc.activeTabId || null}
                canEdit={true}
                onSwitch={(tabId) => {
                  setDocs((prev) =>
                    prev.map((d) => (d.id === selectedDoc.id ? { ...d, activeTabId: tabId } : d)),
                  )
                }}
                onAdd={() => onDocTabAdd(selectedDoc.id)}
                onRename={(tabId, newTitle) => onDocTabRename(selectedDoc.id, tabId, newTitle)}
                onDelete={(tabId) => onDocTabDelete(selectedDoc.id, tabId)}
                onReorder={(reorderedTabs) => onDocTabReorder(selectedDoc.id, reorderedTabs)}
              />
              <div className="flex-1 min-h-0 bg-white">
                <Editor
                  key={editorKey}
                  docId={selectedDoc.id}
                  userEmail={currentUser.email}
                  initialTitle={selectedDoc.title}
                  initialContent={activeContent}
                  userRole="student"
                  currentUserEmail={currentUser.email}
                  currentUserName={currentUser.name}
                  onTitleChange={(t) => handleTitleChange(selectedDoc.id, t)}
                  tabs={selectedDoc.tabs || null}
                  activeTabId={selectedDoc.activeTabId || null}
                  onTabsUpdate={(tabs, activeTabId) => updateDocTabs(selectedDoc.id, tabs, activeTabId)}
                />
              </div>
            </div>
          )}
        </main>
      )}

      {/* LITWITS Documents Tab */}
      {tab === 'litwits-docs' && (
        <main className="flex-1 min-h-0 flex flex-col">
          {litwitsView === 'grid' && (
            <div className="flex-1 min-h-0 overflow-auto">
              <div className="p-6 max-w-6xl mx-auto w-full">
                <h1
                  className="text-2xl font-semibold text-gray-800 mb-6"
                  style={{ fontFamily: '"Playfair Display", serif' }}
                >
                  LITWITS Documents
                </h1>
                {litwitsLoading ? (
                  <p className="text-sm text-gray-400">Loading...</p>
                ) : litwitsDocs.length === 0 ? (
                  <p className="text-sm text-gray-400">No documents assigned yet.</p>
                ) : (
                  <div className="space-y-6">
                    {groupedLitwitsDocs.map(([category, catDocs]) => (
                      <div key={category}>
                        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                          {category}
                        </h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                          {catDocs.map((doc) => (
                            <DocCard
                              key={doc.id}
                              title={doc.title}
                              onClick={() => {
                                setSelectedLitwitsDocId(doc.id)
                                setLitwitsView('editor')
                              }}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {litwitsView === 'editor' && selectedLitwitsDoc && currentUser && (
            <div className="flex-1 min-h-0 flex flex-col">
              <div className="bg-white border-b border-gray-200 px-6 py-2 flex items-center gap-3 flex-none z-10">
                <button
                  onClick={() => setLitwitsView('grid')}
                  className="text-xs text-gray-500 hover:text-[#A52A2A] transition-colors uppercase tracking-wide flex items-center gap-1"
                >
                  <span>&larr;</span> Back to Documents
                </button>
                <span className="text-xs text-gray-300">|</span>
                <span className="text-xs text-gray-500">{selectedLitwitsDoc.title}</span>
              </div>
              <DocumentTabsBar
                tabs={selectedLitwitsDoc.tabs || null}
                activeTabId={selectedLitwitsDoc.activeTabId || null}
                canEdit={true}
                onSwitch={(tabId) => {
                  setLitwitsDocs((prev) =>
                    prev.map((d) =>
                      d.id === selectedLitwitsDoc.id ? { ...d, activeTabId: tabId } : d,
                    ),
                  )
                }}
                onAdd={() => onLitwitsTabAdd(selectedLitwitsDoc.id)}
                onRename={(tabId, newTitle) => onLitwitsTabRename(selectedLitwitsDoc.id, tabId, newTitle)}
                onDelete={(tabId) => onLitwitsTabDelete(selectedLitwitsDoc.id, tabId)}
                onReorder={(reorderedTabs) => onLitwitsTabReorder(selectedLitwitsDoc.id, reorderedTabs)}
              />
              <div className="flex-1 min-h-0 bg-white">
                <Editor
                  key={litwitsEditorKey}
                  docId={selectedLitwitsDoc.id}
                  userEmail={currentUser.email}
                  initialTitle={selectedLitwitsDoc.title}
                  initialContent={activeLitwitsContent}
                  readonly={true}
                  userRole="student"
                  currentUserEmail={currentUser.email}
                  currentUserName={currentUser.name}
                  apiPath="/api/litwits-doc-sync"
                  disableExport={true}
                  disableComments={true}
                  disableSuggestions={true}
                  enableCopyProtection={true}
                  activityLogPath="/api/litwits-doc-activity"
                  tabs={selectedLitwitsDoc.tabs || null}
                  activeTabId={selectedLitwitsDoc.activeTabId || null}
                  onTabsUpdate={(tabs, activeTabId) => {
                    setLitwitsDocs((prev) =>
                      prev.map((d) =>
                        d.id === selectedLitwitsDoc.id ? { ...d, tabs, activeTabId } : d,
                      ),
                    )
                  }}
                />
              </div>
            </div>
          )}
        </main>
      )}
    </div>
  )
}
