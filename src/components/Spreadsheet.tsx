import { useState, useEffect, useCallback } from 'react'
import { useEditor, EditorContent, type Editor as TiptapEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import { TextStyle } from '@tiptap/extension-text-style'
import FontFamily from '@tiptap/extension-font-family'
import { Color } from '@tiptap/extension-color'
import Highlight from '@tiptap/extension-highlight'
import TextAlign from '@tiptap/extension-text-align'
import Placeholder from '@tiptap/extension-placeholder'
import { Extension, Mark } from '@tiptap/core'

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

const FONT_SIZES = [
  '8px', '9px', '10px', '11px', '12px', '14px', '16px', '18px', '20px',
  '24px', '28px', '32px', '36px', '48px',
]

const TEXT_COLORS = [
  '#000000', '#434343', '#666666', '#999999', '#cccccc',
  '#A52A2A', '#e74c3c', '#e67e22', '#f1c40f', '#2ecc71',
  '#1abc9c', '#3498db', '#2980b9', '#9b59b6', '#8e44ad',
]

const HIGHLIGHT_COLORS = [
  'transparent', '#fff3cd', '#d4edda', '#d1ecf1', '#f8d7da',
  '#fce4ec', '#e8eaf6', '#e0f2f1', '#fff9c4', '#f3e5f5',
]

// Custom font-size extension (mirrors Editor.tsx)
const FontSize = Extension.create({
  name: 'fontSize',
  addGlobalAttributes() {
    return [
      {
        types: ['textStyle'],
        attributes: {
          fontSize: {
            default: null,
            parseHTML: (el: HTMLElement) => el.style.fontSize || null,
            renderHTML: (attrs: Record<string, any>) =>
              attrs.fontSize ? { style: `font-size: ${attrs.fontSize}` } : {},
          },
        },
      },
    ]
  },
  addCommands() {
    return {
      setFontSize:
        (size: string) =>
        ({ chain }: any) =>
          chain().setMark('textStyle', { fontSize: size }).run(),
      unsetFontSize:
        () =>
        ({ chain }: any) =>
          chain().setMark('textStyle', { fontSize: null }).removeEmptyTextStyle().run(),
    } as any
  },
})

// Comment + suggestion marks (visual only — full panel is on the document editor)
const CommentMark = Mark.create({
  name: 'comment',
  addAttributes() {
    return { commentId: { default: null } }
  },
  parseHTML() {
    return [{ tag: 'span[data-comment-id]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      {
        'data-comment-id': HTMLAttributes.commentId,
        class: 'comment-highlight',
        style: 'background-color: #fff3cd; border-bottom: 2px solid #ffc107;',
      },
      0,
    ]
  },
})

const SuggestionMark = Mark.create({
  name: 'suggestion',
  addAttributes() {
    return { suggestionId: { default: null } }
  },
  parseHTML() {
    return [{ tag: 'span[data-suggestion-id]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      {
        'data-suggestion-id': HTMLAttributes.suggestionId,
        class: 'suggestion-highlight',
        style: 'background-color: #d4edda; border-bottom: 2px dashed #28a745;',
      },
      0,
    ]
  },
})

export interface SheetData {
  id: string
  name: string
  columns: string[]
  rows: Record<string, string>[]
  createdAt: number
  updatedAt: number
}

export interface SpreadsheetProps {
  sheets: SheetData[]
  activeSheetId: string | null
  onChange: (sheets: SheetData[], activeSheetId: string | null) => void
  onAddSheet: () => void
  onRenameSheet: (id: string, name: string) => void
  onDeleteSheet: (id: string) => void
  onSwitchSheet: (id: string) => void
  toolbarExtras?: React.ReactNode
  lockedColumns?: boolean
  readOnlyColumns?: string[]
}

function ToolbarBtn({
  active,
  onClick,
  children,
  title,
  disabled,
}: {
  active?: boolean
  onClick: () => void
  children: React.ReactNode
  title?: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`px-2 py-1 text-xs rounded transition-colors border ${
        disabled
          ? 'opacity-40 cursor-not-allowed bg-gray-50 border-gray-100 text-gray-400'
          : active
            ? 'bg-[#A52A2A] text-white border-[#A52A2A]'
            : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-100'
      }`}
    >
      {children}
    </button>
  )
}

function ToolbarDivider() {
  return <div className="w-px h-6 bg-gray-300 mx-0.5" />
}

interface CellEditorProps {
  value: string
  onCommit: (html: string) => void
  onFocus: (editor: TiptapEditor) => void
  onBlur: () => void
}

