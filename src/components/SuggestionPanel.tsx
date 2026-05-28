import { useState, useEffect, useCallback } from 'react'
import type { Editor } from '@tiptap/react'
import { apiFetch } from '@/lib/auth'

interface Suggestion {
  id: string
  from: number
  to: number
  originalText: string
  suggestedText: string
  authorName: string
  authorEmail: string
  role: string
  timestamp: number
  status: 'pending' | 'accepted' | 'rejected'
}

interface SuggestionPanelProps {
  docId: number
  userEmail: string
  currentUserEmail: string
  userRole: 'admin' | 'mentor' | 'student'
  editor: Editor
  onClose: () => void
  onSave: () => void
}

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  accepted: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

export default function SuggestionPanel({
  docId, userEmail, userRole, editor, onClose, onSave,
}: SuggestionPanelProps) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'pending'>('pending')

  const fetchSuggestions = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/suggestions?email=${encodeURIComponent(userEmail)}&docId=${docId}`)
      const data = await res.json()
      setSuggestions(data.suggestions || [])
    } catch {
      setSuggestions([])
    } finally {
      setLoading(false)
    }
  }, [userEmail, docId])

  useEffect(() => { fetchSuggestions() }, [fetchSuggestions])

  useEffect(() => {
    const interval = setInterval(fetchSuggestions, 3000)
    return () => clearInterval(interval)
  }, [fetchSuggestions])

  async function handleAccept(suggestion: Suggestion) {
    // Apply the suggestion to the document
    try {
      // Remove suggestion marks and apply the suggested text
      const { state } = editor
      const { tr } = state
      let modified = false
      state.doc.descendants((node, pos) => {
        node.marks.forEach(mark => {
          if (mark.type.name === 'suggestion' && mark.attrs.suggestionId === suggestion.id) {
            if (mark.attrs.type === 'delete') {
              // Remove the deleted text
              tr.delete(pos, pos + node.nodeSize)
              modified = true
            } else if (mark.attrs.type === 'insert') {
              // Keep the text but remove the suggestion mark
              tr.removeMark(pos, pos + node.nodeSize, mark.type)
              modified = true
            }
          }
        })
      })
      if (modified) {
        editor.view.dispatch(tr)
        onSave()
      }
    } catch {}

    await apiFetch('/api/suggestions', {
      method: 'PUT',
      body: JSON.stringify({ email: userEmail, docId, suggestionId: suggestion.id, status: 'accepted' }),
    })
    fetchSuggestions()
  }

  async function handleReject(suggestion: Suggestion) {
    // Remove suggestion marks and revert
    try {
      const { state } = editor
      const { tr } = state
      let modified = false
      state.doc.descendants((node, pos) => {
        node.marks.forEach(mark => {
          if (mark.type.name === 'suggestion' && mark.attrs.suggestionId === suggestion.id) {
            if (mark.attrs.type === 'insert') {
              // Remove the inserted text
              tr.delete(pos, pos + node.nodeSize)
              modified = true
            } else if (mark.attrs.type === 'delete') {
              // Keep the text but remove the mark
              tr.removeMark(pos, pos + node.nodeSize, mark.type)
              modified = true
            }
          }
        })
      })
      if (modified) {
        editor.view.dispatch(tr)
        onSave()
      }
    } catch {}

    await apiFetch('/api/suggestions', {
      method: 'PUT',
      body: JSON.stringify({ email: userEmail, docId, suggestionId: suggestion.id, status: 'rejected' }),
    })
    fetchSuggestions()
  }

  const canAcceptReject = userRole === 'admin' || userRole === 'student'
  const filtered = filter === 'pending' ? suggestions.filter(s => s.status === 'pending') : suggestions

  return (
    <div className="w-80 shrink-0 border-l border-gray-200 bg-white overflow-y-auto flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50">
        <h3 className="text-sm font-semibold text-gray-700">Suggestions</h3>
        <div className="flex items-center gap-2">
          <select value={filter} onChange={e => setFilter(e.target.value as any)}
            className="text-[10px] border border-gray-200 rounded px-1 py-0.5">
            <option value="pending">Pending</option>
            <option value="all">All</option>
          </select>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-sm">x</button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <p className="text-xs text-gray-400 p-4">Loading suggestions...</p>
        ) : filtered.length === 0 ? (
          <p className="text-xs text-gray-400 p-4">
            {filter === 'pending' ? 'No pending suggestions.' : 'No suggestions yet.'}
          </p>
        ) : (
          <div className="divide-y divide-gray-100">
            {filtered.map(suggestion => (
              <div key={suggestion.id} className="p-3 hover:bg-gray-50">
                {/* Header */}
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-xs font-medium text-gray-800">{suggestion.authorName}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${STATUS_STYLES[suggestion.status]}`}>
                    {suggestion.status}
                  </span>
                  <span className="text-[10px] text-gray-400 ml-auto">{timeAgo(suggestion.timestamp)}</span>
                </div>

                {/* Original text */}
                {suggestion.originalText && (
                  <div className="mb-1.5">
                    <span className="text-[10px] text-gray-500 uppercase font-medium">Remove:</span>
                    <div className="text-xs bg-red-50 border-l-2 border-red-300 px-2 py-1 text-red-700 line-through mt-0.5">
                      {suggestion.originalText}
                    </div>
                  </div>
                )}

                {/* Suggested text */}
                {suggestion.suggestedText && (
                  <div className="mb-1.5">
                    <span className="text-[10px] text-gray-500 uppercase font-medium">Add:</span>
                    <div className="text-xs bg-green-50 border-l-2 border-green-300 px-2 py-1 text-green-700 mt-0.5">
                      {suggestion.suggestedText}
                    </div>
                  </div>
                )}

                {/* Actions */}
                {suggestion.status === 'pending' && canAcceptReject && (
                  <div className="flex items-center gap-2 mt-2">
                    <button onClick={() => handleAccept(suggestion)}
                      className="text-[10px] bg-green-600 text-white px-2.5 py-1 rounded hover:bg-green-700 font-medium">
                      Accept
                    </button>
                    <button onClick={() => handleReject(suggestion)}
                      className="text-[10px] bg-red-500 text-white px-2.5 py-1 rounded hover:bg-red-600 font-medium">
                      Reject
                    </button>
                  </div>
                )}

                {suggestion.status === 'pending' && !canAcceptReject && (
                  <p className="text-[10px] text-gray-400 mt-1 italic">Only the document owner or admin can accept/reject</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
