import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import { TextStyle } from '@tiptap/extension-text-style'
import FontFamily from '@tiptap/extension-font-family'
import { Color } from '@tiptap/extension-color'
import Highlight from '@tiptap/extension-highlight'
import TextAlign from '@tiptap/extension-text-align'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import { Table } from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import Link from '@tiptap/extension-link'
import ImageExt from '@tiptap/extension-image'
import HorizontalRule from '@tiptap/extension-horizontal-rule'
import Placeholder from '@tiptap/extension-placeholder'
import CharacterCount from '@tiptap/extension-character-count'
import Subscript from '@tiptap/extension-subscript'
import Superscript from '@tiptap/extension-superscript'
import { Extension, Mark } from '@tiptap/core'
import { apiFetch } from '@/lib/auth'
import CommentPanel from './CommentPanel'
import SuggestionPanel from './SuggestionPanel'

// Custom font-size extension
const FontSize = Extension.create({
  name: 'fontSize',
  addGlobalAttributes() {
    return [{
      types: ['textStyle'],
      attributes: {
        fontSize: {
          default: null,
          parseHTML: (el: HTMLElement) => el.style.fontSize || null,
          renderHTML: (attrs: Record<string, any>) =>
            attrs.fontSize ? { style: `font-size: ${attrs.fontSize}` } : {},
        },
      },
    }]
  },
  addCommands() {
    return {
      setFontSize: (size: string) => ({ chain }: any) =>
        chain().setMark('textStyle', { fontSize: size }).run(),
      unsetFontSize: () => ({ chain }: any) =>
        chain().setMark('textStyle', { fontSize: null }).removeEmptyTextStyle().run(),
    } as any
  },
})

// Custom line-spacing extension
const LineHeight = Extension.create({
  name: 'lineHeight',
  addGlobalAttributes() {
    return [{
      types: ['paragraph', 'heading'],
      attributes: {
        lineHeight: {
          default: null,
          parseHTML: (el: HTMLElement) => el.style.lineHeight || null,
          renderHTML: (attrs: Record<string, any>) =>
            attrs.lineHeight ? { style: `line-height: ${attrs.lineHeight}` } : {},
        },
      },
    }]
  },
  addCommands() {
    return {
      setLineHeight: (height: string) => ({ commands }: any) =>
        commands.updateAttributes('paragraph', { lineHeight: height }) &&
        commands.updateAttributes('heading', { lineHeight: height }),
    } as any
  },
})

// Comment mark for highlighting commented text
const CommentMark = Mark.create({
  name: 'comment',
  addAttributes() {
    return {
      commentId: { default: null },
    }
  },
  parseHTML() {
    return [{ tag: 'span[data-comment-id]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['span', {
      'data-comment-id': HTMLAttributes.commentId,
      class: 'comment-highlight',
      style: 'background-color: #fff3cd; border-bottom: 2px solid #ffc107; cursor: pointer;',
    }, 0]
  },
})

// Suggestion mark for tracked changes
const SuggestionMark = Mark.create({
  name: 'suggestion',
  addAttributes() {
    return {
      suggestionId: { default: null },
      type: { default: 'insert' },
    }
  },
  parseHTML() {
    return [{ tag: 'span[data-suggestion-id]' }]
  },
  renderHTML({ HTMLAttributes }) {
    const isInsert = HTMLAttributes.type === 'insert'
    return ['span', {
      'data-suggestion-id': HTMLAttributes.suggestionId,
      'data-suggestion-type': HTMLAttributes.type,
      class: `suggestion-mark suggestion-${HTMLAttributes.type}`,
      style: isInsert
        ? 'background-color: #d4edda; text-decoration: none; border-bottom: 2px solid #28a745;'
        : 'background-color: #f8d7da; text-decoration: line-through; border-bottom: 2px solid #dc3545;',
    }, 0]
  },
})

const FONT_FAMILIES = [
  { label: 'Default', value: '' },
  { label: 'Playfair Display', value: '"Playfair Display", serif' },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Arial', value: 'Arial, sans-serif' },
  { label: 'Courier New', value: '"Courier New", monospace' },
  { label: 'Times New Roman', value: '"Times New Roman", serif' },
  { label: 'Verdana', value: 'Verdana, sans-serif' },
  { label: 'Trebuchet MS', value: '"Trebuchet MS", sans-serif' },
]

const FONT_SIZES = ['8px','9px','10px','11px','12px','14px','16px','18px','20px','24px','28px','32px','36px','48px','64px','72px']

const HEADING_OPTIONS = [
  { label: 'Normal', value: 'paragraph' },
  { label: 'Heading 1', value: 'h1' },
  { label: 'Heading 2', value: 'h2' },
  { label: 'Heading 3', value: 'h3' },
  { label: 'Heading 4', value: 'h4' },
  { label: 'Heading 5', value: 'h5' },
  { label: 'Heading 6', value: 'h6' },
  { label: 'Quote', value: 'blockquote' },
]

const LINE_SPACING_OPTIONS = [
  { label: '1.0', value: '1' },
  { label: '1.15', value: '1.15' },
  { label: '1.5', value: '1.5' },
  { label: '2.0', value: '2' },
]

const PAGE_SIZES: Record<string, { width: string; height: string }> = {
  A4: { width: '210mm', height: '297mm' },
  Letter: { width: '8.5in', height: '11in' },
}

const TEXT_COLORS = [
  '#000000', '#434343', '#666666', '#999999', '#cccccc',
  '#A52A2A', '#e74c3c', '#e67e22', '#f1c40f', '#2ecc71',
  '#1abc9c', '#3498db', '#2980b9', '#9b59b6', '#8e44ad',
]

const HIGHLIGHT_COLORS = [
  'transparent', '#fff3cd', '#d4edda', '#d1ecf1', '#f8d7da',
  '#fce4ec', '#e8eaf6', '#e0f2f1', '#fff9c4', '#f3e5f5',
]

const SPECIAL_CHARACTERS = [
  '&', '@', '#', '$', '%', '^', '*', '+', '=', '~',
  '\u00A9', '\u00AE', '\u2122', '\u00B0', '\u00B1', '\u00D7', '\u00F7',
  '\u2013', '\u2014', '\u2018', '\u2019', '\u201C', '\u201D',
  '\u2026', '\u2022', '\u00A7', '\u00B6', '\u00AB', '\u00BB',
  '\u221A', '\u221E', '\u2248', '\u2260', '\u2264', '\u2265',
  '\u03B1', '\u03B2', '\u03B3', '\u03B4', '\u03C0', '\u03A3',
  '\u20AC', '\u00A3', '\u00A5', '\u00A2', '\u20B9',
]

export interface EditorProps {
  docId: number | string
  userEmail: string
  initialTitle: string
  initialContent: string
  readonly?: boolean
  userRole: 'admin' | 'mentor' | 'student'
  currentUserEmail: string
  currentUserName: string
  onTitleChange?: (title: string) => void
  tabs?: { id: string; title: string; content: string }[] | null
  activeTabId?: string | null
  onTabsUpdate?: (tabs: { id: string; title: string; content: string }[], activeTabId: string) => void
  apiPath?: string
  disableExport?: boolean
  disableComments?: boolean
  disableSuggestions?: boolean
  enableCopyProtection?: boolean
  activityLogPath?: string
}

function ToolbarBtn({ active, onClick, children, title, disabled }: {
  active?: boolean; onClick: () => void; children: React.ReactNode; title?: string; disabled?: boolean
}) {
  return (
    <button type="button" title={title} onClick={onClick} disabled={disabled}
      className={`px-2 py-1 text-xs rounded transition-colors border ${
        disabled ? 'opacity-40 cursor-not-allowed bg-gray-50 border-gray-100 text-gray-400' :
        active ? 'bg-[#A52A2A] text-white border-[#A52A2A]' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-100'
      }`}>
      {children}
    </button>
  )
}

