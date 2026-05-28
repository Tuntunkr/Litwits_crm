import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState, useEffect, useMemo } from 'react'
import { getUser, clearAuth, apiFetch } from '@/lib/auth'
import { saveTabOrder } from '@/lib/tab-order'
import Editor from '@/components/Editor'
import DocumentTabsBar, { type DocTab } from '@/components/DocumentTabsBar'

export const Route = createFileRoute('/mentor')({
  component: MentorDashboard,
})

type Tab = 'students' | 'my-docs' | 'litwits-docs'
type StudentsView = 'grid' | 'studentDocs' | 'editor'
type DocView = 'grid' | 'editor'

interface StudentRecord {
  name: string
  email: string
  role?: string
}

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

function StudentCard({ name, role, onClick }: { name: string; role?: string; onClick: () => void }) {
  const initials = name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
  return (
    <button
      onClick={onClick}
      className="group bg-white rounded-lg border border-gray-200 hover:border-[#A52A2A] hover:shadow-md transition-all p-5 text-left flex flex-col items-center gap-3"
    >
      <div className="w-14 h-14 rounded-full bg-[#A52A2A]/10 text-[#A52A2A] flex items-center justify-center font-semibold text-lg group-hover:bg-[#A52A2A] group-hover:text-white transition-colors">
        {initials || '?'}
      </div>
      <h3 className="text-sm font-semibold text-gray-800 text-center leading-tight">{name}</h3>
      {role && <p className="text-[10px] uppercase tracking-wide text-gray-400">{role}</p>}
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

const DOC_ICONS: Record<number, string> = {
  1: '\u{1F3C6}',
  2: '\u270D\uFE0F',
  3: '\u{1F3A4}',
  4: '\u{1F310}',
  5: '\u{1F4DD}',
}

export default function MentorDashboard() {
  const navigate = useNavigate()
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [tab, setTab] = useState<Tab>('students')

  // Students flow
  const [students, setStudents] = useState<StudentRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [studentsView, setStudentsView] = useState<StudentsView>('grid')
  const [selectedStudent, setSelectedStudent] = useState<StudentRecord | null>(null)
  const [docs, setDocs] = useState<DocRecord[]>([])
  const [selectedDocId, setSelectedDocId] = useState<number | null>(null)
  const [docsLoading, setDocsLoading] = useState(false)

  // Mentor docs flow (own documents)
  const [mentorDocs, setMentorDocs] = useState<DocRecord[]>([])
  const [mentorDocsLoading, setMentorDocsLoading] = useState(false)
  const [mentorDocView, setMentorDocView] = useState<DocView>('grid')
  const [selectedMentorDocId, setSelectedMentorDocId] = useState<number | null>(null)

  // LITWITS docs flow
  const [litwitsDocs, setLitwitsDocs] = useState<LitwitsDoc[]>([])
  const [litwitsLoading, setLitwitsLoading] = useState(false)
  const [litwitsView, setLitwitsView] = useState<DocView>('grid')
  const [selectedLitwitsDocId, setSelectedLitwitsDocId] = useState<string | null>(null)

  useEffect(() => {
    const u = getUser()
    if (!u || u.role !== 'mentor') {
      navigate({ to: '/login' })
      return
    }
    setCurrentUser(u)
    fetchStudents()
    fetchLitwitsDocs()
    fetchMentorDocs(u.email)
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

  async function fetchStudents() {
    setLoading(true)
    try {
      const res = await apiFetch('/api/users')
      const data = await res.json()
      setStudents(data.users || [])
    } catch {
      setStudents([])
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

  async function fetchMentorDocs(email: string) {
    setMentorDocsLoading(true)
    try {
      const res = await apiFetch(`/api/mentor-documents?email=${encodeURIComponent(email)}`)
      const data = await res.json()
      setMentorDocs(data.documents || [])
    } catch {
      setMentorDocs([])
    } finally {
      setMentorDocsLoading(false)
    }
  }

  async function loadStudentDocs(student: StudentRecord) {
    setSelectedStudent(student)
    setSelectedDocId(null)
    setStudentsView('studentDocs')
    setDocsLoading(true)
    try {
      const res = await apiFetch(`/api/documents?email=${encodeURIComponent(student.email)}`)
      const data = await res.json()
      setDocs(data.documents || [])
    } catch {
      setDocs([])
    } finally {
      setDocsLoading(false)
    }
  }

  async function handleLogout() {
    await apiFetch('/api/auth', { method: 'DELETE' })
    clearAuth()
    navigate({ to: '/login' })
  }

  const selectedStudentDoc = useMemo(
    () => docs.find((d) => d.id === selectedDocId) ?? null,
    [docs, selectedDocId],
  )
  const selectedMentorDoc = useMemo(
    () => mentorDocs.find((d) => d.id === selectedMentorDocId) ?? null,
    [mentorDocs, selectedMentorDocId],
  )
  const selectedLitwitsDoc = useMemo(
    () => litwitsDocs.find((d) => d.id === selectedLitwitsDocId) ?? null,
    [litwitsDocs, selectedLitwitsDocId],
  )

  // Student docs: tabs handlers
  function onStudentTabsUpdate(docId: number, tabs: DocTab[], activeTabId: string) {
    setDocs((prev) => prev.map((d) => (d.id === docId ? { ...d, tabs, activeTabId } : d)))
  }
  function onStudentTabAdd(docId: number) {
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
  function onStudentTabRename(docId: number, tabId: string, newTitle: string) {
    setDocs((prev) =>
      prev.map((d) =>
        d.id === docId && d.tabs
          ? { ...d, tabs: d.tabs.map((t) => (t.id === tabId ? { ...t, title: newTitle } : t)) }
          : d,
      ),
    )
  }
  function onStudentTabDelete(docId: number, tabId: string) {
    setDocs((prev) =>
      prev.map((d) => {
        if (d.id !== docId || !d.tabs) return d
        const remaining = d.tabs.filter((t) => t.id !== tabId)
        const newActive = d.activeTabId === tabId ? (remaining[0]?.id ?? null) : d.activeTabId
        return { ...d, tabs: remaining, activeTabId: newActive }
      }),
    )
  }

  // Mentor docs: tabs handlers
  function onMentorTabsUpdate(docId: number, tabs: DocTab[], activeTabId: string) {
    setMentorDocs((prev) => prev.map((d) => (d.id === docId ? { ...d, tabs, activeTabId } : d)))
  }
  function onMentorTabAdd(docId: number) {
    setMentorDocs((prev) =>
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
  function onMentorTabRename(docId: number, tabId: string, newTitle: string) {
    setMentorDocs((prev) =>
      prev.map((d) =>
        d.id === docId && d.tabs
          ? { ...d, tabs: d.tabs.map((t) => (t.id === tabId ? { ...t, title: newTitle } : t)) }
          : d,
      ),
    )
  }
  function onMentorTabDelete(docId: number, tabId: string) {
    setMentorDocs((prev) =>
      prev.map((d) => {
        if (d.id !== docId || !d.tabs) return d
        const remaining = d.tabs.filter((t) => t.id !== tabId)
        const newActive = d.activeTabId === tabId ? (remaining[0]?.id ?? null) : d.activeTabId
        return { ...d, tabs: remaining, activeTabId: newActive }
      }),
    )
  }

  function onStudentTabReorder(docId: number, reorderedTabs: DocTab[]) {
    setDocs((prev) => prev.map((d) => (d.id === docId ? { ...d, tabs: reorderedTabs } : d)))
    if (selectedStudent) {
      saveTabOrder(`doc:${selectedStudent.email}:${docId}`, reorderedTabs.map((t) => t.id))
    }
  }

  function onMentorTabReorder(docId: number, reorderedTabs: DocTab[]) {
    setMentorDocs((prev) => prev.map((d) => (d.id === docId ? { ...d, tabs: reorderedTabs } : d)))
    if (currentUser) {
      saveTabOrder(`mentor:${currentUser.email}:${docId}`, reorderedTabs.map((t) => t.id))
    }
  }

  function onLitwitsTabReorder(docId: string, reorderedTabs: DocTab[]) {
    setLitwitsDocs((prev) => prev.map((d) => (d.id === docId ? { ...d, tabs: reorderedTabs } : d)))
    saveTabOrder(`litwits:${docId}`, reorderedTabs.map((t) => t.id))
  }

  const studentDocActiveContent = selectedStudentDoc
    ? (selectedStudentDoc.tabs && selectedStudentDoc.activeTabId
        ? selectedStudentDoc.tabs.find((t) => t.id === selectedStudentDoc.activeTabId)?.content ?? selectedStudentDoc.content
        : selectedStudentDoc.content)
    : ''
  // Deliberately does NOT include activeTabId — the Editor stays mounted across
  // tab switches and swaps content internally so edits don't get lost on switch.
  const studentDocEditorKey = selectedStudentDoc && selectedStudent
    ? `${selectedStudent.email}-${selectedStudentDoc.id}`
    : 'none'

  const mentorDocActiveContent = selectedMentorDoc
    ? (selectedMentorDoc.tabs && selectedMentorDoc.activeTabId
        ? selectedMentorDoc.tabs.find((t) => t.id === selectedMentorDoc.activeTabId)?.content ?? selectedMentorDoc.content
        : selectedMentorDoc.content)
    : ''
  const mentorDocEditorKey = selectedMentorDoc && currentUser
    ? `${currentUser.email}-m-${selectedMentorDoc.id}`
    : 'none'

  const activeLitwitsContent = selectedLitwitsDoc
    ? (selectedLitwitsDoc.tabs && selectedLitwitsDoc.activeTabId
        ? selectedLitwitsDoc.tabs.find((t) => t.id === selectedLitwitsDoc.activeTabId)?.content ?? selectedLitwitsDoc.content
        : selectedLitwitsDoc.content)
    : ''
  const litwitsEditorKey = selectedLitwitsDoc
    ? `${selectedLitwitsDoc.id}`
    : 'none'

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

  return (
    <div className="h-screen bg-gray-50 flex flex-col overflow-hidden">
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

      <div className="bg-white border-b border-gray-200 px-6 flex gap-0 overflow-x-auto flex-none z-10">
        <TabBtn active={tab === 'students'} onClick={() => setTab('students')}>My Students</TabBtn>
        <TabBtn active={tab === 'my-docs'} onClick={() => setTab('my-docs')}>Mentor Documents</TabBtn>
        <TabBtn active={tab === 'litwits-docs'} onClick={() => setTab('litwits-docs')}>LITWITS Documents</TabBtn>
      </div>

      {/* Students Tab */}
      {tab === 'students' && (
        <main className="flex-1 min-h-0 flex flex-col">
          {studentsView === 'grid' && (
            <div className="flex-1 min-h-0 overflow-auto p-6"><div className="max-w-7xl mx-auto w-full">
              <h1 className="text-2xl font-semibold text-gray-800 mb-6" style={{ fontFamily: '"Playfair Display", serif' }}>
                My Students
              </h1>
              {loading ? (
                <p className="text-sm text-gray-400">Loading...</p>
              ) : students.length === 0 ? (
                <p className="text-sm text-gray-400">No students assigned yet.</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {students.map((s) => (
                    <StudentCard
                      key={s.email}
                      name={s.name}
                      role={s.role}
                      onClick={() => loadStudentDocs(s)}
                    />
                  ))}
                </div>
              )}
            </div></div>
          )}

          {studentsView === 'studentDocs' && selectedStudent && (
            <div className="flex-1 min-h-0 overflow-auto p-6"><div className="max-w-6xl mx-auto w-full">
              <div className="flex items-center gap-3 mb-6">
                <button
                  onClick={() => {
                    setStudentsView('grid')
                    setSelectedStudent(null)
                    setSelectedDocId(null)
                  }}
                  className="text-xs text-gray-500 hover:text-[#A52A2A] transition-colors uppercase tracking-wide"
                >
                  &larr; Back to Students
                </button>
              </div>
              <h1 className="text-2xl font-semibold text-gray-800 mb-2" style={{ fontFamily: '"Playfair Display", serif' }}>
                {selectedStudent.name}
              </h1>
              <p className="text-sm text-gray-500 mb-6">Documents</p>
              {docsLoading ? (
                <p className="text-sm text-gray-400">Loading...</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {docs.map((doc) => (
                    <DocCard
                      key={doc.id}
                      title={doc.title}
                      icon={DOC_ICONS[doc.id]}
                      onClick={() => {
                        setSelectedDocId(doc.id)
                        setStudentsView('editor')
                      }}
                    />
                  ))}
                </div>
              )}
            </div></div>
          )}

          {studentsView === 'editor' && selectedStudent && selectedStudentDoc && currentUser && (
            <div className="flex-1 min-h-0 flex flex-col">
              <div className="bg-white border-b border-gray-200 px-6 py-2 flex items-center gap-3 flex-none z-10">
                <button
                  onClick={() => setStudentsView('studentDocs')}
                  className="text-xs text-gray-500 hover:text-[#A52A2A] uppercase tracking-wide"
                >
                  &larr; Back to {selectedStudent.name}'s Documents
                </button>
                <span className="text-xs text-gray-300">|</span>
                <span className="text-xs text-gray-500">Editing {selectedStudent.name} - {selectedStudentDoc.title}</span>
              </div>
              <DocumentTabsBar
                tabs={selectedStudentDoc.tabs || null}
                activeTabId={selectedStudentDoc.activeTabId || null}
                canEdit={true}
                onSwitch={(tabId) => {
                  setDocs((prev) =>
                    prev.map((d) =>
                      d.id === selectedStudentDoc.id ? { ...d, activeTabId: tabId } : d,
                    ),
                  )
                }}
                onAdd={() => onStudentTabAdd(selectedStudentDoc.id)}
                onRename={(tabId, newTitle) => onStudentTabRename(selectedStudentDoc.id, tabId, newTitle)}
                onDelete={(tabId) => onStudentTabDelete(selectedStudentDoc.id, tabId)}
                onReorder={(reorderedTabs) => onStudentTabReorder(selectedStudentDoc.id, reorderedTabs)}
              />
              <div className="flex-1 min-h-0 bg-white">
                <Editor
                  key={studentDocEditorKey}
                  docId={selectedStudentDoc.id}
                  userEmail={selectedStudent.email}
                  initialTitle={selectedStudentDoc.title}
                  initialContent={studentDocActiveContent}
                  userRole="mentor"
                  currentUserEmail={currentUser.email}
                  currentUserName={currentUser.name}
                  tabs={selectedStudentDoc.tabs || null}
                  activeTabId={selectedStudentDoc.activeTabId || null}
                  onTabsUpdate={(tabs, activeTabId) =>
                    onStudentTabsUpdate(selectedStudentDoc.id, tabs, activeTabId)
                  }
                />
              </div>
            </div>
          )}
        </main>
      )}

      {/* Mentor Documents Tab */}
      {tab === 'my-docs' && (
        <main className="flex-1 min-h-0 flex flex-col">
          {mentorDocView === 'grid' && (
            <div className="flex-1 min-h-0 overflow-auto p-6"><div className="max-w-6xl mx-auto w-full">
              <h1 className="text-2xl font-semibold text-gray-800 mb-2" style={{ fontFamily: '"Playfair Display", serif' }}>
                Mentor Documents
              </h1>
              <p className="text-sm text-gray-500 mb-6">Your private workspace (not visible to students)</p>
              {mentorDocsLoading ? (
                <p className="text-sm text-gray-400">Loading...</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {mentorDocs.map((doc) => (
                    <DocCard
                      key={doc.id}
                      title={doc.title}
                      onClick={() => {
                        setSelectedMentorDocId(doc.id)
                        setMentorDocView('editor')
                      }}
                    />
                  ))}
                </div>
              )}
            </div></div>
          )}

          {mentorDocView === 'editor' && selectedMentorDoc && currentUser && (
            <div className="flex-1 min-h-0 flex flex-col">
              <div className="bg-white border-b border-gray-200 px-6 py-2 flex items-center gap-3 flex-none z-10">
                <button
                  onClick={() => setMentorDocView('grid')}
                  className="text-xs text-gray-500 hover:text-[#A52A2A] uppercase tracking-wide"
                >
                  &larr; Back to Mentor Documents
                </button>
                <span className="text-xs text-gray-300">|</span>
                <span className="text-xs text-gray-500">{selectedMentorDoc.title}</span>
              </div>
              <DocumentTabsBar
                tabs={selectedMentorDoc.tabs || null}
                activeTabId={selectedMentorDoc.activeTabId || null}
                canEdit={true}
                onSwitch={(tabId) => {
                  setMentorDocs((prev) =>
                    prev.map((d) =>
                      d.id === selectedMentorDoc.id ? { ...d, activeTabId: tabId } : d,
                    ),
                  )
                }}
                onAdd={() => onMentorTabAdd(selectedMentorDoc.id)}
                onRename={(tabId, newTitle) => onMentorTabRename(selectedMentorDoc.id, tabId, newTitle)}
                onDelete={(tabId) => onMentorTabDelete(selectedMentorDoc.id, tabId)}
                onReorder={(reorderedTabs) => onMentorTabReorder(selectedMentorDoc.id, reorderedTabs)}
              />
              <div className="flex-1 min-h-0 bg-white">
                <Editor
                  key={mentorDocEditorKey}
                  docId={selectedMentorDoc.id}
                  userEmail={currentUser.email}
                  initialTitle={selectedMentorDoc.title}
                  initialContent={mentorDocActiveContent}
                  userRole="mentor"
                  currentUserEmail={currentUser.email}
                  currentUserName={currentUser.name}
                  apiPath="/api/mentor-documents"
                  disableExport={true}
                  tabs={selectedMentorDoc.tabs || null}
                  activeTabId={selectedMentorDoc.activeTabId || null}
                  onTabsUpdate={(tabs, activeTabId) =>
                    onMentorTabsUpdate(selectedMentorDoc.id, tabs, activeTabId)
                  }
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
            <div className="flex-1 min-h-0 overflow-auto p-6"><div className="max-w-6xl mx-auto w-full">
              <h1 className="text-2xl font-semibold text-gray-800 mb-6" style={{ fontFamily: '"Playfair Display", serif' }}>
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
                      <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">{category}</h2>
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
            </div></div>
          )}

          {litwitsView === 'editor' && selectedLitwitsDoc && currentUser && (
            <div className="flex-1 min-h-0 flex flex-col">
              <div className="bg-white border-b border-gray-200 px-6 py-2 flex items-center gap-3 flex-none z-10">
                <button
                  onClick={() => setLitwitsView('grid')}
                  className="text-xs text-gray-500 hover:text-[#A52A2A] uppercase tracking-wide"
                >
                  &larr; Back to Documents
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
                onAdd={() => {
                  const title = window.prompt('New tab name:', 'New Tab')
                  if (!title) return
                  setLitwitsDocs((prev) =>
                    prev.map((d) => {
                      if (d.id !== selectedLitwitsDoc.id) return d
                      const currentTabs: DocTab[] = d.tabs && d.tabs.length > 0
                        ? d.tabs
                        : [{ id: 'main', title: 'Main', content: d.content || '' }]
                      const newTab: DocTab = { id: `tab-${Date.now()}`, title, content: '' }
                      return { ...d, tabs: [...currentTabs, newTab], activeTabId: newTab.id }
                    }),
                  )
                }}
                onRename={(tabId, newTitle) => {
                  setLitwitsDocs((prev) =>
                    prev.map((d) =>
                      d.id === selectedLitwitsDoc.id && d.tabs
                        ? { ...d, tabs: d.tabs.map((t) => (t.id === tabId ? { ...t, title: newTitle } : t)) }
                        : d,
                    ),
                  )
                }}
                onDelete={(tabId) => {
                  setLitwitsDocs((prev) =>
                    prev.map((d) => {
                      if (d.id !== selectedLitwitsDoc.id || !d.tabs) return d
                      const remaining = d.tabs.filter((t) => t.id !== tabId)
                      const newActive = d.activeTabId === tabId ? (remaining[0]?.id ?? null) : d.activeTabId
                      return { ...d, tabs: remaining, activeTabId: newActive }
                    }),
                  )
                }}
                onReorder={(reorderedTabs) => onLitwitsTabReorder(selectedLitwitsDoc.id, reorderedTabs)}
              />
              <div className="flex-1 min-h-0 bg-white">
                <Editor
                  key={litwitsEditorKey}
                  docId={selectedLitwitsDoc.id}
                  userEmail={currentUser.email}
                  initialTitle={selectedLitwitsDoc.title}
                  initialContent={activeLitwitsContent}
                  userRole="mentor"
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