function ActiveCellEditor({ value, onCommit, onFocus, onBlur }: CellEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: false, codeBlock: false }),
      Underline,
      TextStyle,
      FontFamily,
      FontSize,
      Color,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ['paragraph'] }),
      CommentMark,
      SuggestionMark,
      Placeholder.configure({ placeholder: '' }),
    ],
    content: value || '',
    autofocus: 'end',
    editorProps: {
      attributes: {
        class: 'arsr-cell-editor outline-none px-2 py-1 min-h-[28px] text-sm',
      },
    },
    onCreate: ({ editor }) => onFocus(editor as TiptapEditor),
    onFocus: ({ editor }) => onFocus(editor as TiptapEditor),
    onBlur: () => {
      onBlur()
      onCommit(editor?.getHTML() || '')
    },
  })

  if (!editor) {
    return (
      <div
        className="px-2 py-1 min-h-[28px] text-sm"
        dangerouslySetInnerHTML={{ __html: value || '<br/>' }}
      />
    )
  }
  return <EditorContent editor={editor} />
}

function CellPreview({ value, onClick }: { value: string; onClick: () => void }) {
  return (
    <div
      className="px-2 py-1 min-h-[28px] text-sm cursor-text arsr-cell-editor"
      onClick={onClick}
      dangerouslySetInnerHTML={{ __html: value || '<br/>' }}
    />
  )
}

