import { useState, useRef } from 'react'

export interface DocTab {
  id: string
  title: string
  content: string
}

interface DocumentTabsBarProps {
  tabs: DocTab[] | null
  activeTabId: string | null
  canEdit: boolean
  onSwitch: (tabId: string) => void
  onAdd?: () => void
  onRename?: (tabId: string, newTitle: string) => void
  onDelete?: (tabId: string) => void
  onReorder?: (reorderedTabs: DocTab[]) => void
}

export default function DocumentTabsBar({
  tabs,
  activeTabId,
  canEdit,
  onSwitch,
  onAdd,
  onRename,
  onDelete,
  onReorder,
}: DocumentTabsBarProps) {
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const dragIndexRef = useRef<number | null>(null)

  if (!tabs || tabs.length === 0) {
    if (!canEdit) return null
    return (
      <div className="bg-gray-50 border-b border-gray-200 px-4 py-1.5 flex items-center gap-2 flex-none z-10">
        <span className="text-[11px] text-gray-400 uppercase tracking-wide">Tabs</span>
        <button
          onClick={() => onAdd?.()}
          className="text-xs px-2 py-1 rounded border border-dashed border-gray-300 text-gray-500 hover:border-[#A52A2A] hover:text-[#A52A2A] transition-colors"
        >
          + Add Tab
        </button>
      </div>
    )
  }

  const effectiveActiveId = activeTabId ?? tabs[0]?.id

  function handleDragStart(index: number) {
    dragIndexRef.current = index
  }

  function handleDragOver(e: React.DragEvent, index: number) {
    e.preventDefault()
    if (dragIndexRef.current === null || dragIndexRef.current === index) {
      setDragOverIndex(null)
      return
    }
    setDragOverIndex(index)
  }

  function handleDrop(e: React.DragEvent, dropIndex: number) {
    e.preventDefault()
    const fromIndex = dragIndexRef.current
    if (fromIndex === null || fromIndex === dropIndex || !tabs) return

    const reordered = [...tabs]
    const [moved] = reordered.splice(fromIndex, 1)
    reordered.splice(dropIndex, 0, moved)
    onReorder?.(reordered)

    dragIndexRef.current = null
    setDragOverIndex(null)
  }

  function handleDragEnd() {
    dragIndexRef.current = null
    setDragOverIndex(null)
  }

  return (
    <div className="bg-gray-50 border-b border-gray-200 px-3 flex items-center gap-1 overflow-x-auto flex-none z-10">
      {tabs.map((t, index) => {
        const isActive = t.id === effectiveActiveId
        const isDragOver = dragOverIndex === index

        if (renamingId === t.id && canEdit) {
          return (
            <input
              key={t.id}
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onBlur={() => {
                if (renameValue.trim() && renameValue !== t.title) {
                  onRename?.(t.id, renameValue.trim())
                }
                setRenamingId(null)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  if (renameValue.trim() && renameValue !== t.title) {
                    onRename?.(t.id, renameValue.trim())
                  }
                  setRenamingId(null)
                } else if (e.key === 'Escape') {
                  setRenamingId(null)
                }
              }}
              className="px-3 py-1.5 text-xs border border-[#A52A2A] rounded-t bg-white outline-none w-32"
            />
          )
        }
        return (
          <button
            key={t.id}
            draggable={canEdit}
            onDragStart={() => handleDragStart(index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDrop={(e) => handleDrop(e, index)}
            onDragEnd={handleDragEnd}
            onClick={() => onSwitch(t.id)}
            onDoubleClick={() => {
              if (!canEdit) return
              setRenamingId(t.id)
              setRenameValue(t.title)
            }}
            className={`px-3 py-1.5 text-xs font-medium border-t-2 whitespace-nowrap flex items-center gap-1.5 transition-colors select-none ${
              isDragOver
                ? 'border-[#A52A2A] bg-[#A52A2A]/10'
                : isActive
                  ? 'border-[#A52A2A] text-[#A52A2A] bg-white'
                  : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            } ${canEdit ? 'cursor-grab active:cursor-grabbing' : ''}`}
            title={canEdit ? 'Drag to reorder · Double-click to rename' : undefined}
          >
            <span>{t.title}</span>
            {canEdit && isActive && tabs.length > 1 && (
              <span
                role="button"
                onClick={(e) => {
                  e.stopPropagation()
                  if (window.confirm(`Delete tab "${t.title}"?`)) onDelete?.(t.id)
                }}
                className="text-gray-400 hover:text-red-500 text-sm leading-none"
              >
                ×
              </span>
            )}
          </button>
        )
      })}
      {canEdit && onAdd && (
        <button
          onClick={onAdd}
          className="ml-1 px-2 py-1 text-xs rounded text-gray-400 hover:text-[#A52A2A] hover:bg-white transition-colors"
          title="Add tab"
        >
          + New Tab
        </button>
      )}
    </div>
  )
}