function ToolbarSelect({ value, onChange, options, title, className }: {
  value: string; onChange: (v: string) => void; options: { label: string; value: string }[]; title?: string; className?: string
}) {
  return (
    <select title={title} value={value} onChange={e => onChange(e.target.value)}
      className={`text-xs border border-gray-200 rounded px-1.5 py-1 bg-white text-gray-700 ${className || ''}`}>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

function ToolbarDivider() {
  return <div className="w-px h-6 bg-gray-300 mx-0.5" />
}

export default function Editor({
  docId, userEmail, initialTitle, initialContent, readonly = false,
  userRole, currentUserEmail, currentUserName, onTitleChange,
  tabs, activeTabId, onTabsUpdate, apiPath,
  disableExport = false, disableComments = false, disableSuggestions = false,
  enableCopyProtection = false, activityLogPath,
}: EditorProps) {
  const [title, setTitle] = useState(initialTitle)
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved')
  const titleRef = useRef(initialTitle)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingContentRef = useRef<string | null>(null)
  const tabsRef = useRef(tabs || null)
  const activeTabIdRef = useRef(activeTabId || null)
  // Tracks the last observed tab-structure signature and active tab id. A
  // mismatch with the incoming props means the user (or a remote editor)
  // added, deleted, renamed, or switched a tab — we flush an immediate save
  // so the structural edit is persisted even when no typing event fires.
  const prevTabsSignatureRef = useRef<string | null>(null)
  const prevActiveTabIdRef = useRef<string | null>(null)

  // Keep refs in sync
  useEffect(() => { tabsRef.current = tabs || null }, [tabs])
  useEffect(() => { activeTabIdRef.current = activeTabId || null }, [activeTabId])

  // Panels
  const [showComments, setShowComments] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [showOutline, setShowOutline] = useState(false)
  const [showInsertMenu, setShowInsertMenu] = useState(false)
  const [showSymbols, setShowSymbols] = useState(false)
  const [showPageSettings, setShowPageSettings] = useState(false)
  const [suggestionMode, setSuggestionMode] = useState(false)

  // Focus mode: which heading index is focused (null = show all)
  const [focusedSection, setFocusedSection] = useState<number | null>(null)

  // Real-time sync
  const [syncVersion, setSyncVersion] = useState(0)
  const [lastRemoteEdit, setLastRemoteEdit] = useState('')
  const isSyncing = useRef(false)
  const localEditPending = useRef(false)

  // Page settings
  const [pageSize, setPageSize] = useState<'A4' | 'Letter'>('A4')
  const [pageOrientation, setPageOrientation] = useState<'portrait' | 'landscape'>('portrait')
  const [margins, setMargins] = useState({ top: 25, bottom: 25, left: 25, right: 25 })

  // Voice typing
  const [isListening, setIsListening] = useState(false)
  const recognitionRef = useRef<any>(null)

  // Container ref used for copy-protection + screenshot blur
  const containerRef = useRef<HTMLDivElement>(null)
  const [securityWarning, setSecurityWarning] = useState('')
  const copyProtected = enableCopyProtection && userRole !== 'admin'

  // Mentors default to suggestion mode
  useEffect(() => {
    if (userRole === 'mentor') setSuggestionMode(true)
  }, [userRole])

  const doSave = useCallback(async (content: string) => {
    setSaveStatus('saving')
    try {
      const currentTabs = tabsRef.current
      const currentActiveTabId = activeTabIdRef.current
      const path = apiPath || '/api/doc-sync'
      const isLitwits = path.includes('litwits-doc-sync')
      const isMentorDocs = path.includes('mentor-documents')
      const body: any = isLitwits
        ? { docId, title: titleRef.current, content }
        : { email: userEmail, docId, title: titleRef.current, content }
      // Each tab keeps its own content. Only the active tab receives the
      // current editor HTML; the rest stay untouched so switching tabs never
      // leaks content across them.
      if (currentTabs && currentActiveTabId) {
        const updatedTabs = currentTabs.map((t) =>
          t.id === currentActiveTabId ? { ...t, content } : t,
        )
        body.tabs = updatedTabs
        body.activeTabId = currentActiveTabId
        // Keep parent state in sync so a tab switch loads the latest edit.
        if (onTabsUpdate) onTabsUpdate(updatedTabs, currentActiveTabId)
      }
      console.log('Saving:', {
        docId,
        activeTabId: body.activeTabId ?? null,
        tabs: body.tabs ?? null,
        contentLength: typeof content === 'string' ? content.length : 0,
      })
      const method = isMentorDocs ? 'PUT' : 'POST'
      const res = await apiFetch(path, {
        method,
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (data.version) {
        setSyncVersion(data.version)
      }
      setSaveStatus('saved')
    } catch {
      setSaveStatus('unsaved')
    }
  }, [userEmail, docId, apiPath, onTabsUpdate])

  const scheduleSave = useCallback((content: string) => {
    setSaveStatus('unsaved')
    localEditPending.current = true
    pendingContentRef.current = content
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      doSave(content)
      localEditPending.current = false
      pendingContentRef.current = null
    }, 700)
  }, [doSave])

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4, 5, 6] },
      }),
      Underline,
      TextStyle,
      FontFamily,
      FontSize,
      LineHeight,
      Color,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
      Link.configure({ openOnClick: false }),
      ImageExt.configure({ inline: true, allowBase64: true }),
      HorizontalRule,
      Placeholder.configure({ placeholder: 'Start writing...' }),
      CharacterCount,
      Subscript,
      Superscript,
      CommentMark,
      SuggestionMark,
    ],
    content: initialContent,
    editable: !readonly,
    onUpdate: ({ editor: ed }) => {
      if (readonly) return
      if (!isSyncing.current) {
        scheduleSave(ed.getHTML())
      }
    },
  })

  useEffect(() => {
    if (editor && initialContent !== editor.getHTML()) {
      isSyncing.current = true
      editor.commands.setContent(initialContent || '<p></p>')
      isSyncing.current = false
    }
    setTitle(initialTitle)
    titleRef.current = initialTitle
    setSaveStatus('saved')
    setSyncVersion(0)
    setLastRemoteEdit('')
    setFocusedSection(null)
    // Prime the structural-change signatures with the initial tab state so the
    // first render after a doc load never fires a spurious save.
    prevTabsSignatureRef.current = tabs
      ? tabs.map((t) => `${t.id}:${t.title}`).join('|')
      : ''
    prevActiveTabIdRef.current = activeTabId ?? null
  }, [docId, userEmail])

  // Handle tab switches and structural changes (add / delete / rename) while
  // the Editor stays mounted. The editor no longer re-mounts on a tab switch,
  // so we manage content swapping here instead of relying on React remount.
  //
  //   - Switch: write the current editor HTML into the OLD tab (if it still
  //     exists), then load the NEW tab's content into the editor.
  //   - Any change: fire an immediate save so the server sees the new tab
  //     structure even if the user never types afterward. Without this, a
  //     deleted tab would come back on reload.
  useEffect(() => {
    if (!editor) return
    const tabsSig = tabs ? tabs.map((t) => `${t.id}:${t.title}`).join('|') : ''
    const activeId = activeTabId ?? null

    // Prime on first observation (doc-load effect may not have set these yet
    // if it ran in a different render batch).
    if (prevTabsSignatureRef.current === null) {
      prevTabsSignatureRef.current = tabsSig
      prevActiveTabIdRef.current = activeId
      return
    }

    const prevTabsSig = prevTabsSignatureRef.current
    const prevActive = prevActiveTabIdRef.current
    const tabsChanged = tabsSig !== prevTabsSig
    const activeChanged = activeId !== prevActive
    if (!tabsChanged && !activeChanged) return

    // On switch: preserve the old tab's current HTML, then swap editor content
    // to the new tab. Content isolation: each tab keeps its own text.
    if (activeChanged) {
      const currentHTML = editor.getHTML()
      if (!readonly && tabs) {
        if (prevActive) {
          const oldStillExists = tabs.some((t) => t.id === prevActive)
          if (oldStillExists) {
            const mergedTabs = tabs.map((t) =>
              t.id === prevActive ? { ...t, content: currentHTML } : t,
            )
            tabsRef.current = mergedTabs
            if (onTabsUpdate) onTabsUpdate(mergedTabs, activeId ?? '')
          }
        } else {
          // First-ever transition into tab mode: before tabs existed the
          // editor's HTML *was* the document body. The parent seeded the new
          // "main" tab from a possibly-stale `d.content`, so overwrite it
          // with the live editor HTML to preserve in-flight edits.
          const targetId =
            tabs.find((t) => t.id === 'main' && t.id !== activeId)?.id ??
            tabs.find((t) => t.id !== activeId)?.id
          if (targetId) {
            const mergedTabs = tabs.map((t) =>
              t.id === targetId ? { ...t, content: currentHTML } : t,
            )
            tabsRef.current = mergedTabs
            if (onTabsUpdate) onTabsUpdate(mergedTabs, activeId ?? '')
          }
        }
      }
      const freshTabs = tabsRef.current ?? tabs
      const newTab = activeId ? freshTabs?.find((t) => t.id === activeId) : null
      if (newTab) {
        const newHTML = newTab.content || '<p></p>'
        if (editor.getHTML() !== newHTML) {
          isSyncing.current = true
          editor.commands.setContent(newHTML)
          isSyncing.current = false
        }
      }
    }

    prevTabsSignatureRef.current = tabsSig
    prevActiveTabIdRef.current = activeId

    if (readonly) return

    // Cancel any debounced typing save; we're about to write the authoritative
    // state for this tab set.
    if (saveTimer.current) {
      clearTimeout(saveTimer.current)
      saveTimer.current = null
    }
    pendingContentRef.current = null
    // Mark a local edit in-flight so concurrent pollSync calls don't stomp on
    // our freshly-modified tab set before the server acknowledges it.
    localEditPending.current = true
    const html = editor.getHTML()
    doSave(html).finally(() => {
      setTimeout(() => {
        localEditPending.current = false
      }, 300)
    })
  }, [tabs, activeTabId, editor, readonly, doSave, onTabsUpdate])

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
      // Flush any pending edits so switching tabs (or leaving the editor)
      // never discards in-flight changes to the active tab.
      const pending = pendingContentRef.current
      if (pending !== null) {
        doSave(pending)
        pendingContentRef.current = null
      }
    }
  }, [doSave])

  // Real-time sync: poll for remote changes
  useEffect(() => {
    if (!editor) return
    const path = apiPath || '/api/doc-sync'
    const isLitwits = path.includes('litwits-doc-sync')
    const isStudentDocSync = !apiPath || apiPath === '/api/doc-sync' || (apiPath.includes('doc-sync') && !isLitwits)
    // mentor-documents has no polling
    if (!isLitwits && !isStudentDocSync) return
    let cancelled = false

    const pollSync = async () => {
      if (cancelled || isSyncing.current) return
      try {
        const url = isLitwits
          ? `/api/litwits-doc-sync?docId=${encodeURIComponent(String(docId))}&since=${syncVersion}`
          : `/api/doc-sync?email=${encodeURIComponent(userEmail)}&docId=${docId}&since=${syncVersion}`
        const res = await apiFetch(url)
        const data = await res.json()
        if (cancelled) return

        if (data.changed && !localEditPending.current) {
          const remoteTabs = Array.isArray(data.tabs) ? data.tabs : null

          // Preserve this viewer's current active tab selection if it still
          // exists remotely — do NOT force every viewer back to whatever tab
          // the last editor was on. That would constantly yank users across
          // tabs and scramble what content they see.
          let mergedActive: string | null = activeTabIdRef.current
          if (remoteTabs) {
            const localActiveStillExists = mergedActive
              ? remoteTabs.some((t: any) => t.id === mergedActive)
              : false
            if (!localActiveStillExists) {
              mergedActive =
                data.activeTabId && remoteTabs.some((t: any) => t.id === data.activeTabId)
                  ? data.activeTabId
                  : remoteTabs[0]?.id || null
            }
          }

          // Pick the HTML this viewer should see based on their active tab.
          // When tabs exist, top-level `data.content` is only the sender's
          // active tab content and must not be used for viewers on other tabs.
          let remoteHTMLForActive: string | null = remoteTabs ? null : data.content ?? null
          if (remoteTabs && mergedActive) {
            const activeTab = remoteTabs.find((t: any) => t.id === mergedActive)
            remoteHTMLForActive = activeTab?.content ?? ''
          }

          // Prime the structural-change signatures BEFORE propagating so the
          // tab-change effect treats this as already-persisted and doesn't
          // echo the remote state back to the server.
          if (remoteTabs) {
            prevTabsSignatureRef.current = remoteTabs
              .map((t: any) => `${t.id}:${t.title}`)
              .join('|')
            prevActiveTabIdRef.current = mergedActive ?? null
            if (onTabsUpdate) onTabsUpdate(remoteTabs, mergedActive ?? '')
          }

          if (remoteHTMLForActive != null && remoteHTMLForActive !== editor.getHTML()) {
            isSyncing.current = true
            // Preserve cursor position
            const { from, to } = editor.state.selection
            editor.commands.setContent(remoteHTMLForActive)
            // Restore cursor (clamp to new doc size)
            const maxPos = editor.state.doc.content.size
            const safeFrom = Math.min(from, maxPos)
            const safeTo = Math.min(to, maxPos)
            try {
              editor.commands.setTextSelection({ from: safeFrom, to: safeTo })
            } catch {}
            isSyncing.current = false
            setLastRemoteEdit(data.editedBy || '')
          }

          if (data.title && data.title !== titleRef.current) {
            setTitle(data.title)
            titleRef.current = data.title
          }
          setSyncVersion(data.version)
        } else if (data.version) {
          setSyncVersion(data.version)
        }
      } catch {
        // Ignore network errors during polling
      }
    }

    const interval = setInterval(pollSync, 1500)
    return () => { cancelled = true; clearInterval(interval) }
  }, [editor, userEmail, docId, syncVersion, apiPath, onTabsUpdate])

  // Copy protection: block copy/cut/print/right-click/screenshot for non-admin when enabled
  useEffect(() => {
    if (!copyProtected) return

    function showWarning(msg: string) {
      setSecurityWarning(msg)
      setTimeout(() => setSecurityWarning(''), 3000)
    }

    function preventCopy(e: ClipboardEvent) {
      e.preventDefault()
      showWarning('Copying is not allowed for this document')
    }
    function preventCut(e: ClipboardEvent) {
      e.preventDefault()
      showWarning('Cutting is not allowed for this document')
    }
    function preventKeyboard(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey) {
        const k = e.key.toLowerCase()
        if (k === 'p') { e.preventDefault(); showWarning('Printing is not allowed for this document'); return }
        if (k === 'c' || k === 'x') { e.preventDefault(); showWarning('Copying is not allowed for this document'); return }
      }
      if (e.key === 'PrintScreen') {
        e.preventDefault()
        showWarning('Screenshots are not allowed')
      }
    }
    function preventContextMenu(e: MouseEvent) {
      e.preventDefault()
      showWarning('Right-click is disabled for this document')
    }
    function preventDragStart(e: DragEvent) { e.preventDefault() }
    function onBeforePrint() { showWarning('Printing is not allowed for this document') }

    const container = containerRef.current
    if (container) {
      container.addEventListener('copy', preventCopy)
      container.addEventListener('cut', preventCut)
      container.addEventListener('contextmenu', preventContextMenu)
      container.addEventListener('dragstart', preventDragStart)
    }
    document.addEventListener('keydown', preventKeyboard)
    window.addEventListener('beforeprint', onBeforePrint)

    return () => {
      if (container) {
        container.removeEventListener('copy', preventCopy)
        container.removeEventListener('cut', preventCut)
        container.removeEventListener('contextmenu', preventContextMenu)
        container.removeEventListener('dragstart', preventDragStart)
      }
      document.removeEventListener('keydown', preventKeyboard)
      window.removeEventListener('beforeprint', onBeforePrint)
    }
  }, [copyProtected])

  // Screenshot protection: blur content when tab is inactive
  useEffect(() => {
    if (!copyProtected) return
    function onVisibilityChange() {
      const container = containerRef.current
      if (!container) return
      if (document.hidden) {
        container.style.filter = 'blur(15px)'
        container.style.transition = 'filter 0.1s'
      } else {
        container.style.filter = ''
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [copyProtected])

  // Activity logging (opened on mount, viewed w/ duration on unmount)
  useEffect(() => {
    if (!activityLogPath) return
    const startedAt = Date.now()
    apiFetch(activityLogPath, {
      method: 'POST',
      body: JSON.stringify({ docId, action: 'opened' }),
    }).catch(() => {})
    return () => {
      const duration = Math.round((Date.now() - startedAt) / 1000)
      apiFetch(activityLogPath, {
        method: 'POST',
        body: JSON.stringify({ docId, action: 'viewed', duration }),
      }).catch(() => {})
    }
  }, [activityLogPath, docId])

  // Document outline headings
  const headings = useMemo(() => {
    if (!editor) return []
    const items: { level: number; text: string; pos: number }[] = []
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === 'heading') {
        items.push({ level: node.attrs.level, text: node.textContent, pos })
      }
    })
    return items
  }, [editor, editor?.state.doc])

  // Word/character count
  const text = editor?.getText() || ''
  const wordCount = (text || '')
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .filter(Boolean).length
  const charCount = editor?.storage.characterCount?.characters() || 0
  const readingTime = Math.max(1, Math.ceil(wordCount / 200))

  // Selected text word count
  const [selectedWordCount, setSelectedWordCount] = useState(0)
  const [sectionWordCount, setSectionWordCount] = useState(0)
  const [currentSectionName, setCurrentSectionName] = useState('')
  const [activeHeadingIndex, setActiveHeadingIndex] = useState(-1)
  // Bump on every selection/transaction so toolbar indicators (font family,
  // size, active marks) reflect the current caret/selection.
  const [, setSelectionTick] = useState(0)

  useEffect(() => {
    if (!editor) return
    const updateSelection = () => {
      const { from, to } = editor.state.selection
      // Selected text word count
      if (from !== to) {
        const selectedText = editor.state.doc.textBetween(from, to, ' ')
        const words = selectedText.trim().split(/\s+/).filter(Boolean).length
        setSelectedWordCount(words)
      } else {
        setSelectedWordCount(0)
      }

      // Find current section based on cursor position
      const cursorPos = from
      let sectionStart = 0
      let sectionEnd = editor.state.doc.content.size
      let sectionName = ''
      let activeIdx = -1

      // Build section boundaries from headings
      const sectionBounds: { start: number; end: number; text: string; idx: number }[] = []
      let headingIdx = 0
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name === 'heading') {
          sectionBounds.push({ start: pos, end: 0, text: node.textContent, idx: headingIdx })
          headingIdx++
        }
      })

      // Set end positions for each section
      for (let i = 0; i < sectionBounds.length; i++) {
        sectionBounds[i].end = i + 1 < sectionBounds.length
          ? sectionBounds[i + 1].start
          : editor.state.doc.content.size
      }

      // Find which section the cursor is in
      for (let i = sectionBounds.length - 1; i >= 0; i--) {
        if (cursorPos >= sectionBounds[i].start) {
          sectionStart = sectionBounds[i].start
          sectionEnd = sectionBounds[i].end
          sectionName = sectionBounds[i].text
          activeIdx = sectionBounds[i].idx
          break
        }
      }

      setActiveHeadingIndex(activeIdx)
      setCurrentSectionName(sectionName)

      // Count words in the current section
      if (sectionName) {
        const sectionText = editor.state.doc.textBetween(sectionStart, sectionEnd, ' ')
        const words = sectionText.trim().split(/\s+/).filter(Boolean).length
        setSectionWordCount(words)
      } else {
        setSectionWordCount(0)
      }
      setSelectionTick((t) => (t + 1) % 1000000)
    }

    editor.on('selectionUpdate', updateSelection)
    editor.on('update', updateSelection)
    editor.on('transaction', updateSelection)
    return () => {
      editor.off('selectionUpdate', updateSelection)
      editor.off('update', updateSelection)
      editor.off('transaction', updateSelection)
    }
  }, [editor])

  // Voice typing
  function toggleVoiceTyping() {
    if (isListening) {
      recognitionRef.current?.stop()
      setIsListening(false)
      return
    }
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) { alert('Speech recognition not supported in this browser'); return }
    const recognition = new SpeechRecognition()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-US'
    recognition.onresult = (event: any) => {
      let transcript = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          transcript += event.results[i][0].transcript
        }
      }
      if (transcript && editor) {
        editor.chain().focus().insertContent(transcript).run()
      }
    }
    recognition.onerror = () => setIsListening(false)
    recognition.onend = () => setIsListening(false)
    recognition.start()
    recognitionRef.current = recognition
    setIsListening(true)
  }

  // Add comment
  function handleAddComment() {
    if (!editor) return
    const { from, to } = editor.state.selection
    if (from === to) { alert('Select some text to comment on'); return }
    const selectedText = editor.state.doc.textBetween(from, to, ' ')
    const text = prompt('Enter your comment:')
    if (!text) return

    apiFetch('/api/comments', {
      method: 'POST',
      body: JSON.stringify({
        email: userEmail, docId, selectedText, from, to, text,
      }),
    }).then(res => res.json()).then(data => {
      if (data.comment) {
        editor.chain().focus().setMark('comment', { commentId: data.comment.id }).run()
        scheduleSave(editor.getHTML())
        setShowComments(true)
      }
    })
  }

  // Handle suggestion mode edits
  function handleSuggestionInsert() {
    if (!editor || !suggestionMode) return
    const text = prompt('Enter suggested text to insert:')
    if (!text) return
    const { from, to } = editor.state.selection
    const originalText = from !== to ? editor.state.doc.textBetween(from, to, ' ') : ''

    apiFetch('/api/suggestions', {
      method: 'POST',
      body: JSON.stringify({
        email: userEmail, docId, from, to, originalText, suggestedText: text,
      }),
    }).then(res => res.json()).then(data => {
      if (data.suggestion) {
        if (from !== to) {
          editor.chain().focus()
            .setMark('suggestion', { suggestionId: data.suggestion.id, type: 'delete' })
            .run()
        }
        editor.chain().focus()
          .insertContent(`<span data-suggestion-id="${data.suggestion.id}" data-suggestion-type="insert" class="suggestion-mark suggestion-insert" style="background-color: #d4edda; border-bottom: 2px solid #28a745;">${text}</span>`)
          .run()
        scheduleSave(editor.getHTML())
        setShowSuggestions(true)
      }
    })
  }

  // Image upload
  function handleImageUpload() {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file || !editor) return
      const reader = new FileReader()
      reader.onload = () => {
        editor.chain().focus().setImage({ src: reader.result as string }).run()
        scheduleSave(editor.getHTML())
      }
      reader.readAsDataURL(file)
    }
    input.click()
  }

  function handleImageUrl() {
    const url = prompt('Enter image URL:')
    if (url && editor) {
      editor.chain().focus().setImage({ src: url }).run()
    }
  }

  function handleInsertLink() {
    if (!editor) return
    const url = prompt('Enter URL:', 'https://')
    if (url) {
      editor.chain().focus().setLink({ href: url }).run()
    }
  }

  function handleInsertTable() {
    if (!editor) return
    const rows = parseInt(prompt('Number of rows:', '3') || '3')
    const cols = parseInt(prompt('Number of columns:', '3') || '3')
    editor.chain().focus().insertTable({ rows, cols, withHeaderRow: true }).run()
  }

  // Export functions
  async function handleExportHTML() {
    if (!editor) return
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title><style>body{font-family:Arial,sans-serif;max-width:800px;margin:40px auto;padding:20px;} table{border-collapse:collapse;width:100%;} td,th{border:1px solid #ddd;padding:8px;} img{max-width:100%;}</style></head><body><h1>${title}</h1>${editor.getHTML()}</body></html>`
    const blob = new Blob([html], { type: 'text/html' })
    downloadBlob(blob, `${title || 'document'}.html`)
  }

  async function handleExportPDF() {
    if (!editor) return
    try {
      const { jsPDF } = await import('jspdf')
      const doc = new jsPDF({ orientation: pageOrientation, unit: 'mm', format: pageSize.toLowerCase() as any })
      const content = editor.getText()
      const lines = doc.splitTextToSize(content, doc.internal.pageSize.getWidth() - margins.left - margins.right)
      let y = margins.top + 10
      doc.setFontSize(18)
      doc.text(title || 'Document', margins.left, y)
      y += 12
      doc.setFontSize(12)
      for (const line of lines) {
        if (y > doc.internal.pageSize.getHeight() - margins.bottom) {
          doc.addPage()
          y = margins.top
        }
        doc.text(line, margins.left, y)
        y += 6
      }
      doc.save(`${title || 'document'}.pdf`)
    } catch {
      alert('PDF export failed')
    }
  }

  async function handleExportDOCX() {
    if (!editor) return
    try {
      const htmlToDocx = (await import('html-to-docx')).default
      const html = `<html><body><h1>${title}</h1>${editor.getHTML()}</body></html>`
      const blob = await htmlToDocx(html, null, {
        table: { row: { cantSplit: true } },
        footer: true,
        pageNumber: true,
      })
      downloadBlob(blob as Blob, `${title || 'document'}.docx`)
    } catch {
      alert('DOCX export failed')
    }
  }

  function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  // Focus mode: apply CSS class to dim non-focused sections
  useEffect(() => {
    if (!editor) return
    const editorElement = editor.view.dom

    // Remove existing focus-mode classes
    editorElement.querySelectorAll('.section-dimmed').forEach(el => el.classList.remove('section-dimmed'))
    editorElement.querySelectorAll('.section-focused').forEach(el => el.classList.remove('section-focused'))

    if (focusedSection === null || headings.length === 0) return

    // Find all heading elements in the editor DOM
    const headingEls: { el: HTMLElement; index: number }[] = []
    const headingTags = ['H1', 'H2', 'H3', 'H4', 'H5', 'H6']
    const walker = document.createTreeWalker(editorElement, NodeFilter.SHOW_ELEMENT, {
      acceptNode: (node) =>
        headingTags.includes((node as HTMLElement).tagName)
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_SKIP,
    })

    let idx = 0
    let node: Node | null
    while ((node = walker.nextNode())) {
      headingEls.push({ el: node as HTMLElement, index: idx })
      idx++
    }

    // Dim everything, then un-dim the focused section
    // Collect all direct children of the editor
    const children = Array.from(editorElement.children) as HTMLElement[]
    children.forEach(child => child.classList.add('section-dimmed'))

    // Find the focused heading and all elements until the next heading
    const focusedHeadingEl = headingEls[focusedSection]
    if (focusedHeadingEl) {
      const nextHeadingEl = headingEls[focusedSection + 1]
      let inSection = false
      for (const child of children) {
        if (child === focusedHeadingEl.el || child.contains(focusedHeadingEl.el)) {
          inSection = true
        }
        if (nextHeadingEl && (child === nextHeadingEl.el || child.contains(nextHeadingEl.el))) {
          inSection = false
        }
        if (inSection) {
          child.classList.remove('section-dimmed')
          child.classList.add('section-focused')
        }
      }
    }
  }, [editor, focusedSection, headings])

  if (!editor) {
    return <div className="p-8 text-gray-400 text-center">Loading editor...</div>
  }

  const currentHeading = (() => {
    for (let i = 1; i <= 6; i++) {
      if (editor.isActive('heading', { level: i })) return `h${i}`
    }
    if (editor.isActive('blockquote')) return 'blockquote'
    return 'paragraph'
  })()

  const { currentFontFamily, currentFontSize, familyMixed, sizeMixed } = (() => {
    const { from, to, empty } = editor.state.selection
    if (empty) {
      const attrs = editor.getAttributes('textStyle')
      return {
        currentFontFamily: (attrs.fontFamily as string | undefined) || '',
        currentFontSize: (attrs.fontSize as string | undefined) || '',
        familyMixed: false,
        sizeMixed: false,
      }
    }
    let family: string | null | undefined
    let size: string | null | undefined
    let mixF = false
    let mixS = false
    let seenText = false
    editor.state.doc.nodesBetween(from, to, (node) => {
      if (!node.isText) return
      seenText = true
      const textStyle = node.marks.find((m) => m.type.name === 'textStyle')
      const f = (textStyle?.attrs.fontFamily as string | null | undefined) ?? null
      const s = (textStyle?.attrs.fontSize as string | null | undefined) ?? null
      if (family === undefined) family = f
      else if (family !== f) mixF = true
      if (size === undefined) size = s
      else if (size !== s) mixS = true
    })
    if (!seenText) {
      const attrs = editor.getAttributes('textStyle')
      return {
        currentFontFamily: (attrs.fontFamily as string | undefined) || '',
        currentFontSize: (attrs.fontSize as string | undefined) || '',
        familyMixed: false,
        sizeMixed: false,
      }
    }
    return {
      currentFontFamily: family ?? '',
      currentFontSize: size ?? '',
      familyMixed: mixF,
      sizeMixed: mixS,
    }
  })()

  const fontFamilyMatches = !familyMixed && FONT_FAMILIES.some((f) => f.value === currentFontFamily)
  const fontSizeMatches = !sizeMixed && currentFontSize !== '' && FONT_SIZES.includes(currentFontSize)
  const fontFamilySelectValue = familyMixed
    ? '__mixed__'
    : fontFamilyMatches
      ? currentFontFamily
      : '__unknown__'
  const fontSizeSelectValue = sizeMixed
    ? '__mixed__'
    : fontSizeMatches
      ? currentFontSize
      : ''

  return (
    <div
      ref={containerRef}
      className="flex h-full gap-0"
      style={copyProtected ? { userSelect: 'none', WebkitUserSelect: 'none' } : undefined}
    >
      {/* Security warning overlay */}
      {securityWarning && (
        <div className="fixed top-4 right-4 z-[60] bg-red-600 text-white px-4 py-3 rounded-lg shadow-lg text-sm font-medium animate-pulse max-w-sm">
          {securityWarning}
        </div>
      )}
      {/* Document outline panel */}
      {showOutline && (
        <div className="w-56 shrink-0 border-r border-gray-200 bg-gray-50 overflow-y-auto p-3 sticky top-0 self-start max-h-screen">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Outline</h3>
            <div className="flex items-center gap-1">
              {focusedSection !== null && (
                <button onClick={() => setFocusedSection(null)}
                  className="text-[10px] text-[#A52A2A] hover:underline">
                  Show All
                </button>
              )}
              <button onClick={() => setShowOutline(false)} className="text-gray-400 hover:text-gray-600 text-xs">x</button>
            </div>
          </div>
          {headings.length === 0 ? (
            <p className="text-xs text-gray-400">No headings found</p>
          ) : (
            <div className="space-y-0.5">
              {headings.map((h, i) => (
                <div key={i} className="flex items-center gap-1">
                  <button
                    onClick={() => {
                      // Navigate: scroll editor to heading and place cursor
                      const pos = h.pos + 1 // inside the heading node
                      editor.chain().focus().setTextSelection(pos).run()
                      // Scroll the heading into view using the editor view
                      try {
                        const coords = editor.view.coordsAtPos(h.pos)
                        const editorContainer = editor.view.dom.closest('.overflow-auto')
                        if (editorContainer && coords) {
                          const containerRect = editorContainer.getBoundingClientRect()
                          const scrollTop = editorContainer.scrollTop + (coords.top - containerRect.top) - 80
                          editorContainer.scrollTo({ top: Math.max(0, scrollTop), behavior: 'smooth' })
                        } else {
                          const domNode = editor.view.domAtPos(h.pos)
                          if (domNode?.node) {
                            const el = domNode.node instanceof HTMLElement ? domNode.node : (domNode.node as any).parentElement
                            el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                          }
                        }
                      } catch {
                        // Fallback: use domAtPos
                        const domNode = editor.view.domAtPos(h.pos)
                        if (domNode?.node) {
                          const el = domNode.node instanceof HTMLElement ? domNode.node : (domNode.node as any).parentElement
                          el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                        }
                      }
                    }}
                    className={`flex-1 text-left text-xs rounded px-2 py-1.5 truncate transition-colors ${
                      activeHeadingIndex === i
                        ? 'bg-[#A52A2A] text-white font-medium'
                        : focusedSection === i
                          ? 'bg-[#A52A2A]/10 text-[#A52A2A] font-medium'
                          : 'text-gray-600 hover:text-[#A52A2A] hover:bg-gray-100'
                    }`}
                    style={{ paddingLeft: `${(h.level - 1) * 12 + 8}px` }}>
                    {h.text || `Heading ${h.level}`}
                  </button>
                  <button
                    onClick={() => setFocusedSection(focusedSection === i ? null : i)}
                    title={focusedSection === i ? 'Exit focus mode' : 'Focus this section'}
                    className={`shrink-0 w-5 h-5 flex items-center justify-center rounded text-[10px] transition-colors ${
                      focusedSection === i
                        ? 'bg-[#A52A2A] text-white'
                        : 'text-gray-400 hover:text-[#A52A2A] hover:bg-gray-100'
                    }`}>
                    {focusedSection === i ? '\u25C9' : '\u25CE'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Main editor area */}
      <div className="flex flex-col flex-1 min-w-0 min-h-0 overflow-auto">
        <div className="sticky top-0 z-30 bg-white border-b border-gray-200 shadow-sm">
        {/* Title row */}
        <div className="flex items-center gap-3 pb-3 px-4 pt-3">
          <input
            className="flex-1 text-2xl font-semibold outline-none bg-transparent placeholder-gray-300"
            style={{ fontFamily: '"Playfair Display", serif' }}
            value={title} placeholder="Document title" readOnly={readonly}
            onChange={e => {
              setTitle(e.target.value)
              titleRef.current = e.target.value
              onTitleChange?.(e.target.value)
              if (editor) scheduleSave(editor.getHTML())
            }}
          />
          <span className={`text-xs whitespace-nowrap ${
            saveStatus === 'saved' ? 'text-green-600' : saveStatus === 'saving' ? 'text-yellow-600' : 'text-gray-400'
          }`}>
            {saveStatus === 'saved' ? 'Saved' : saveStatus === 'saving' ? 'Saving...' : 'Unsaved'}
          </span>
        </div>

        {/* Menu bar */}
        <div className="flex items-center gap-1 px-3 py-1 bg-white border-b border-gray-100 text-xs text-gray-600 flex-wrap">
            <button onClick={() => setShowOutline(!showOutline)} className="hover:text-[#A52A2A] px-2 py-0.5">Outline</button>
            <span className="text-gray-300">|</span>

            {/* Insert dropdown */}
            <div className="relative">
              <button onClick={() => setShowInsertMenu(!showInsertMenu)} className="hover:text-[#A52A2A] px-2 py-0.5">Insert</button>
              {showInsertMenu && (
                <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 w-56 max-h-80 overflow-y-auto py-1">
                  <div className="px-3 py-1 text-[10px] font-semibold text-gray-400 uppercase">Media</div>
                  <button onClick={() => { handleImageUpload(); setShowInsertMenu(false) }} className="w-full text-left px-3 py-1.5 hover:bg-gray-50 text-xs">Image Upload</button>
                  <button onClick={() => { handleImageUrl(); setShowInsertMenu(false) }} className="w-full text-left px-3 py-1.5 hover:bg-gray-50 text-xs">Image by URL</button>
                  <div className="border-t border-gray-100 my-1" />
                  <div className="px-3 py-1 text-[10px] font-semibold text-gray-400 uppercase">Tables</div>
                  <button onClick={() => { handleInsertTable(); setShowInsertMenu(false) }} className="w-full text-left px-3 py-1.5 hover:bg-gray-50 text-xs">Insert Table</button>
                  {editor.isActive('table') && <>
                    <button onClick={() => { editor.chain().focus().addColumnAfter().run(); setShowInsertMenu(false) }} className="w-full text-left px-3 py-1.5 hover:bg-gray-50 text-xs pl-6">Add Column</button>
                    <button onClick={() => { editor.chain().focus().addRowAfter().run(); setShowInsertMenu(false) }} className="w-full text-left px-3 py-1.5 hover:bg-gray-50 text-xs pl-6">Add Row</button>
                    <button onClick={() => { editor.chain().focus().deleteColumn().run(); setShowInsertMenu(false) }} className="w-full text-left px-3 py-1.5 hover:bg-gray-50 text-xs pl-6">Delete Column</button>
                    <button onClick={() => { editor.chain().focus().deleteRow().run(); setShowInsertMenu(false) }} className="w-full text-left px-3 py-1.5 hover:bg-gray-50 text-xs pl-6">Delete Row</button>
                    <button onClick={() => { editor.chain().focus().mergeCells().run(); setShowInsertMenu(false) }} className="w-full text-left px-3 py-1.5 hover:bg-gray-50 text-xs pl-6">Merge Cells</button>
                    <button onClick={() => { editor.chain().focus().splitCell().run(); setShowInsertMenu(false) }} className="w-full text-left px-3 py-1.5 hover:bg-gray-50 text-xs pl-6">Split Cell</button>
                    <button onClick={() => { editor.chain().focus().deleteTable().run(); setShowInsertMenu(false) }} className="w-full text-left px-3 py-1.5 hover:bg-gray-50 text-xs pl-6 text-red-500">Delete Table</button>
                  </>}
                  <div className="border-t border-gray-100 my-1" />
                  <div className="px-3 py-1 text-[10px] font-semibold text-gray-400 uppercase">Content</div>
                  <button onClick={() => { handleInsertLink(); setShowInsertMenu(false) }} className="w-full text-left px-3 py-1.5 hover:bg-gray-50 text-xs">Link</button>
                  <button onClick={() => { editor.chain().focus().setHorizontalRule().run(); setShowInsertMenu(false) }} className="w-full text-left px-3 py-1.5 hover:bg-gray-50 text-xs">Horizontal Line</button>
                  <button onClick={() => { editor.chain().focus().insertContent('<p style="page-break-after: always;">&nbsp;</p>').run(); setShowInsertMenu(false) }} className="w-full text-left px-3 py-1.5 hover:bg-gray-50 text-xs">Page Break</button>
                  <div className="border-t border-gray-100 my-1" />
                  <div className="px-3 py-1 text-[10px] font-semibold text-gray-400 uppercase">Symbols</div>
                  <button onClick={() => { setShowSymbols(true); setShowInsertMenu(false) }} className="w-full text-left px-3 py-1.5 hover:bg-gray-50 text-xs">Special Characters</button>
                  <div className="border-t border-gray-100 my-1" />
                  <div className="px-3 py-1 text-[10px] font-semibold text-gray-400 uppercase">Structure</div>
                  <button onClick={() => {
                    // Generate TOC from headings
                    const toc = headings.map(h => `<p style="padding-left:${(h.level-1)*20}px"><a href="#">${h.text}</a></p>`).join('')
                    editor.chain().focus().insertContent(`<div class="toc"><h2>Table of Contents</h2>${toc || '<p>No headings found</p>'}</div>`).run()
                    setShowInsertMenu(false)
                  }} className="w-full text-left px-3 py-1.5 hover:bg-gray-50 text-xs">Table of Contents</button>
                  {!disableComments && (
                    <button onClick={() => { handleAddComment(); setShowInsertMenu(false) }} className="w-full text-left px-3 py-1.5 hover:bg-gray-50 text-xs">Comment</button>
                  )}
                </div>
              )}
            </div>
            <span className="text-gray-300">|</span>

            {/* Export */}
            {!disableExport && (
              <>
                <div className="relative group">
                  <button className="hover:text-[#A52A2A] px-2 py-0.5">Export</button>
                  <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 w-40 py-1 hidden group-hover:block">
                    <button onClick={handleExportPDF} className="w-full text-left px-3 py-1.5 hover:bg-gray-50 text-xs">PDF</button>
                    <button onClick={handleExportDOCX} className="w-full text-left px-3 py-1.5 hover:bg-gray-50 text-xs">DOCX</button>
                    <button onClick={handleExportHTML} className="w-full text-left px-3 py-1.5 hover:bg-gray-50 text-xs">HTML</button>
                  </div>
                </div>
                <span className="text-gray-300">|</span>
              </>
            )}

            <button onClick={() => setShowPageSettings(!showPageSettings)} className="hover:text-[#A52A2A] px-2 py-0.5">Page Setup</button>
            <span className="text-gray-300">|</span>
            <button onClick={toggleVoiceTyping} className={`px-2 py-0.5 ${isListening ? 'text-red-500 font-semibold' : 'hover:text-[#A52A2A]'}`}>
              {isListening ? 'Stop Voice' : 'Voice Type'}
            </button>
            {!disableComments && (
              <>
                <span className="text-gray-300">|</span>
                <button onClick={() => setShowComments(!showComments)} className={`px-2 py-0.5 ${showComments ? 'text-[#A52A2A] font-semibold' : 'hover:text-[#A52A2A]'}`}>
                  Comments
                </button>
              </>
            )}
            {!disableSuggestions && (
              <>
                <span className="text-gray-300">|</span>
                <button onClick={() => setShowSuggestions(!showSuggestions)} className={`px-2 py-0.5 ${showSuggestions ? 'text-[#A52A2A] font-semibold' : 'hover:text-[#A52A2A]'}`}>
                  Suggestions
                </button>
              </>
            )}
            {!disableSuggestions && (userRole === 'mentor' || userRole === 'admin') && !readonly && <>
              <span className="text-gray-300">|</span>
              <button onClick={() => setSuggestionMode(!suggestionMode)}
                className={`px-2 py-0.5 ${suggestionMode ? 'text-orange-600 font-semibold' : 'hover:text-[#A52A2A]'}`}>
                {suggestionMode ? 'Suggesting' : 'Editing'}
              </button>
            </>}
            {readonly && (
              <>
                <span className="text-gray-300">|</span>
                <span className="px-2 py-0.5 text-[10px] uppercase tracking-wide bg-gray-100 text-gray-500 rounded">View Only</span>
              </>
            )}
        </div>

        {/* Page settings modal */}
        {showPageSettings && (
          <div className="bg-yellow-50 border-b border-yellow-200 px-4 py-3 flex flex-wrap items-center gap-4 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-medium text-gray-600">Page:</span>
              <select value={pageSize} onChange={e => setPageSize(e.target.value as any)} className="border border-gray-300 rounded px-2 py-1 text-xs">
                <option value="A4">A4</option>
                <option value="Letter">Letter</option>
              </select>
              <select value={pageOrientation} onChange={e => setPageOrientation(e.target.value as any)} className="border border-gray-300 rounded px-2 py-1 text-xs">
                <option value="portrait">Portrait</option>
                <option value="landscape">Landscape</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-medium text-gray-600">Margins (mm):</span>
              {(['top','bottom','left','right'] as const).map(side => (
                <label key={side} className="flex items-center gap-1">
                  <span className="text-gray-500 capitalize">{side[0].toUpperCase()}</span>
                  <input type="number" value={margins[side]} onChange={e => setMargins({...margins, [side]: parseInt(e.target.value)||0})}
                    className="w-10 border border-gray-300 rounded px-1 py-0.5 text-xs text-center" />
                </label>
              ))}
            </div>
            <button onClick={() => setShowPageSettings(false)} className="text-gray-400 hover:text-gray-600 ml-auto">Close</button>
          </div>
        )}

        {/* Symbols popup */}
        {showSymbols && (
          <div className="bg-white border-b border-gray-200 px-4 py-3">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-gray-500 uppercase">Special Characters</h3>
              <button onClick={() => setShowSymbols(false)} className="text-gray-400 hover:text-gray-600 text-xs">Close</button>
            </div>
            <div className="flex flex-wrap gap-1">
              {SPECIAL_CHARACTERS.map((ch, i) => (
                <button key={i} onClick={() => { editor.chain().focus().insertContent(ch).run(); setShowSymbols(false) }}
                  className="w-8 h-8 flex items-center justify-center border border-gray-200 rounded hover:bg-gray-100 text-sm">
                  {ch}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Main toolbar */}
        <div className="flex flex-nowrap md:flex-wrap items-center gap-0.5 px-3 py-1.5 bg-gray-50 border-b border-gray-200 overflow-x-auto">
            {/* Undo/Redo */}
            <ToolbarBtn onClick={() => editor.chain().focus().undo().run()} title="Undo" disabled={!editor.can().undo()}>&#8617;</ToolbarBtn>
            <ToolbarBtn onClick={() => editor.chain().focus().redo().run()} title="Redo" disabled={!editor.can().redo()}>&#8618;</ToolbarBtn>
            <ToolbarDivider />

            {/* Paragraph style */}
            <ToolbarSelect
              value={currentHeading}
              onChange={v => {
                if (v === 'paragraph') editor.chain().focus().setParagraph().run()
                else if (v === 'blockquote') editor.chain().focus().toggleBlockquote().run()
                else {
                  const level = parseInt(v.replace('h', '')) as 1|2|3|4|5|6
                  editor.chain().focus().toggleHeading({ level }).run()
                }
              }}
              options={HEADING_OPTIONS}
              title="Paragraph style"
              className="w-28"
            />
            <ToolbarDivider />

            {/* Font family */}
            <select title="Font family" value={fontFamilySelectValue} onChange={e => {
              const v = e.target.value
              if (v === '__mixed__' || v === '__unknown__') return
              if (v) editor.chain().focus().setFontFamily(v).run()
              else editor.chain().focus().unsetFontFamily().run()
            }} className="text-xs border border-gray-200 rounded px-1 py-1 bg-white text-gray-700 w-28">
              {familyMixed && <option value="__mixed__" disabled hidden></option>}
              {!familyMixed && !fontFamilyMatches && <option value="__unknown__" disabled hidden></option>}
              {FONT_FAMILIES.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>

            {/* Font size */}
            <select title="Font size" value={fontSizeSelectValue} onChange={e => {
              const v = e.target.value
              if (v === '__mixed__') return
              if (v) (editor.chain().focus() as any).setFontSize(v).run()
              else (editor.chain().focus() as any).unsetFontSize().run()
            }} className="text-xs border border-gray-200 rounded px-1 py-1 bg-white text-gray-700 w-16">
              {sizeMixed && <option value="__mixed__" disabled hidden></option>}
              <option value="">Size</option>
              {FONT_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>

            {/* Increase/decrease font */}
            <ToolbarBtn onClick={() => {
              const currentSize = editor.getAttributes('textStyle').fontSize
              const idx = FONT_SIZES.indexOf(currentSize || '14px')
              if (idx < FONT_SIZES.length - 1) (editor.chain().focus() as any).setFontSize(FONT_SIZES[idx + 1]).run()
            }} title="Increase font size">A+</ToolbarBtn>
            <ToolbarBtn onClick={() => {
              const currentSize = editor.getAttributes('textStyle').fontSize
              const idx = FONT_SIZES.indexOf(currentSize || '14px')
              if (idx > 0) (editor.chain().focus() as any).setFontSize(FONT_SIZES[idx - 1]).run()
            }} title="Decrease font size">A-</ToolbarBtn>
            <ToolbarDivider />

            {/* Basic formatting */}
            <ToolbarBtn active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} title="Bold">
              <strong>B</strong>
            </ToolbarBtn>
            <ToolbarBtn active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} title="Italic">
              <em>I</em>
            </ToolbarBtn>
            <ToolbarBtn active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()} title="Underline">
              <span className="underline">U</span>
            </ToolbarBtn>
            <ToolbarBtn active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()} title="Strikethrough">
              <span className="line-through">S</span>
            </ToolbarBtn>
            <ToolbarBtn active={editor.isActive('subscript')} onClick={() => editor.chain().focus().toggleSubscript().run()} title="Subscript">
              X<sub>2</sub>
            </ToolbarBtn>
            <ToolbarBtn active={editor.isActive('superscript')} onClick={() => editor.chain().focus().toggleSuperscript().run()} title="Superscript">
              X<sup>2</sup>
            </ToolbarBtn>
            <ToolbarDivider />

            {/* Text color */}
            <div className="relative group">
              <ToolbarBtn onClick={() => {}} title="Text Color">
                <span style={{ color: editor.getAttributes('textStyle').color || '#000' }}>A</span>
              </ToolbarBtn>
              <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 p-2 hidden group-hover:grid grid-cols-5 gap-1">
                {TEXT_COLORS.map(c => (
                  <button key={c} onClick={() => (editor.chain().focus() as any).setColor(c).run()}
                    className="w-6 h-6 rounded border border-gray-200" style={{ backgroundColor: c }} />
                ))}
                <button onClick={() => (editor.chain().focus() as any).unsetColor().run()}
                  className="col-span-5 text-[10px] text-gray-500 hover:text-gray-700 mt-1">Clear color</button>
              </div>
            </div>

            {/* Highlight color */}
            <div className="relative group">
              <ToolbarBtn active={editor.isActive('highlight')} onClick={() => {}} title="Highlight">
                <span className="bg-yellow-200 px-0.5">H</span>
              </ToolbarBtn>
              <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 p-2 hidden group-hover:grid grid-cols-5 gap-1">
                {HIGHLIGHT_COLORS.map(c => (
                  <button key={c} onClick={() => {
                    if (c === 'transparent') editor.chain().focus().unsetHighlight().run()
                    else editor.chain().focus().toggleHighlight({ color: c }).run()
                  }} className="w-6 h-6 rounded border border-gray-200" style={{ backgroundColor: c === 'transparent' ? '#fff' : c }} />
                ))}
              </div>
            </div>

            <ToolbarBtn onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()} title="Clear formatting">
              Tx
            </ToolbarBtn>
            <ToolbarDivider />

            {/* Alignment */}
            <ToolbarBtn active={editor.isActive({ textAlign: 'left' })} onClick={() => editor.chain().focus().setTextAlign('left').run()} title="Align Left">
              <span className="text-[10px]">&#9776;</span>
            </ToolbarBtn>
            <ToolbarBtn active={editor.isActive({ textAlign: 'center' })} onClick={() => editor.chain().focus().setTextAlign('center').run()} title="Center">
              <span className="text-[10px]">&#9776;</span>
            </ToolbarBtn>
            <ToolbarBtn active={editor.isActive({ textAlign: 'right' })} onClick={() => editor.chain().focus().setTextAlign('right').run()} title="Align Right">
              <span className="text-[10px]">&#9776;</span>
            </ToolbarBtn>
            <ToolbarBtn active={editor.isActive({ textAlign: 'justify' })} onClick={() => editor.chain().focus().setTextAlign('justify').run()} title="Justify">
              <span className="text-[10px]">&#9776;</span>
            </ToolbarBtn>
            <ToolbarDivider />

            {/* Line spacing */}
            <div className="relative group">
              <ToolbarBtn onClick={() => {}} title="Line Spacing">
                <span className="text-[10px]">&#8661;</span>
              </ToolbarBtn>
              <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1 hidden group-hover:block w-32">
                <div className="px-3 py-1 text-[10px] font-semibold text-gray-400 uppercase">Line Spacing</div>
                {LINE_SPACING_OPTIONS.map(o => (
                  <button key={o.value} onClick={() => (editor.chain().focus() as any).setLineHeight(o.value).run()}
                    className="w-full text-left px-3 py-1 hover:bg-gray-50 text-xs">{o.label}</button>
                ))}
                <div className="border-t border-gray-100 my-1" />
                <div className="px-3 py-1 text-[10px] font-semibold text-gray-400 uppercase">Paragraph</div>
                <button onClick={() => editor.chain().focus().updateAttributes('paragraph', { style: 'margin-top: 1em' } as any).run()}
                  className="w-full text-left px-3 py-1 hover:bg-gray-50 text-xs">Add space before</button>
                <button onClick={() => editor.chain().focus().updateAttributes('paragraph', { style: 'margin-bottom: 1em' } as any).run()}
                  className="w-full text-left px-3 py-1 hover:bg-gray-50 text-xs">Add space after</button>
              </div>
            </div>
            <ToolbarDivider />

            {/* Lists */}
            <ToolbarBtn active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()} title="Bullet List">
              &#8226;
            </ToolbarBtn>
            <ToolbarBtn active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()} title="Numbered List">
              1.
            </ToolbarBtn>
            <ToolbarBtn active={editor.isActive('taskList')} onClick={() => (editor.chain().focus() as any).toggleTaskList().run()} title="Checklist">
              &#9745;
            </ToolbarBtn>
            <ToolbarDivider />

            {/* Indent */}
            <ToolbarBtn onClick={() => editor.chain().focus().sinkListItem('listItem').run()} title="Increase Indent" disabled={!editor.can().sinkListItem('listItem')}>
              &#8680;
            </ToolbarBtn>
            <ToolbarBtn onClick={() => editor.chain().focus().liftListItem('listItem').run()} title="Decrease Indent" disabled={!editor.can().liftListItem('listItem')}>
              &#8678;
            </ToolbarBtn>
            <ToolbarDivider />

            {/* Comment button */}
            {!disableComments && (
              <ToolbarBtn onClick={handleAddComment} title="Add Comment">
                &#128172;
              </ToolbarBtn>
            )}

            {/* Suggest button (for mentors) */}
            {!disableSuggestions && suggestionMode && (
              <ToolbarBtn onClick={handleSuggestionInsert} title="Add Suggestion">
                &#9999;
              </ToolbarBtn>
            )}
          </div>
        </div>

        {/* Editor area with page styling */}
        <div className="flex-1 bg-gray-100 p-4 pb-16" onClick={() => setShowInsertMenu(false)}>
          <div
            className="editor-page tiptap-content bg-white mx-auto shadow-sm border border-gray-200 rounded"
            style={{
              maxWidth: pageOrientation === 'landscape'
                ? PAGE_SIZES[pageSize].height : PAGE_SIZES[pageSize].width,
              minHeight: '600px',
              padding: `${margins.top}mm ${margins.right}mm ${margins.bottom}mm ${margins.left}mm`,
            }}
          >
            <EditorContent editor={editor} className="min-h-[500px]" />
          </div>
        </div>

        {/* Status bar */}
        <div className="fixed bottom-0 left-0 w-full z-50 flex items-center justify-between px-4 py-1.5 bg-gray-50 border-t border-gray-200 text-[11px] text-gray-500">
          <div className="flex items-center gap-3">
            <span>Words: {wordCount}</span>
            {selectedWordCount > 0 && (
              <span className="text-[#A52A2A] font-medium">| Selected: {selectedWordCount}</span>
            )}
            {currentSectionName && selectedWordCount === 0 && (
              <span className="text-blue-600">| Section ({currentSectionName}): {sectionWordCount}</span>
            )}
            <span className="text-gray-400">| {charCount} chars</span>
            <span className="text-gray-400">| ~{readingTime} min read</span>
          </div>
          <div className="flex items-center gap-3">
            {lastRemoteEdit && (
              <span className="text-green-600 font-medium sync-pulse">Live: {lastRemoteEdit}</span>
            )}
            {currentSectionName && (
              <span className="text-gray-400 truncate max-w-32" title={currentSectionName}>
                {'\u00A7'} {currentSectionName}
              </span>
            )}
            <span>{pageSize} {pageOrientation}</span>
            {suggestionMode && <span className="text-orange-600 font-medium">Suggestion Mode</span>}
          </div>
        </div>
      </div>

      {/* Right panel: Comments */}
      {!disableComments && showComments && (
        <CommentPanel
          docId={docId as number}
          userEmail={userEmail}
          currentUserEmail={currentUserEmail}
          currentUserName={currentUserName}
          userRole={userRole}
          editor={editor}
          onClose={() => setShowComments(false)}
          onSave={() => scheduleSave(editor.getHTML())}
        />
      )}

      {/* Right panel: Suggestions */}
      {!disableSuggestions && showSuggestions && (
        <SuggestionPanel
          docId={docId as number}
          userEmail={userEmail}
          currentUserEmail={currentUserEmail}
          userRole={userRole}
          editor={editor}
          onClose={() => setShowSuggestions(false)}
          onSave={() => scheduleSave(editor.getHTML())}
        />
      )}
    </div>
  )
}