export default function Spreadsheet({
  sheets,
  activeSheetId,
  onChange,
  onAddSheet,
  onRenameSheet,
  onDeleteSheet,
  onSwitchSheet,
  toolbarExtras,
  lockedColumns,
  readOnlyColumns,
}: SpreadsheetProps) {
  const activeSheet = sheets.find((s) => s.id === activeSheetId) || sheets[0] || null
  const [focusedEditor, setFocusedEditor] = useState<TiptapEditor | null>(null)
  const [activeCell, setActiveCell] = useState<{ row: number; col: string } | null>(null)
  const [, setForceTick] = useState(0)
  const [renamingSheetId, setRenamingSheetId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const isReadOnlyCol = (col: string) =>
    Array.isArray(readOnlyColumns) && readOnlyColumns.includes(col)

  // Force re-render when toolbar buttons should reflect editor selection state.
  useEffect(() => {
    if (!focusedEditor) return
    const handler = () => setForceTick((t) => t + 1)
    focusedEditor.on('selectionUpdate', handler)
    focusedEditor.on('transaction', handler)
    return () => {
      focusedEditor.off('selectionUpdate', handler)
      focusedEditor.off('transaction', handler)
    }
  }, [focusedEditor])

  const updateCell = useCallback(
    (rowIdx: number, col: string, html: string) => {
      if (!activeSheet) return
      const updated = sheets.map((s) => {
        if (s.id !== activeSheet.id) return s
        const rows = s.rows.slice()
        while (rows.length <= rowIdx) rows.push({})
        const existing = rows[rowIdx] || {}
        if (existing[col] === html) return s
        rows[rowIdx] = { ...existing, [col]: html }
        return { ...s, rows, updatedAt: Date.now() }
      })
      onChange(updated, activeSheet.id)
    },
    [activeSheet, sheets, onChange],
  )

  const addRow = () => {
    if (!activeSheet) return
    const updated = sheets.map((s) => {
      if (s.id !== activeSheet.id) return s
      return { ...s, rows: [...s.rows, {}], updatedAt: Date.now() }
    })
    onChange(updated, activeSheet.id)
  }

  const addColumn = () => {
    if (!activeSheet || lockedColumns) return
    const name = prompt('Column name:')
    if (!name) return
    const updated = sheets.map((s) => {
      if (s.id !== activeSheet.id) return s
      return { ...s, columns: [...s.columns, name], updatedAt: Date.now() }
    })
    onChange(updated, activeSheet.id)
  }

  const renameColumn = (col: string) => {
    if (!activeSheet || lockedColumns) return
    const newName = prompt('Rename column:', col)
    if (!newName || newName === col) return
    const updated = sheets.map((s) => {
      if (s.id !== activeSheet.id) return s
      const idx = s.columns.indexOf(col)
      if (idx === -1) return s
      const cols = s.columns.slice()
      cols[idx] = newName
      const rows = s.rows.map((r) => {
        const next = { ...r }
        if (col in next) {
          next[newName] = next[col]
          delete next[col]
        }
        return next
      })
      return { ...s, columns: cols, rows, updatedAt: Date.now() }
    })
    onChange(updated, activeSheet.id)
  }

  const deleteColumn = (col: string) => {
    if (!activeSheet || lockedColumns) return
    if (!confirm(`Delete column "${col}"?`)) return
    const updated = sheets.map((s) => {
      if (s.id !== activeSheet.id) return s
      return {
        ...s,
        columns: s.columns.filter((c) => c !== col),
        rows: s.rows.map((r) => {
          const next = { ...r }
          delete next[col]
          return next
        }),
        updatedAt: Date.now(),
      }
    })
    onChange(updated, activeSheet.id)
  }

  const deleteRow = (rowIdx: number) => {
    if (!activeSheet) return
    const updated = sheets.map((s) => {
      if (s.id !== activeSheet.id) return s
      return { ...s, rows: s.rows.filter((_, i) => i !== rowIdx), updatedAt: Date.now() }
    })
    onChange(updated, activeSheet.id)
  }

  // Toolbar actions delegate to focusedEditor
  const fontFamilyValue = focusedEditor?.getAttributes('textStyle').fontFamily || ''
  const fontSizeValue = focusedEditor?.getAttributes('textStyle').fontSize || ''

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Sticky toolbar */}
      <div className="sticky top-0 z-30 bg-gray-50 border-b border-gray-200 flex flex-wrap items-center gap-0.5 px-3 py-1.5">
        <ToolbarBtn
          onClick={() => focusedEditor?.chain().focus().undo().run()}
          title="Undo"
          disabled={!focusedEditor?.can().undo()}
        >
          &#8617;
        </ToolbarBtn>
        <ToolbarBtn
          onClick={() => focusedEditor?.chain().focus().redo().run()}
          title="Redo"
          disabled={!focusedEditor?.can().redo()}
        >
          &#8618;
        </ToolbarBtn>
        <ToolbarDivider />

        <select
          title="Font family"
          value={fontFamilyValue}
          onChange={(e) => {
            const v = e.target.value
            if (!focusedEditor) return
            if (v) focusedEditor.chain().focus().setFontFamily(v).run()
            else focusedEditor.chain().focus().unsetFontFamily().run()
          }}
          className="text-xs border border-gray-200 rounded px-1 py-1 bg-white text-gray-700 w-28"
        >
          {FONT_FAMILIES.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>

        <select
          title="Font size"
          value={fontSizeValue}
          onChange={(e) => {
            const v = e.target.value
            if (!focusedEditor) return
            if (v) (focusedEditor.chain().focus() as any).setFontSize(v).run()
            else (focusedEditor.chain().focus() as any).unsetFontSize().run()
          }}
          className="text-xs border border-gray-200 rounded px-1 py-1 bg-white text-gray-700 w-16"
        >
          <option value="">Size</option>
          {FONT_SIZES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <ToolbarDivider />

        <ToolbarBtn
          active={focusedEditor?.isActive('bold')}
          onClick={() => focusedEditor?.chain().focus().toggleBold().run()}
          title="Bold"
        >
          <strong>B</strong>
        </ToolbarBtn>
        <ToolbarBtn
          active={focusedEditor?.isActive('italic')}
          onClick={() => focusedEditor?.chain().focus().toggleItalic().run()}
          title="Italic"
        >
          <em>I</em>
        </ToolbarBtn>
        <ToolbarBtn
          active={focusedEditor?.isActive('underline')}
          onClick={() => focusedEditor?.chain().focus().toggleUnderline().run()}
          title="Underline"
        >
          <span className="underline">U</span>
        </ToolbarBtn>
        <ToolbarBtn
          active={focusedEditor?.isActive('strike')}
          onClick={() => focusedEditor?.chain().focus().toggleStrike().run()}
          title="Strikethrough"
        >
          <span className="line-through">S</span>
        </ToolbarBtn>
        <ToolbarDivider />

        {/* Text color */}
        <div className="relative group">
          <ToolbarBtn onClick={() => {}} title="Text Color">
            <span style={{ color: focusedEditor?.getAttributes('textStyle').color || '#000' }}>
              A
            </span>
          </ToolbarBtn>
          <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 p-2 hidden group-hover:grid grid-cols-5 gap-1">
            {TEXT_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => (focusedEditor?.chain().focus() as any)?.setColor(c).run()}
                className="w-6 h-6 rounded border border-gray-200"
                style={{ backgroundColor: c }}
              />
            ))}
            <button
              onClick={() => (focusedEditor?.chain().focus() as any)?.unsetColor().run()}
              className="col-span-5 text-[10px] text-gray-500 hover:text-gray-700 mt-1"
            >
              Clear color
            </button>
          </div>
        </div>

        {/* Highlight */}
        <div className="relative group">
          <ToolbarBtn
            active={focusedEditor?.isActive('highlight')}
            onClick={() => {}}
            title="Highlight"
          >
            <span className="bg-yellow-200 px-0.5">H</span>
          </ToolbarBtn>
          <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 p-2 hidden group-hover:grid grid-cols-5 gap-1">
            {HIGHLIGHT_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => {
                  if (!focusedEditor) return
                  if (c === 'transparent') focusedEditor.chain().focus().unsetHighlight().run()
                  else focusedEditor.chain().focus().toggleHighlight({ color: c }).run()
                }}
                className="w-6 h-6 rounded border border-gray-200"
                style={{ backgroundColor: c === 'transparent' ? '#fff' : c }}
              />
            ))}
          </div>
        </div>
        <ToolbarDivider />

        <ToolbarBtn
          active={focusedEditor?.isActive({ textAlign: 'left' })}
          onClick={() => focusedEditor?.chain().focus().setTextAlign('left').run()}
          title="Align Left"
        >
          L
        </ToolbarBtn>
        <ToolbarBtn
          active={focusedEditor?.isActive({ textAlign: 'center' })}
          onClick={() => focusedEditor?.chain().focus().setTextAlign('center').run()}
          title="Center"
        >
          C
        </ToolbarBtn>
        <ToolbarBtn
          active={focusedEditor?.isActive({ textAlign: 'right' })}
          onClick={() => focusedEditor?.chain().focus().setTextAlign('right').run()}
          title="Align Right"
        >
          R
        </ToolbarBtn>
        <ToolbarBtn
          active={focusedEditor?.isActive({ textAlign: 'justify' })}
          onClick={() => focusedEditor?.chain().focus().setTextAlign('justify').run()}
          title="Justify"
        >
          J
        </ToolbarBtn>
        <ToolbarDivider />

        <ToolbarBtn
          active={focusedEditor?.isActive('bulletList')}
          onClick={() => focusedEditor?.chain().focus().toggleBulletList().run()}
          title="Bullet List"
        >
          &#8226;
        </ToolbarBtn>
        <ToolbarBtn
          active={focusedEditor?.isActive('orderedList')}
          onClick={() => focusedEditor?.chain().focus().toggleOrderedList().run()}
          title="Numbered List"
        >
          1.
        </ToolbarBtn>
        <ToolbarDivider />

        <ToolbarBtn
          onClick={() => {
            if (!focusedEditor) return
            const id = `cmt_${Date.now()}`
            ;(focusedEditor.chain().focus() as any).setMark('comment', { commentId: id }).run()
          }}
          title="Add Comment"
        >
          &#128172;
        </ToolbarBtn>
        <ToolbarBtn
          onClick={() => {
            if (!focusedEditor) return
            const id = `sug_${Date.now()}`
            ;(focusedEditor.chain().focus() as any)
              .setMark('suggestion', { suggestionId: id })
              .run()
          }}
          title="Add Suggestion"
        >
          &#9999;
        </ToolbarBtn>

        {toolbarExtras && (
          <>
            <ToolbarDivider />
            {toolbarExtras}
          </>
        )}
      </div>

      {/* Sheet tabs */}
      <div className="border-b border-gray-200 bg-gray-50 flex items-center gap-1 px-2 py-1 overflow-x-auto">
        {sheets.map((s) => {
          const active = s.id === activeSheetId
          if (renamingSheetId === s.id) {
            return (
              <input
                key={s.id}
                autoFocus
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={() => {
                  if (renameValue.trim()) onRenameSheet(s.id, renameValue.trim())
                  setRenamingSheetId(null)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    if (renameValue.trim()) onRenameSheet(s.id, renameValue.trim())
                    setRenamingSheetId(null)
                  } else if (e.key === 'Escape') {
                    setRenamingSheetId(null)
                  }
                }}
                className="text-xs border border-[#A52A2A] rounded px-2 py-1 bg-white outline-none"
              />
            )
          }
          return (
            <div
              key={s.id}
              className={`group flex items-center gap-1 px-2 py-1 rounded text-xs cursor-pointer border ${
                active
                  ? 'bg-white border-[#A52A2A] text-[#A52A2A]'
                  : 'border-transparent text-gray-600 hover:bg-white'
              }`}
              onClick={() => onSwitchSheet(s.id)}
              onDoubleClick={() => {
                setRenamingSheetId(s.id)
                setRenameValue(s.name)
              }}
              title="Double-click to rename"
            >
              <span>{s.name}</span>
              {sheets.length > 1 && (
                <button
                  type="button"
                  className="opacity-0 group-hover:opacity-100 hover:text-red-600 ml-1"
                  onClick={(e) => {
                    e.stopPropagation()
                    if (confirm(`Delete sheet "${s.name}"?`)) onDeleteSheet(s.id)
                  }}
                  aria-label="Delete sheet"
                >
                  &times;
                </button>
              )}
            </div>
          )
        })}
        <button
          type="button"
          onClick={onAddSheet}
          className="text-xs px-2 py-1 rounded text-gray-500 hover:text-[#A52A2A] hover:bg-white border border-dashed border-gray-300"
        >
          + Sheet
        </button>
      </div>

      {/* Grid */}
      <div className="flex-1 min-h-0 overflow-auto">
        {activeSheet ? (
          <table className="border-collapse w-max min-w-full">
            <thead className="sticky top-0 z-20 bg-gray-100">
              <tr>
                <th className="w-10 border border-gray-200 bg-gray-100 text-xs text-gray-400 sticky left-0 z-10">
                  #
                </th>
                {activeSheet.columns.map((col) => (
                  <th
                    key={col}
                    className="border border-gray-200 bg-gray-100 text-xs font-semibold text-gray-700 px-2 py-1 min-w-[160px] text-left group/col"
                    onDoubleClick={() => renameColumn(col)}
                    title={lockedColumns ? col : 'Double-click to rename'}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span>{col}</span>
                      {!lockedColumns && (
                        <button
                          type="button"
                          onClick={() => deleteColumn(col)}
                          className="opacity-0 group-hover/col:opacity-100 text-gray-400 hover:text-red-600 text-[10px]"
                          aria-label="Delete column"
                        >
                          &times;
                        </button>
                      )}
                    </div>
                  </th>
                ))}
                {!lockedColumns && (
                  <th className="border border-gray-200 bg-gray-100 px-2 py-1 w-10">
                    <button
                      type="button"
                      onClick={addColumn}
                      className="text-xs text-gray-500 hover:text-[#A52A2A]"
                      title="Add column"
                    >
                      +
                    </button>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {activeSheet.rows.map((row, rIdx) => (
                <tr key={rIdx} className="group/row">
                  <td className="w-10 border border-gray-200 bg-gray-50 text-[10px] text-gray-400 text-center sticky left-0 z-10">
                    <div className="flex items-center justify-center gap-1">
                      <span>{rIdx + 1}</span>
                      <button
                        type="button"
                        onClick={() => deleteRow(rIdx)}
                        className="opacity-0 group-hover/row:opacity-100 text-gray-400 hover:text-red-600"
                        aria-label="Delete row"
                      >
                        &times;
                      </button>
                    </div>
                  </td>
                  {activeSheet.columns.map((col) => {
                    const isActive =
                      activeCell?.row === rIdx && activeCell?.col === col
                    const readOnly = isReadOnlyCol(col)
                    return (
                      <td
                        key={col}
                        className={`border border-gray-200 align-top ${
                          isActive ? 'ring-2 ring-[#A52A2A] bg-yellow-50' : 'bg-white'
                        } ${readOnly ? 'bg-gray-50' : ''}`}
                        onClick={() => {
                          if (readOnly) return
                          setActiveCell({ row: rIdx, col })
                        }}
                      >
                        {isActive && !readOnly ? (
                          <ActiveCellEditor
                            key={`${activeSheet.id}-${rIdx}-${col}`}
                            value={row[col] || ''}
                            onCommit={(html) => updateCell(rIdx, col, html)}
                            onFocus={(ed) => setFocusedEditor(ed)}
                            onBlur={() => {}}
                          />
                        ) : (
                          <CellPreview
                            value={row[col] || ''}
                            onClick={() => {
                              if (readOnly) return
                              setActiveCell({ row: rIdx, col })
                            }}
                          />
                        )}
                      </td>
                    )
                  })}
                  {!lockedColumns && <td className="border border-gray-200 bg-white" />}
                </tr>
              ))}
              <tr>
                <td colSpan={activeSheet.columns.length + (lockedColumns ? 1 : 2)}>
                  <button
                    type="button"
                    onClick={addRow}
                    className="w-full text-xs text-gray-500 hover:text-[#A52A2A] py-1.5 hover:bg-gray-50"
                  >
                    + Add row
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        ) : (
          <div className="p-6 text-sm text-gray-500">No sheet selected.</div>
        )}
      </div>
    </div>
  )
}
