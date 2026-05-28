import { useState, useEffect, useCallback } from 'react'
import type { Editor } from '@tiptap/react'
import { apiFetch } from '@/lib/auth'

interface Reply {
  id: string
  text: string
  authorName: string
  authorEmail: string
  role: string
  timestamp: number
}

interface Comment {
  id: string
  selectedText: string
  from: number
  to: number
  text: string
  authorName: string
  authorEmail: string
  role: string
  timestamp: number
  resolved: boolean
  replies: Reply[]
}

interface CommentPanelProps {
  docId: number
  userEmail: string
  currentUserEmail: string
  currentUserName: string
  userRole: 'admin' | 'mentor' | 'student'
  editor: Editor
  onClose: () => void
  onSave: () => void
}

const ROLE_COLORS: Record<string, string> = {
  admin: 'bg-red-100 text-red-700',
  mentor: 'bg-blue-100 text-blue-700',
  student: 'bg-green-100 text-green-700',
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

export default function CommentPanel({
  docId, userEmail, currentUserEmail, userRole, editor, onClose, onSave,
}: CommentPanelProps) {
  const [comments, setComments] = useState<Comment[]>([])
  const [loading, setLoading] = useState(true)
  const [replyingTo, setReplyingTo] = useState<string | null>(null)
  const [replyText, setReplyText] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [showResolved, setShowResolved] = useState(false)

  const fetchComments = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/comments?email=${encodeURIComponent(userEmail)}&docId=${docId}`)
      const data = await res.json()
      setComments(data.comments || [])
    } catch {
      setComments([])
    } finally {
      setLoading(false)
    }
  }, [userEmail, docId])

  useEffect(() => { fetchComments() }, [fetchComments])

  // Auto-refresh every 3 seconds for live visibility
  useEffect(() => {
    const interval = setInterval(fetchComments, 3000)
    return () => clearInterval(interval)
  }, [fetchComments])

  async function handleReply(commentId: string) {
    if (!replyText.trim()) return
    await apiFetch('/api/comments', {
      method: 'POST',
      body: JSON.stringify({ email: userEmail, docId, parentId: commentId, text: replyText }),
    })
    setReplyText('')
    setReplyingTo(null)
    fetchComments()
  }

  async function handleResolve(commentId: string, resolved: boolean) {
    await apiFetch('/api/comments', {
      method: 'PUT',
      body: JSON.stringify({ email: userEmail, docId, commentId, resolved }),
    })
    fetchComments()
  }

  async function handleEditComment(commentId: string, replyId?: string) {
    if (!editText.trim()) return
    await apiFetch('/api/comments', {
      method: 'PUT',
      body: JSON.stringify({ email: userEmail, docId, commentId, replyId, text: editText }),
    })
    setEditingId(null)
    setEditText('')
    fetchComments()
  }

  async function handleDeleteComment(commentId: string) {
    if (!confirm('Delete this comment?')) return
    await apiFetch(`/api/comments?email=${encodeURIComponent(userEmail)}&docId=${docId}&commentId=${commentId}`, {
      method: 'DELETE',
    })
    // Remove highlight from editor
    const { state } = editor
    const { tr } = state
    let modified = false
    state.doc.descendants((node, pos) => {
      node.marks.forEach(mark => {
        if (mark.type.name === 'comment' && mark.attrs.commentId === commentId) {
          tr.removeMark(pos, pos + node.nodeSize, mark.type)
          modified = true
        }
      })
    })
    if (modified) {
      editor.view.dispatch(tr)
      onSave()
    }
    fetchComments()
  }

  async function handleDeleteReply(commentId: string, replyId: string) {
    if (!confirm('Delete this reply?')) return
    await apiFetch(`/api/comments?email=${encodeURIComponent(userEmail)}&docId=${docId}&commentId=${commentId}&replyId=${replyId}`, {
      method: 'DELETE',
    })
    fetchComments()
  }

  function scrollToComment(comment: Comment) {
    if (comment.from && editor) {
      try {
        editor.chain().focus().setTextSelection(comment.from).scrollIntoView().run()
      } catch {}
    }
  }

  const filteredComments = showResolved ? comments : comments.filter(c => !c.resolved)

  return (
    <div className="w-80 shrink-0 border-l border-gray-200 bg-white overflow-y-auto flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50">
        <h3 className="text-sm font-semibold text-gray-700">Comments</h3>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1 text-[10px] text-gray-500">
            <input type="checkbox" checked={showResolved} onChange={e => setShowResolved(e.target.checked)} className="w-3 h-3" />
            Resolved
          </label>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-sm">x</button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <p className="text-xs text-gray-400 p-4">Loading comments...</p>
        ) : filteredComments.length === 0 ? (
          <p className="text-xs text-gray-400 p-4">No comments yet. Select text and click the comment button to add one.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {filteredComments.map(comment => (
              <div key={comment.id}
                className={`p-3 hover:bg-gray-50 cursor-pointer transition-colors ${comment.resolved ? 'opacity-60' : ''}`}
                onClick={() => scrollToComment(comment)}>
                {/* Comment header */}
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-medium text-gray-800">{comment.authorName}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${ROLE_COLORS[comment.role] || 'bg-gray-100 text-gray-600'}`}>
                    {comment.role}
                  </span>
                  <span className="text-[10px] text-gray-400 ml-auto">{timeAgo(comment.timestamp)}</span>
                </div>

                {/* Selected text */}
                {comment.selectedText && (
                  <div className="text-[10px] text-gray-500 bg-yellow-50 border-l-2 border-yellow-300 px-2 py-1 mb-1.5 italic truncate">
                    "{comment.selectedText}"
                  </div>
                )}

                {/* Comment text */}
                {editingId === comment.id ? (
                  <div className="flex gap-1 mb-1">
                    <input value={editText} onChange={e => setEditText(e.target.value)}
                      className="flex-1 border border-gray-200 rounded px-2 py-1 text-xs" autoFocus />
                    <button onClick={(e) => { e.stopPropagation(); handleEditComment(comment.id) }}
                      className="text-xs text-[#A52A2A] hover:underline">Save</button>
                    <button onClick={(e) => { e.stopPropagation(); setEditingId(null) }}
                      className="text-xs text-gray-400 hover:underline">Cancel</button>
                  </div>
                ) : (
                  <p className="text-xs text-gray-700 mb-1.5">{comment.text}</p>
                )}

                {/* Actions */}
                <div className="flex items-center gap-2 mb-1" onClick={e => e.stopPropagation()}>
                  <button onClick={() => { setReplyingTo(replyingTo === comment.id ? null : comment.id); setReplyText('') }}
                    className="text-[10px] text-gray-500 hover:text-[#A52A2A]">Reply</button>
                  <button onClick={() => handleResolve(comment.id, !comment.resolved)}
                    className="text-[10px] text-gray-500 hover:text-green-600">
                    {comment.resolved ? 'Reopen' : 'Resolve'}
                  </button>
                  {(comment.authorEmail === currentUserEmail || userRole === 'admin') && (
                    <>
                      <button onClick={() => { setEditingId(comment.id); setEditText(comment.text) }}
                        className="text-[10px] text-gray-500 hover:text-blue-600">Edit</button>
                      <button onClick={() => handleDeleteComment(comment.id)}
                        className="text-[10px] text-gray-500 hover:text-red-600">Delete</button>
                    </>
                  )}
                </div>

                {/* Replies */}
                {comment.replies.length > 0 && (
                  <div className="ml-3 border-l-2 border-gray-100 pl-2 space-y-2 mt-2">
                    {comment.replies.map(reply => (
                      <div key={reply.id} className="text-xs" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-1 mb-0.5">
                          <span className="font-medium text-gray-700">{reply.authorName}</span>
                          <span className={`text-[9px] px-1 py-0 rounded ${ROLE_COLORS[reply.role] || 'bg-gray-100 text-gray-600'}`}>
                            {reply.role}
                          </span>
                          <span className="text-[10px] text-gray-400 ml-auto">{timeAgo(reply.timestamp)}</span>
                        </div>
                        {editingId === reply.id ? (
                          <div className="flex gap-1">
                            <input value={editText} onChange={e => setEditText(e.target.value)}
                              className="flex-1 border border-gray-200 rounded px-1.5 py-0.5 text-[11px]" autoFocus />
                            <button onClick={() => handleEditComment(comment.id, reply.id)}
                              className="text-[10px] text-[#A52A2A]">Save</button>
                            <button onClick={() => setEditingId(null)}
                              className="text-[10px] text-gray-400">Cancel</button>
                          </div>
                        ) : (
                          <p className="text-gray-600">{reply.text}</p>
                        )}
                        {(reply.authorEmail === currentUserEmail || userRole === 'admin') && editingId !== reply.id && (
                          <div className="flex gap-2 mt-0.5">
                            <button onClick={() => { setEditingId(reply.id); setEditText(reply.text) }}
                              className="text-[10px] text-gray-400 hover:text-blue-600">Edit</button>
                            <button onClick={() => handleDeleteReply(comment.id, reply.id)}
                              className="text-[10px] text-gray-400 hover:text-red-600">Delete</button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Reply input */}
                {replyingTo === comment.id && (
                  <div className="mt-2 flex gap-1" onClick={e => e.stopPropagation()}>
                    <input value={replyText} onChange={e => setReplyText(e.target.value)}
                      placeholder="Write a reply..."
                      className="flex-1 border border-gray-200 rounded px-2 py-1 text-xs"
                      autoFocus
                      onKeyDown={e => { if (e.key === 'Enter') handleReply(comment.id) }} />
                    <button onClick={() => handleReply(comment.id)}
                      className="text-xs bg-[#A52A2A] text-white px-2 py-1 rounded hover:bg-[#8B1A1A]">Send</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
