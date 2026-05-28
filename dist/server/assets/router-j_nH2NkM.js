import { createRootRoute, HeadContent, Scripts, createFileRoute, useNavigate, lazyRouteComponent, createRouter } from "@tanstack/react-router";
import { jsxs, jsx, Fragment } from "react/jsx-runtime";
import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import { TextStyle } from "@tiptap/extension-text-style";
import FontFamily from "@tiptap/extension-font-family";
import { Color } from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import TextAlign from "@tiptap/extension-text-align";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { Table } from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import Link from "@tiptap/extension-link";
import ImageExt from "@tiptap/extension-image";
import HorizontalRule from "@tiptap/extension-horizontal-rule";
import Placeholder from "@tiptap/extension-placeholder";
import CharacterCount from "@tiptap/extension-character-count";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import { Extension, Mark } from "@tiptap/core";
import * as XLSX from "xlsx";
import { createHmac, timingSafeEqual } from "node:crypto";
const Route$s = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "LITWITS" }
    ]
  }),
  shellComponent: RootDocument
});
function RootDocument({ children }) {
  return /* @__PURE__ */ jsxs("html", { lang: "en", children: [
    /* @__PURE__ */ jsx("head", { children: /* @__PURE__ */ jsx(HeadContent, {}) }),
    /* @__PURE__ */ jsxs("body", { children: [
      children,
      /* @__PURE__ */ jsx(Scripts, {})
    ] })
  ] });
}
function getToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("litwits_token");
}
function setToken(token) {
  localStorage.setItem("litwits_token", token);
}
function clearAuth() {
  localStorage.removeItem("litwits_token");
  localStorage.removeItem("litwits_user");
}
function getUser() {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("litwits_user");
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
function setUser(user) {
  localStorage.setItem("litwits_user", JSON.stringify(user));
}
async function apiFetch(url, options = {}) {
  const token = getToken();
  const headers = {
    "Content-Type": "application/json",
    ...options.headers || {}
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return fetch(url, { ...options, headers });
}
async function saveTabOrder(documentKey, tabIds) {
  try {
    await apiFetch("/api/tab-order", {
      method: "POST",
      body: JSON.stringify({ documentKey, tabOrder: tabIds })
    });
  } catch {
  }
}
const ROLE_COLORS = {
  admin: "bg-red-100 text-red-700",
  mentor: "bg-blue-100 text-blue-700",
  student: "bg-green-100 text-green-700"
};
function timeAgo$1(ts) {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 6e4);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}
function CommentPanel({
  docId,
  userEmail,
  currentUserEmail,
  userRole,
  editor,
  onClose,
  onSave
}) {
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [replyingTo, setReplyingTo] = useState(null);
  const [replyText, setReplyText] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState("");
  const [showResolved, setShowResolved] = useState(false);
  const fetchComments = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/comments?email=${encodeURIComponent(userEmail)}&docId=${docId}`);
      const data = await res.json();
      setComments(data.comments || []);
    } catch {
      setComments([]);
    } finally {
      setLoading(false);
    }
  }, [userEmail, docId]);
  useEffect(() => {
    fetchComments();
  }, [fetchComments]);
  useEffect(() => {
    const interval = setInterval(fetchComments, 3e3);
    return () => clearInterval(interval);
  }, [fetchComments]);
  async function handleReply(commentId) {
    if (!replyText.trim()) return;
    await apiFetch("/api/comments", {
      method: "POST",
      body: JSON.stringify({ email: userEmail, docId, parentId: commentId, text: replyText })
    });
    setReplyText("");
    setReplyingTo(null);
    fetchComments();
  }
  async function handleResolve(commentId, resolved) {
    await apiFetch("/api/comments", {
      method: "PUT",
      body: JSON.stringify({ email: userEmail, docId, commentId, resolved })
    });
    fetchComments();
  }
  async function handleEditComment(commentId, replyId) {
    if (!editText.trim()) return;
    await apiFetch("/api/comments", {
      method: "PUT",
      body: JSON.stringify({ email: userEmail, docId, commentId, replyId, text: editText })
    });
    setEditingId(null);
    setEditText("");
    fetchComments();
  }
  async function handleDeleteComment(commentId) {
    if (!confirm("Delete this comment?")) return;
    await apiFetch(`/api/comments?email=${encodeURIComponent(userEmail)}&docId=${docId}&commentId=${commentId}`, {
      method: "DELETE"
    });
    const { state } = editor;
    const { tr } = state;
    let modified = false;
    state.doc.descendants((node, pos) => {
      node.marks.forEach((mark) => {
        if (mark.type.name === "comment" && mark.attrs.commentId === commentId) {
          tr.removeMark(pos, pos + node.nodeSize, mark.type);
          modified = true;
        }
      });
    });
    if (modified) {
      editor.view.dispatch(tr);
      onSave();
    }
    fetchComments();
  }
  async function handleDeleteReply(commentId, replyId) {
    if (!confirm("Delete this reply?")) return;
    await apiFetch(`/api/comments?email=${encodeURIComponent(userEmail)}&docId=${docId}&commentId=${commentId}&replyId=${replyId}`, {
      method: "DELETE"
    });
    fetchComments();
  }
  function scrollToComment(comment) {
    if (comment.from && editor) {
      try {
        editor.chain().focus().setTextSelection(comment.from).scrollIntoView().run();
      } catch {
      }
    }
  }
  const filteredComments = showResolved ? comments : comments.filter((c) => !c.resolved);
  return /* @__PURE__ */ jsxs("div", { className: "w-80 shrink-0 border-l border-gray-200 bg-white overflow-y-auto flex flex-col", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50", children: [
      /* @__PURE__ */ jsx("h3", { className: "text-sm font-semibold text-gray-700", children: "Comments" }),
      /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsxs("label", { className: "flex items-center gap-1 text-[10px] text-gray-500", children: [
          /* @__PURE__ */ jsx("input", { type: "checkbox", checked: showResolved, onChange: (e) => setShowResolved(e.target.checked), className: "w-3 h-3" }),
          "Resolved"
        ] }),
        /* @__PURE__ */ jsx("button", { onClick: onClose, className: "text-gray-400 hover:text-gray-600 text-sm", children: "x" })
      ] })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "flex-1 overflow-y-auto", children: loading ? /* @__PURE__ */ jsx("p", { className: "text-xs text-gray-400 p-4", children: "Loading comments..." }) : filteredComments.length === 0 ? /* @__PURE__ */ jsx("p", { className: "text-xs text-gray-400 p-4", children: "No comments yet. Select text and click the comment button to add one." }) : /* @__PURE__ */ jsx("div", { className: "divide-y divide-gray-100", children: filteredComments.map((comment) => /* @__PURE__ */ jsxs(
      "div",
      {
        className: `p-3 hover:bg-gray-50 cursor-pointer transition-colors ${comment.resolved ? "opacity-60" : ""}`,
        onClick: () => scrollToComment(comment),
        children: [
          /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 mb-1", children: [
            /* @__PURE__ */ jsx("span", { className: "text-xs font-medium text-gray-800", children: comment.authorName }),
            /* @__PURE__ */ jsx("span", { className: `text-[10px] px-1.5 py-0.5 rounded ${ROLE_COLORS[comment.role] || "bg-gray-100 text-gray-600"}`, children: comment.role }),
            /* @__PURE__ */ jsx("span", { className: "text-[10px] text-gray-400 ml-auto", children: timeAgo$1(comment.timestamp) })
          ] }),
          comment.selectedText && /* @__PURE__ */ jsxs("div", { className: "text-[10px] text-gray-500 bg-yellow-50 border-l-2 border-yellow-300 px-2 py-1 mb-1.5 italic truncate", children: [
            '"',
            comment.selectedText,
            '"'
          ] }),
          editingId === comment.id ? /* @__PURE__ */ jsxs("div", { className: "flex gap-1 mb-1", children: [
            /* @__PURE__ */ jsx(
              "input",
              {
                value: editText,
                onChange: (e) => setEditText(e.target.value),
                className: "flex-1 border border-gray-200 rounded px-2 py-1 text-xs",
                autoFocus: true
              }
            ),
            /* @__PURE__ */ jsx(
              "button",
              {
                onClick: (e) => {
                  e.stopPropagation();
                  handleEditComment(comment.id);
                },
                className: "text-xs text-[#A52A2A] hover:underline",
                children: "Save"
              }
            ),
            /* @__PURE__ */ jsx(
              "button",
              {
                onClick: (e) => {
                  e.stopPropagation();
                  setEditingId(null);
                },
                className: "text-xs text-gray-400 hover:underline",
                children: "Cancel"
              }
            )
          ] }) : /* @__PURE__ */ jsx("p", { className: "text-xs text-gray-700 mb-1.5", children: comment.text }),
          /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 mb-1", onClick: (e) => e.stopPropagation(), children: [
            /* @__PURE__ */ jsx(
              "button",
              {
                onClick: () => {
                  setReplyingTo(replyingTo === comment.id ? null : comment.id);
                  setReplyText("");
                },
                className: "text-[10px] text-gray-500 hover:text-[#A52A2A]",
                children: "Reply"
              }
            ),
            /* @__PURE__ */ jsx(
              "button",
              {
                onClick: () => handleResolve(comment.id, !comment.resolved),
                className: "text-[10px] text-gray-500 hover:text-green-600",
                children: comment.resolved ? "Reopen" : "Resolve"
              }
            ),
            (comment.authorEmail === currentUserEmail || userRole === "admin") && /* @__PURE__ */ jsxs(Fragment, { children: [
              /* @__PURE__ */ jsx(
                "button",
                {
                  onClick: () => {
                    setEditingId(comment.id);
                    setEditText(comment.text);
                  },
                  className: "text-[10px] text-gray-500 hover:text-blue-600",
                  children: "Edit"
                }
              ),
              /* @__PURE__ */ jsx(
                "button",
                {
                  onClick: () => handleDeleteComment(comment.id),
                  className: "text-[10px] text-gray-500 hover:text-red-600",
                  children: "Delete"
                }
              )
            ] })
          ] }),
          comment.replies.length > 0 && /* @__PURE__ */ jsx("div", { className: "ml-3 border-l-2 border-gray-100 pl-2 space-y-2 mt-2", children: comment.replies.map((reply) => /* @__PURE__ */ jsxs("div", { className: "text-xs", onClick: (e) => e.stopPropagation(), children: [
            /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-1 mb-0.5", children: [
              /* @__PURE__ */ jsx("span", { className: "font-medium text-gray-700", children: reply.authorName }),
              /* @__PURE__ */ jsx("span", { className: `text-[9px] px-1 py-0 rounded ${ROLE_COLORS[reply.role] || "bg-gray-100 text-gray-600"}`, children: reply.role }),
              /* @__PURE__ */ jsx("span", { className: "text-[10px] text-gray-400 ml-auto", children: timeAgo$1(reply.timestamp) })
            ] }),
            editingId === reply.id ? /* @__PURE__ */ jsxs("div", { className: "flex gap-1", children: [
              /* @__PURE__ */ jsx(
                "input",
                {
                  value: editText,
                  onChange: (e) => setEditText(e.target.value),
                  className: "flex-1 border border-gray-200 rounded px-1.5 py-0.5 text-[11px]",
                  autoFocus: true
                }
              ),
              /* @__PURE__ */ jsx(
                "button",
                {
                  onClick: () => handleEditComment(comment.id, reply.id),
                  className: "text-[10px] text-[#A52A2A]",
                  children: "Save"
                }
              ),
              /* @__PURE__ */ jsx(
                "button",
                {
                  onClick: () => setEditingId(null),
                  className: "text-[10px] text-gray-400",
                  children: "Cancel"
                }
              )
            ] }) : /* @__PURE__ */ jsx("p", { className: "text-gray-600", children: reply.text }),
            (reply.authorEmail === currentUserEmail || userRole === "admin") && editingId !== reply.id && /* @__PURE__ */ jsxs("div", { className: "flex gap-2 mt-0.5", children: [
              /* @__PURE__ */ jsx(
                "button",
                {
                  onClick: () => {
                    setEditingId(reply.id);
                    setEditText(reply.text);
                  },
                  className: "text-[10px] text-gray-400 hover:text-blue-600",
                  children: "Edit"
                }
              ),
              /* @__PURE__ */ jsx(
                "button",
                {
                  onClick: () => handleDeleteReply(comment.id, reply.id),
                  className: "text-[10px] text-gray-400 hover:text-red-600",
                  children: "Delete"
                }
              )
            ] })
          ] }, reply.id)) }),
          replyingTo === comment.id && /* @__PURE__ */ jsxs("div", { className: "mt-2 flex gap-1", onClick: (e) => e.stopPropagation(), children: [
            /* @__PURE__ */ jsx(
              "input",
              {
                value: replyText,
                onChange: (e) => setReplyText(e.target.value),
                placeholder: "Write a reply...",
                className: "flex-1 border border-gray-200 rounded px-2 py-1 text-xs",
                autoFocus: true,
                onKeyDown: (e) => {
                  if (e.key === "Enter") handleReply(comment.id);
                }
              }
            ),
            /* @__PURE__ */ jsx(
              "button",
              {
                onClick: () => handleReply(comment.id),
                className: "text-xs bg-[#A52A2A] text-white px-2 py-1 rounded hover:bg-[#8B1A1A]",
                children: "Send"
              }
            )
          ] })
        ]
      },
      comment.id
    )) }) })
  ] });
}
const STATUS_STYLES = {
  pending: "bg-yellow-100 text-yellow-700",
  accepted: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700"
};
function timeAgo(ts) {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 6e4);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}
function SuggestionPanel({
  docId,
  userEmail,
  userRole,
  editor,
  onClose,
  onSave
}) {
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("pending");
  const fetchSuggestions = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/suggestions?email=${encodeURIComponent(userEmail)}&docId=${docId}`);
      const data = await res.json();
      setSuggestions(data.suggestions || []);
    } catch {
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  }, [userEmail, docId]);
  useEffect(() => {
    fetchSuggestions();
  }, [fetchSuggestions]);
  useEffect(() => {
    const interval = setInterval(fetchSuggestions, 3e3);
    return () => clearInterval(interval);
  }, [fetchSuggestions]);
  async function handleAccept(suggestion) {
    try {
      const { state } = editor;
      const { tr } = state;
      let modified = false;
      state.doc.descendants((node, pos) => {
        node.marks.forEach((mark) => {
          if (mark.type.name === "suggestion" && mark.attrs.suggestionId === suggestion.id) {
            if (mark.attrs.type === "delete") {
              tr.delete(pos, pos + node.nodeSize);
              modified = true;
            } else if (mark.attrs.type === "insert") {
              tr.removeMark(pos, pos + node.nodeSize, mark.type);
              modified = true;
            }
          }
        });
      });
      if (modified) {
        editor.view.dispatch(tr);
        onSave();
      }
    } catch {
    }
    await apiFetch("/api/suggestions", {
      method: "PUT",
      body: JSON.stringify({ email: userEmail, docId, suggestionId: suggestion.id, status: "accepted" })
    });
    fetchSuggestions();
  }
  async function handleReject(suggestion) {
    try {
      const { state } = editor;
      const { tr } = state;
      let modified = false;
      state.doc.descendants((node, pos) => {
        node.marks.forEach((mark) => {
          if (mark.type.name === "suggestion" && mark.attrs.suggestionId === suggestion.id) {
            if (mark.attrs.type === "insert") {
              tr.delete(pos, pos + node.nodeSize);
              modified = true;
            } else if (mark.attrs.type === "delete") {
              tr.removeMark(pos, pos + node.nodeSize, mark.type);
              modified = true;
            }
          }
        });
      });
      if (modified) {
        editor.view.dispatch(tr);
        onSave();
      }
    } catch {
    }
    await apiFetch("/api/suggestions", {
      method: "PUT",
      body: JSON.stringify({ email: userEmail, docId, suggestionId: suggestion.id, status: "rejected" })
    });
    fetchSuggestions();
  }
  const canAcceptReject = userRole === "admin" || userRole === "student";
  const filtered = filter === "pending" ? suggestions.filter((s) => s.status === "pending") : suggestions;
  return /* @__PURE__ */ jsxs("div", { className: "w-80 shrink-0 border-l border-gray-200 bg-white overflow-y-auto flex flex-col", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50", children: [
      /* @__PURE__ */ jsx("h3", { className: "text-sm font-semibold text-gray-700", children: "Suggestions" }),
      /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsxs(
          "select",
          {
            value: filter,
            onChange: (e) => setFilter(e.target.value),
            className: "text-[10px] border border-gray-200 rounded px-1 py-0.5",
            children: [
              /* @__PURE__ */ jsx("option", { value: "pending", children: "Pending" }),
              /* @__PURE__ */ jsx("option", { value: "all", children: "All" })
            ]
          }
        ),
        /* @__PURE__ */ jsx("button", { onClick: onClose, className: "text-gray-400 hover:text-gray-600 text-sm", children: "x" })
      ] })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "flex-1 overflow-y-auto", children: loading ? /* @__PURE__ */ jsx("p", { className: "text-xs text-gray-400 p-4", children: "Loading suggestions..." }) : filtered.length === 0 ? /* @__PURE__ */ jsx("p", { className: "text-xs text-gray-400 p-4", children: filter === "pending" ? "No pending suggestions." : "No suggestions yet." }) : /* @__PURE__ */ jsx("div", { className: "divide-y divide-gray-100", children: filtered.map((suggestion) => /* @__PURE__ */ jsxs("div", { className: "p-3 hover:bg-gray-50", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 mb-1.5", children: [
        /* @__PURE__ */ jsx("span", { className: "text-xs font-medium text-gray-800", children: suggestion.authorName }),
        /* @__PURE__ */ jsx("span", { className: `text-[10px] px-1.5 py-0.5 rounded ${STATUS_STYLES[suggestion.status]}`, children: suggestion.status }),
        /* @__PURE__ */ jsx("span", { className: "text-[10px] text-gray-400 ml-auto", children: timeAgo(suggestion.timestamp) })
      ] }),
      suggestion.originalText && /* @__PURE__ */ jsxs("div", { className: "mb-1.5", children: [
        /* @__PURE__ */ jsx("span", { className: "text-[10px] text-gray-500 uppercase font-medium", children: "Remove:" }),
        /* @__PURE__ */ jsx("div", { className: "text-xs bg-red-50 border-l-2 border-red-300 px-2 py-1 text-red-700 line-through mt-0.5", children: suggestion.originalText })
      ] }),
      suggestion.suggestedText && /* @__PURE__ */ jsxs("div", { className: "mb-1.5", children: [
        /* @__PURE__ */ jsx("span", { className: "text-[10px] text-gray-500 uppercase font-medium", children: "Add:" }),
        /* @__PURE__ */ jsx("div", { className: "text-xs bg-green-50 border-l-2 border-green-300 px-2 py-1 text-green-700 mt-0.5", children: suggestion.suggestedText })
      ] }),
      suggestion.status === "pending" && canAcceptReject && /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 mt-2", children: [
        /* @__PURE__ */ jsx(
          "button",
          {
            onClick: () => handleAccept(suggestion),
            className: "text-[10px] bg-green-600 text-white px-2.5 py-1 rounded hover:bg-green-700 font-medium",
            children: "Accept"
          }
        ),
        /* @__PURE__ */ jsx(
          "button",
          {
            onClick: () => handleReject(suggestion),
            className: "text-[10px] bg-red-500 text-white px-2.5 py-1 rounded hover:bg-red-600 font-medium",
            children: "Reject"
          }
        )
      ] }),
      suggestion.status === "pending" && !canAcceptReject && /* @__PURE__ */ jsx("p", { className: "text-[10px] text-gray-400 mt-1 italic", children: "Only the document owner or admin can accept/reject" })
    ] }, suggestion.id)) }) })
  ] });
}
const FontSize$1 = Extension.create({
  name: "fontSize",
  addGlobalAttributes() {
    return [{
      types: ["textStyle"],
      attributes: {
        fontSize: {
          default: null,
          parseHTML: (el) => el.style.fontSize || null,
          renderHTML: (attrs) => attrs.fontSize ? { style: `font-size: ${attrs.fontSize}` } : {}
        }
      }
    }];
  },
  addCommands() {
    return {
      setFontSize: (size) => ({ chain }) => chain().setMark("textStyle", { fontSize: size }).run(),
      unsetFontSize: () => ({ chain }) => chain().setMark("textStyle", { fontSize: null }).removeEmptyTextStyle().run()
    };
  }
});
const LineHeight = Extension.create({
  name: "lineHeight",
  addGlobalAttributes() {
    return [{
      types: ["paragraph", "heading"],
      attributes: {
        lineHeight: {
          default: null,
          parseHTML: (el) => el.style.lineHeight || null,
          renderHTML: (attrs) => attrs.lineHeight ? { style: `line-height: ${attrs.lineHeight}` } : {}
        }
      }
    }];
  },
  addCommands() {
    return {
      setLineHeight: (height) => ({ commands }) => commands.updateAttributes("paragraph", { lineHeight: height }) && commands.updateAttributes("heading", { lineHeight: height })
    };
  }
});
const CommentMark$1 = Mark.create({
  name: "comment",
  addAttributes() {
    return {
      commentId: { default: null }
    };
  },
  parseHTML() {
    return [{ tag: "span[data-comment-id]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["span", {
      "data-comment-id": HTMLAttributes.commentId,
      class: "comment-highlight",
      style: "background-color: #fff3cd; border-bottom: 2px solid #ffc107; cursor: pointer;"
    }, 0];
  }
});
const SuggestionMark$1 = Mark.create({
  name: "suggestion",
  addAttributes() {
    return {
      suggestionId: { default: null },
      type: { default: "insert" }
    };
  },
  parseHTML() {
    return [{ tag: "span[data-suggestion-id]" }];
  },
  renderHTML({ HTMLAttributes }) {
    const isInsert = HTMLAttributes.type === "insert";
    return ["span", {
      "data-suggestion-id": HTMLAttributes.suggestionId,
      "data-suggestion-type": HTMLAttributes.type,
      class: `suggestion-mark suggestion-${HTMLAttributes.type}`,
      style: isInsert ? "background-color: #d4edda; text-decoration: none; border-bottom: 2px solid #28a745;" : "background-color: #f8d7da; text-decoration: line-through; border-bottom: 2px solid #dc3545;"
    }, 0];
  }
});
const FONT_FAMILIES$1 = [
  { label: "Default", value: "" },
  { label: "Playfair Display", value: '"Playfair Display", serif' },
  { label: "Georgia", value: "Georgia, serif" },
  { label: "Arial", value: "Arial, sans-serif" },
  { label: "Courier New", value: '"Courier New", monospace' },
  { label: "Times New Roman", value: '"Times New Roman", serif' },
  { label: "Verdana", value: "Verdana, sans-serif" },
  { label: "Trebuchet MS", value: '"Trebuchet MS", sans-serif' }
];
const FONT_SIZES$1 = ["8px", "9px", "10px", "11px", "12px", "14px", "16px", "18px", "20px", "24px", "28px", "32px", "36px", "48px", "64px", "72px"];
const HEADING_OPTIONS = [
  { label: "Normal", value: "paragraph" },
  { label: "Heading 1", value: "h1" },
  { label: "Heading 2", value: "h2" },
  { label: "Heading 3", value: "h3" },
  { label: "Heading 4", value: "h4" },
  { label: "Heading 5", value: "h5" },
  { label: "Heading 6", value: "h6" },
  { label: "Quote", value: "blockquote" }
];
const LINE_SPACING_OPTIONS = [
  { label: "1.0", value: "1" },
  { label: "1.15", value: "1.15" },
  { label: "1.5", value: "1.5" },
  { label: "2.0", value: "2" }
];
const PAGE_SIZES = {
  A4: { width: "210mm", height: "297mm" },
  Letter: { width: "8.5in", height: "11in" }
};
const TEXT_COLORS$1 = [
  "#000000",
  "#434343",
  "#666666",
  "#999999",
  "#cccccc",
  "#A52A2A",
  "#e74c3c",
  "#e67e22",
  "#f1c40f",
  "#2ecc71",
  "#1abc9c",
  "#3498db",
  "#2980b9",
  "#9b59b6",
  "#8e44ad"
];
const HIGHLIGHT_COLORS$1 = [
  "transparent",
  "#fff3cd",
  "#d4edda",
  "#d1ecf1",
  "#f8d7da",
  "#fce4ec",
  "#e8eaf6",
  "#e0f2f1",
  "#fff9c4",
  "#f3e5f5"
];
const SPECIAL_CHARACTERS = [
  "&",
  "@",
  "#",
  "$",
  "%",
  "^",
  "*",
  "+",
  "=",
  "~",
  "©",
  "®",
  "™",
  "°",
  "±",
  "×",
  "÷",
  "–",
  "—",
  "‘",
  "’",
  "“",
  "”",
  "…",
  "•",
  "§",
  "¶",
  "«",
  "»",
  "√",
  "∞",
  "≈",
  "≠",
  "≤",
  "≥",
  "α",
  "β",
  "γ",
  "δ",
  "π",
  "Σ",
  "€",
  "£",
  "¥",
  "¢",
  "₹"
];
function ToolbarBtn$1({ active, onClick, children, title, disabled }) {
  return /* @__PURE__ */ jsx(
    "button",
    {
      type: "button",
      title,
      onClick,
      disabled,
      className: `px-2 py-1 text-xs rounded transition-colors border ${disabled ? "opacity-40 cursor-not-allowed bg-gray-50 border-gray-100 text-gray-400" : active ? "bg-[#A52A2A] text-white border-[#A52A2A]" : "bg-white border-gray-200 text-gray-700 hover:bg-gray-100"}`,
      children
    }
  );
}
function ToolbarSelect({ value, onChange, options, title, className }) {
  return /* @__PURE__ */ jsx(
    "select",
    {
      title,
      value,
      onChange: (e) => onChange(e.target.value),
      className: `text-xs border border-gray-200 rounded px-1.5 py-1 bg-white text-gray-700 ${className || ""}`,
      children: options.map((o) => /* @__PURE__ */ jsx("option", { value: o.value, children: o.label }, o.value))
    }
  );
}
function ToolbarDivider$1() {
  return /* @__PURE__ */ jsx("div", { className: "w-px h-6 bg-gray-300 mx-0.5" });
}
function Editor({
  docId,
  userEmail,
  initialTitle,
  initialContent,
  readonly = false,
  userRole,
  currentUserEmail,
  currentUserName,
  onTitleChange,
  tabs,
  activeTabId,
  onTabsUpdate,
  apiPath,
  disableExport = false,
  disableComments = false,
  disableSuggestions = false,
  enableCopyProtection = false,
  activityLogPath
}) {
  const [title, setTitle] = useState(initialTitle);
  const [saveStatus, setSaveStatus] = useState("saved");
  const titleRef = useRef(initialTitle);
  const saveTimer = useRef(null);
  const pendingContentRef = useRef(null);
  const tabsRef = useRef(tabs || null);
  const activeTabIdRef = useRef(activeTabId || null);
  const prevTabsSignatureRef = useRef(null);
  const prevActiveTabIdRef = useRef(null);
  useEffect(() => {
    tabsRef.current = tabs || null;
  }, [tabs]);
  useEffect(() => {
    activeTabIdRef.current = activeTabId || null;
  }, [activeTabId]);
  const [showComments, setShowComments] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showOutline, setShowOutline] = useState(false);
  const [showInsertMenu, setShowInsertMenu] = useState(false);
  const [showSymbols, setShowSymbols] = useState(false);
  const [showPageSettings, setShowPageSettings] = useState(false);
  const [suggestionMode, setSuggestionMode] = useState(false);
  const [focusedSection, setFocusedSection] = useState(null);
  const [syncVersion, setSyncVersion] = useState(0);
  const [lastRemoteEdit, setLastRemoteEdit] = useState("");
  const isSyncing = useRef(false);
  const localEditPending = useRef(false);
  const [pageSize, setPageSize] = useState("A4");
  const [pageOrientation, setPageOrientation] = useState("portrait");
  const [margins, setMargins] = useState({ top: 25, bottom: 25, left: 25, right: 25 });
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef(null);
  const containerRef = useRef(null);
  const [securityWarning, setSecurityWarning] = useState("");
  const copyProtected = enableCopyProtection && userRole !== "admin";
  useEffect(() => {
    if (userRole === "mentor") setSuggestionMode(true);
  }, [userRole]);
  const doSave = useCallback(async (content) => {
    setSaveStatus("saving");
    try {
      const currentTabs = tabsRef.current;
      const currentActiveTabId = activeTabIdRef.current;
      const path = apiPath || "/api/doc-sync";
      const isLitwits = path.includes("litwits-doc-sync");
      const isMentorDocs = path.includes("mentor-documents");
      const body = isLitwits ? { docId, title: titleRef.current, content } : { email: userEmail, docId, title: titleRef.current, content };
      if (currentTabs && currentActiveTabId) {
        const updatedTabs = currentTabs.map(
          (t) => t.id === currentActiveTabId ? { ...t, content } : t
        );
        body.tabs = updatedTabs;
        body.activeTabId = currentActiveTabId;
        if (onTabsUpdate) onTabsUpdate(updatedTabs, currentActiveTabId);
      }
      console.log("Saving:", {
        docId,
        activeTabId: body.activeTabId ?? null,
        tabs: body.tabs ?? null,
        contentLength: typeof content === "string" ? content.length : 0
      });
      const method = isMentorDocs ? "PUT" : "POST";
      const res = await apiFetch(path, {
        method,
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (data.version) {
        setSyncVersion(data.version);
      }
      setSaveStatus("saved");
    } catch {
      setSaveStatus("unsaved");
    }
  }, [userEmail, docId, apiPath, onTabsUpdate]);
  const scheduleSave = useCallback((content) => {
    setSaveStatus("unsaved");
    localEditPending.current = true;
    pendingContentRef.current = content;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      doSave(content);
      localEditPending.current = false;
      pendingContentRef.current = null;
    }, 700);
  }, [doSave]);
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4, 5, 6] }
      }),
      Underline,
      TextStyle,
      FontFamily,
      FontSize$1,
      LineHeight,
      Color,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
      Link.configure({ openOnClick: false }),
      ImageExt.configure({ inline: true, allowBase64: true }),
      HorizontalRule,
      Placeholder.configure({ placeholder: "Start writing..." }),
      CharacterCount,
      Subscript,
      Superscript,
      CommentMark$1,
      SuggestionMark$1
    ],
    content: initialContent,
    editable: !readonly,
    onUpdate: ({ editor: ed }) => {
      if (readonly) return;
      if (!isSyncing.current) {
        scheduleSave(ed.getHTML());
      }
    }
  });
  useEffect(() => {
    if (editor && initialContent !== editor.getHTML()) {
      isSyncing.current = true;
      editor.commands.setContent(initialContent || "<p></p>");
      isSyncing.current = false;
    }
    setTitle(initialTitle);
    titleRef.current = initialTitle;
    setSaveStatus("saved");
    setSyncVersion(0);
    setLastRemoteEdit("");
    setFocusedSection(null);
    prevTabsSignatureRef.current = tabs ? tabs.map((t) => `${t.id}:${t.title}`).join("|") : "";
    prevActiveTabIdRef.current = activeTabId ?? null;
  }, [docId, userEmail]);
  useEffect(() => {
    if (!editor) return;
    const tabsSig = tabs ? tabs.map((t) => `${t.id}:${t.title}`).join("|") : "";
    const activeId = activeTabId ?? null;
    if (prevTabsSignatureRef.current === null) {
      prevTabsSignatureRef.current = tabsSig;
      prevActiveTabIdRef.current = activeId;
      return;
    }
    const prevTabsSig = prevTabsSignatureRef.current;
    const prevActive = prevActiveTabIdRef.current;
    const tabsChanged = tabsSig !== prevTabsSig;
    const activeChanged = activeId !== prevActive;
    if (!tabsChanged && !activeChanged) return;
    if (activeChanged) {
      const currentHTML = editor.getHTML();
      if (!readonly && tabs) {
        if (prevActive) {
          const oldStillExists = tabs.some((t) => t.id === prevActive);
          if (oldStillExists) {
            const mergedTabs = tabs.map(
              (t) => t.id === prevActive ? { ...t, content: currentHTML } : t
            );
            tabsRef.current = mergedTabs;
            if (onTabsUpdate) onTabsUpdate(mergedTabs, activeId ?? "");
          }
        } else {
          const targetId = tabs.find((t) => t.id === "main" && t.id !== activeId)?.id ?? tabs.find((t) => t.id !== activeId)?.id;
          if (targetId) {
            const mergedTabs = tabs.map(
              (t) => t.id === targetId ? { ...t, content: currentHTML } : t
            );
            tabsRef.current = mergedTabs;
            if (onTabsUpdate) onTabsUpdate(mergedTabs, activeId ?? "");
          }
        }
      }
      const freshTabs = tabsRef.current ?? tabs;
      const newTab = activeId ? freshTabs?.find((t) => t.id === activeId) : null;
      if (newTab) {
        const newHTML = newTab.content || "<p></p>";
        if (editor.getHTML() !== newHTML) {
          isSyncing.current = true;
          editor.commands.setContent(newHTML);
          isSyncing.current = false;
        }
      }
    }
    prevTabsSignatureRef.current = tabsSig;
    prevActiveTabIdRef.current = activeId;
    if (readonly) return;
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    pendingContentRef.current = null;
    localEditPending.current = true;
    const html = editor.getHTML();
    doSave(html).finally(() => {
      setTimeout(() => {
        localEditPending.current = false;
      }, 300);
    });
  }, [tabs, activeTabId, editor, readonly, doSave, onTabsUpdate]);
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      const pending = pendingContentRef.current;
      if (pending !== null) {
        doSave(pending);
        pendingContentRef.current = null;
      }
    };
  }, [doSave]);
  useEffect(() => {
    if (!editor) return;
    const path = apiPath || "/api/doc-sync";
    const isLitwits = path.includes("litwits-doc-sync");
    const isStudentDocSync = !apiPath || apiPath === "/api/doc-sync" || apiPath.includes("doc-sync") && !isLitwits;
    if (!isLitwits && !isStudentDocSync) return;
    let cancelled = false;
    const pollSync = async () => {
      if (cancelled || isSyncing.current) return;
      try {
        const url = isLitwits ? `/api/litwits-doc-sync?docId=${encodeURIComponent(String(docId))}&since=${syncVersion}` : `/api/doc-sync?email=${encodeURIComponent(userEmail)}&docId=${docId}&since=${syncVersion}`;
        const res = await apiFetch(url);
        const data = await res.json();
        if (cancelled) return;
        if (data.changed && !localEditPending.current) {
          const remoteTabs = Array.isArray(data.tabs) ? data.tabs : null;
          let mergedActive = activeTabIdRef.current;
          if (remoteTabs) {
            const localActiveStillExists = mergedActive ? remoteTabs.some((t) => t.id === mergedActive) : false;
            if (!localActiveStillExists) {
              mergedActive = data.activeTabId && remoteTabs.some((t) => t.id === data.activeTabId) ? data.activeTabId : remoteTabs[0]?.id || null;
            }
          }
          let remoteHTMLForActive = remoteTabs ? null : data.content ?? null;
          if (remoteTabs && mergedActive) {
            const activeTab = remoteTabs.find((t) => t.id === mergedActive);
            remoteHTMLForActive = activeTab?.content ?? "";
          }
          if (remoteTabs) {
            prevTabsSignatureRef.current = remoteTabs.map((t) => `${t.id}:${t.title}`).join("|");
            prevActiveTabIdRef.current = mergedActive ?? null;
            if (onTabsUpdate) onTabsUpdate(remoteTabs, mergedActive ?? "");
          }
          if (remoteHTMLForActive != null && remoteHTMLForActive !== editor.getHTML()) {
            isSyncing.current = true;
            const { from, to } = editor.state.selection;
            editor.commands.setContent(remoteHTMLForActive);
            const maxPos = editor.state.doc.content.size;
            const safeFrom = Math.min(from, maxPos);
            const safeTo = Math.min(to, maxPos);
            try {
              editor.commands.setTextSelection({ from: safeFrom, to: safeTo });
            } catch {
            }
            isSyncing.current = false;
            setLastRemoteEdit(data.editedBy || "");
          }
          if (data.title && data.title !== titleRef.current) {
            setTitle(data.title);
            titleRef.current = data.title;
          }
          setSyncVersion(data.version);
        } else if (data.version) {
          setSyncVersion(data.version);
        }
      } catch {
      }
    };
    const interval = setInterval(pollSync, 1500);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [editor, userEmail, docId, syncVersion, apiPath, onTabsUpdate]);
  useEffect(() => {
    if (!copyProtected) return;
    function showWarning(msg) {
      setSecurityWarning(msg);
      setTimeout(() => setSecurityWarning(""), 3e3);
    }
    function preventCopy(e) {
      e.preventDefault();
      showWarning("Copying is not allowed for this document");
    }
    function preventCut(e) {
      e.preventDefault();
      showWarning("Cutting is not allowed for this document");
    }
    function preventKeyboard(e) {
      if (e.ctrlKey || e.metaKey) {
        const k = e.key.toLowerCase();
        if (k === "p") {
          e.preventDefault();
          showWarning("Printing is not allowed for this document");
          return;
        }
        if (k === "c" || k === "x") {
          e.preventDefault();
          showWarning("Copying is not allowed for this document");
          return;
        }
      }
      if (e.key === "PrintScreen") {
        e.preventDefault();
        showWarning("Screenshots are not allowed");
      }
    }
    function preventContextMenu(e) {
      e.preventDefault();
      showWarning("Right-click is disabled for this document");
    }
    function preventDragStart(e) {
      e.preventDefault();
    }
    function onBeforePrint() {
      showWarning("Printing is not allowed for this document");
    }
    const container = containerRef.current;
    if (container) {
      container.addEventListener("copy", preventCopy);
      container.addEventListener("cut", preventCut);
      container.addEventListener("contextmenu", preventContextMenu);
      container.addEventListener("dragstart", preventDragStart);
    }
    document.addEventListener("keydown", preventKeyboard);
    window.addEventListener("beforeprint", onBeforePrint);
    return () => {
      if (container) {
        container.removeEventListener("copy", preventCopy);
        container.removeEventListener("cut", preventCut);
        container.removeEventListener("contextmenu", preventContextMenu);
        container.removeEventListener("dragstart", preventDragStart);
      }
      document.removeEventListener("keydown", preventKeyboard);
      window.removeEventListener("beforeprint", onBeforePrint);
    };
  }, [copyProtected]);
  useEffect(() => {
    if (!copyProtected) return;
    function onVisibilityChange() {
      const container = containerRef.current;
      if (!container) return;
      if (document.hidden) {
        container.style.filter = "blur(15px)";
        container.style.transition = "filter 0.1s";
      } else {
        container.style.filter = "";
      }
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [copyProtected]);
  useEffect(() => {
    if (!activityLogPath) return;
    const startedAt = Date.now();
    apiFetch(activityLogPath, {
      method: "POST",
      body: JSON.stringify({ docId, action: "opened" })
    }).catch(() => {
    });
    return () => {
      const duration = Math.round((Date.now() - startedAt) / 1e3);
      apiFetch(activityLogPath, {
        method: "POST",
        body: JSON.stringify({ docId, action: "viewed", duration })
      }).catch(() => {
      });
    };
  }, [activityLogPath, docId]);
  const headings = useMemo(() => {
    if (!editor) return [];
    const items = [];
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === "heading") {
        items.push({ level: node.attrs.level, text: node.textContent, pos });
      }
    });
    return items;
  }, [editor, editor?.state.doc]);
  const text = editor?.getText() || "";
  const wordCount = (text || "").trim().replace(/\s+/g, " ").split(" ").filter(Boolean).length;
  const charCount = editor?.storage.characterCount?.characters() || 0;
  const readingTime = Math.max(1, Math.ceil(wordCount / 200));
  const [selectedWordCount, setSelectedWordCount] = useState(0);
  const [sectionWordCount, setSectionWordCount] = useState(0);
  const [currentSectionName, setCurrentSectionName] = useState("");
  const [activeHeadingIndex, setActiveHeadingIndex] = useState(-1);
  const [, setSelectionTick] = useState(0);
  useEffect(() => {
    if (!editor) return;
    const updateSelection = () => {
      const { from, to } = editor.state.selection;
      if (from !== to) {
        const selectedText = editor.state.doc.textBetween(from, to, " ");
        const words = selectedText.trim().split(/\s+/).filter(Boolean).length;
        setSelectedWordCount(words);
      } else {
        setSelectedWordCount(0);
      }
      const cursorPos = from;
      let sectionStart = 0;
      let sectionEnd = editor.state.doc.content.size;
      let sectionName = "";
      let activeIdx = -1;
      const sectionBounds = [];
      let headingIdx = 0;
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name === "heading") {
          sectionBounds.push({ start: pos, end: 0, text: node.textContent, idx: headingIdx });
          headingIdx++;
        }
      });
      for (let i = 0; i < sectionBounds.length; i++) {
        sectionBounds[i].end = i + 1 < sectionBounds.length ? sectionBounds[i + 1].start : editor.state.doc.content.size;
      }
      for (let i = sectionBounds.length - 1; i >= 0; i--) {
        if (cursorPos >= sectionBounds[i].start) {
          sectionStart = sectionBounds[i].start;
          sectionEnd = sectionBounds[i].end;
          sectionName = sectionBounds[i].text;
          activeIdx = sectionBounds[i].idx;
          break;
        }
      }
      setActiveHeadingIndex(activeIdx);
      setCurrentSectionName(sectionName);
      if (sectionName) {
        const sectionText = editor.state.doc.textBetween(sectionStart, sectionEnd, " ");
        const words = sectionText.trim().split(/\s+/).filter(Boolean).length;
        setSectionWordCount(words);
      } else {
        setSectionWordCount(0);
      }
      setSelectionTick((t) => (t + 1) % 1e6);
    };
    editor.on("selectionUpdate", updateSelection);
    editor.on("update", updateSelection);
    editor.on("transaction", updateSelection);
    return () => {
      editor.off("selectionUpdate", updateSelection);
      editor.off("update", updateSelection);
      editor.off("transaction", updateSelection);
    };
  }, [editor]);
  function toggleVoiceTyping() {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Speech recognition not supported in this browser");
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.onresult = (event) => {
      let transcript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          transcript += event.results[i][0].transcript;
        }
      }
      if (transcript && editor) {
        editor.chain().focus().insertContent(transcript).run();
      }
    };
    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);
    recognition.start();
    recognitionRef.current = recognition;
    setIsListening(true);
  }
  function handleAddComment() {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    if (from === to) {
      alert("Select some text to comment on");
      return;
    }
    const selectedText = editor.state.doc.textBetween(from, to, " ");
    const text2 = prompt("Enter your comment:");
    if (!text2) return;
    apiFetch("/api/comments", {
      method: "POST",
      body: JSON.stringify({
        email: userEmail,
        docId,
        selectedText,
        from,
        to,
        text: text2
      })
    }).then((res) => res.json()).then((data) => {
      if (data.comment) {
        editor.chain().focus().setMark("comment", { commentId: data.comment.id }).run();
        scheduleSave(editor.getHTML());
        setShowComments(true);
      }
    });
  }
  function handleSuggestionInsert() {
    if (!editor || !suggestionMode) return;
    const text2 = prompt("Enter suggested text to insert:");
    if (!text2) return;
    const { from, to } = editor.state.selection;
    const originalText = from !== to ? editor.state.doc.textBetween(from, to, " ") : "";
    apiFetch("/api/suggestions", {
      method: "POST",
      body: JSON.stringify({
        email: userEmail,
        docId,
        from,
        to,
        originalText,
        suggestedText: text2
      })
    }).then((res) => res.json()).then((data) => {
      if (data.suggestion) {
        if (from !== to) {
          editor.chain().focus().setMark("suggestion", { suggestionId: data.suggestion.id, type: "delete" }).run();
        }
        editor.chain().focus().insertContent(`<span data-suggestion-id="${data.suggestion.id}" data-suggestion-type="insert" class="suggestion-mark suggestion-insert" style="background-color: #d4edda; border-bottom: 2px solid #28a745;">${text2}</span>`).run();
        scheduleSave(editor.getHTML());
        setShowSuggestions(true);
      }
    });
  }
  function handleImageUpload() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file || !editor) return;
      const reader = new FileReader();
      reader.onload = () => {
        editor.chain().focus().setImage({ src: reader.result }).run();
        scheduleSave(editor.getHTML());
      };
      reader.readAsDataURL(file);
    };
    input.click();
  }
  function handleImageUrl() {
    const url = prompt("Enter image URL:");
    if (url && editor) {
      editor.chain().focus().setImage({ src: url }).run();
    }
  }
  function handleInsertLink() {
    if (!editor) return;
    const url = prompt("Enter URL:", "https://");
    if (url) {
      editor.chain().focus().setLink({ href: url }).run();
    }
  }
  function handleInsertTable() {
    if (!editor) return;
    const rows = parseInt(prompt("Number of rows:", "3") || "3");
    const cols = parseInt(prompt("Number of columns:", "3") || "3");
    editor.chain().focus().insertTable({ rows, cols, withHeaderRow: true }).run();
  }
  async function handleExportHTML() {
    if (!editor) return;
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title><style>body{font-family:Arial,sans-serif;max-width:800px;margin:40px auto;padding:20px;} table{border-collapse:collapse;width:100%;} td,th{border:1px solid #ddd;padding:8px;} img{max-width:100%;}</style></head><body><h1>${title}</h1>${editor.getHTML()}</body></html>`;
    const blob = new Blob([html], { type: "text/html" });
    downloadBlob(blob, `${title || "document"}.html`);
  }
  async function handleExportPDF() {
    if (!editor) return;
    try {
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF({ orientation: pageOrientation, unit: "mm", format: pageSize.toLowerCase() });
      const content = editor.getText();
      const lines = doc.splitTextToSize(content, doc.internal.pageSize.getWidth() - margins.left - margins.right);
      let y = margins.top + 10;
      doc.setFontSize(18);
      doc.text(title || "Document", margins.left, y);
      y += 12;
      doc.setFontSize(12);
      for (const line of lines) {
        if (y > doc.internal.pageSize.getHeight() - margins.bottom) {
          doc.addPage();
          y = margins.top;
        }
        doc.text(line, margins.left, y);
        y += 6;
      }
      doc.save(`${title || "document"}.pdf`);
    } catch {
      alert("PDF export failed");
    }
  }
  async function handleExportDOCX() {
    if (!editor) return;
    try {
      const htmlToDocx = (await import("html-to-docx")).default;
      const html = `<html><body><h1>${title}</h1>${editor.getHTML()}</body></html>`;
      const blob = await htmlToDocx(html, null, {
        table: { row: { cantSplit: true } },
        footer: true,
        pageNumber: true
      });
      downloadBlob(blob, `${title || "document"}.docx`);
    } catch {
      alert("DOCX export failed");
    }
  }
  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
  useEffect(() => {
    if (!editor) return;
    const editorElement = editor.view.dom;
    editorElement.querySelectorAll(".section-dimmed").forEach((el) => el.classList.remove("section-dimmed"));
    editorElement.querySelectorAll(".section-focused").forEach((el) => el.classList.remove("section-focused"));
    if (focusedSection === null || headings.length === 0) return;
    const headingEls = [];
    const headingTags = ["H1", "H2", "H3", "H4", "H5", "H6"];
    const walker = document.createTreeWalker(editorElement, NodeFilter.SHOW_ELEMENT, {
      acceptNode: (node2) => headingTags.includes(node2.tagName) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP
    });
    let idx = 0;
    let node;
    while (node = walker.nextNode()) {
      headingEls.push({ el: node, index: idx });
      idx++;
    }
    const children = Array.from(editorElement.children);
    children.forEach((child) => child.classList.add("section-dimmed"));
    const focusedHeadingEl = headingEls[focusedSection];
    if (focusedHeadingEl) {
      const nextHeadingEl = headingEls[focusedSection + 1];
      let inSection = false;
      for (const child of children) {
        if (child === focusedHeadingEl.el || child.contains(focusedHeadingEl.el)) {
          inSection = true;
        }
        if (nextHeadingEl && (child === nextHeadingEl.el || child.contains(nextHeadingEl.el))) {
          inSection = false;
        }
        if (inSection) {
          child.classList.remove("section-dimmed");
          child.classList.add("section-focused");
        }
      }
    }
  }, [editor, focusedSection, headings]);
  if (!editor) {
    return /* @__PURE__ */ jsx("div", { className: "p-8 text-gray-400 text-center", children: "Loading editor..." });
  }
  const currentHeading = (() => {
    for (let i = 1; i <= 6; i++) {
      if (editor.isActive("heading", { level: i })) return `h${i}`;
    }
    if (editor.isActive("blockquote")) return "blockquote";
    return "paragraph";
  })();
  const { currentFontFamily, currentFontSize, familyMixed, sizeMixed } = (() => {
    const { from, to, empty } = editor.state.selection;
    if (empty) {
      const attrs = editor.getAttributes("textStyle");
      return {
        currentFontFamily: attrs.fontFamily || "",
        currentFontSize: attrs.fontSize || "",
        familyMixed: false,
        sizeMixed: false
      };
    }
    let family;
    let size;
    let mixF = false;
    let mixS = false;
    let seenText = false;
    editor.state.doc.nodesBetween(from, to, (node) => {
      if (!node.isText) return;
      seenText = true;
      const textStyle = node.marks.find((m) => m.type.name === "textStyle");
      const f = textStyle?.attrs.fontFamily ?? null;
      const s = textStyle?.attrs.fontSize ?? null;
      if (family === void 0) family = f;
      else if (family !== f) mixF = true;
      if (size === void 0) size = s;
      else if (size !== s) mixS = true;
    });
    if (!seenText) {
      const attrs = editor.getAttributes("textStyle");
      return {
        currentFontFamily: attrs.fontFamily || "",
        currentFontSize: attrs.fontSize || "",
        familyMixed: false,
        sizeMixed: false
      };
    }
    return {
      currentFontFamily: family ?? "",
      currentFontSize: size ?? "",
      familyMixed: mixF,
      sizeMixed: mixS
    };
  })();
  const fontFamilyMatches = !familyMixed && FONT_FAMILIES$1.some((f) => f.value === currentFontFamily);
  const fontSizeMatches = !sizeMixed && currentFontSize !== "" && FONT_SIZES$1.includes(currentFontSize);
  const fontFamilySelectValue = familyMixed ? "__mixed__" : fontFamilyMatches ? currentFontFamily : "__unknown__";
  const fontSizeSelectValue = sizeMixed ? "__mixed__" : fontSizeMatches ? currentFontSize : "";
  return /* @__PURE__ */ jsxs(
    "div",
    {
      ref: containerRef,
      className: "flex h-full gap-0",
      style: copyProtected ? { userSelect: "none", WebkitUserSelect: "none" } : void 0,
      children: [
        securityWarning && /* @__PURE__ */ jsx("div", { className: "fixed top-4 right-4 z-[60] bg-red-600 text-white px-4 py-3 rounded-lg shadow-lg text-sm font-medium animate-pulse max-w-sm", children: securityWarning }),
        showOutline && /* @__PURE__ */ jsxs("div", { className: "w-56 shrink-0 border-r border-gray-200 bg-gray-50 overflow-y-auto p-3 sticky top-0 self-start max-h-screen", children: [
          /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between mb-3", children: [
            /* @__PURE__ */ jsx("h3", { className: "text-xs font-semibold text-gray-500 uppercase tracking-wide", children: "Outline" }),
            /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-1", children: [
              focusedSection !== null && /* @__PURE__ */ jsx(
                "button",
                {
                  onClick: () => setFocusedSection(null),
                  className: "text-[10px] text-[#A52A2A] hover:underline",
                  children: "Show All"
                }
              ),
              /* @__PURE__ */ jsx("button", { onClick: () => setShowOutline(false), className: "text-gray-400 hover:text-gray-600 text-xs", children: "x" })
            ] })
          ] }),
          headings.length === 0 ? /* @__PURE__ */ jsx("p", { className: "text-xs text-gray-400", children: "No headings found" }) : /* @__PURE__ */ jsx("div", { className: "space-y-0.5", children: headings.map((h, i) => /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-1", children: [
            /* @__PURE__ */ jsx(
              "button",
              {
                onClick: () => {
                  const pos = h.pos + 1;
                  editor.chain().focus().setTextSelection(pos).run();
                  try {
                    const coords = editor.view.coordsAtPos(h.pos);
                    const editorContainer = editor.view.dom.closest(".overflow-auto");
                    if (editorContainer && coords) {
                      const containerRect = editorContainer.getBoundingClientRect();
                      const scrollTop = editorContainer.scrollTop + (coords.top - containerRect.top) - 80;
                      editorContainer.scrollTo({ top: Math.max(0, scrollTop), behavior: "smooth" });
                    } else {
                      const domNode = editor.view.domAtPos(h.pos);
                      if (domNode?.node) {
                        const el = domNode.node instanceof HTMLElement ? domNode.node : domNode.node.parentElement;
                        el?.scrollIntoView({ behavior: "smooth", block: "center" });
                      }
                    }
                  } catch {
                    const domNode = editor.view.domAtPos(h.pos);
                    if (domNode?.node) {
                      const el = domNode.node instanceof HTMLElement ? domNode.node : domNode.node.parentElement;
                      el?.scrollIntoView({ behavior: "smooth", block: "center" });
                    }
                  }
                },
                className: `flex-1 text-left text-xs rounded px-2 py-1.5 truncate transition-colors ${activeHeadingIndex === i ? "bg-[#A52A2A] text-white font-medium" : focusedSection === i ? "bg-[#A52A2A]/10 text-[#A52A2A] font-medium" : "text-gray-600 hover:text-[#A52A2A] hover:bg-gray-100"}`,
                style: { paddingLeft: `${(h.level - 1) * 12 + 8}px` },
                children: h.text || `Heading ${h.level}`
              }
            ),
            /* @__PURE__ */ jsx(
              "button",
              {
                onClick: () => setFocusedSection(focusedSection === i ? null : i),
                title: focusedSection === i ? "Exit focus mode" : "Focus this section",
                className: `shrink-0 w-5 h-5 flex items-center justify-center rounded text-[10px] transition-colors ${focusedSection === i ? "bg-[#A52A2A] text-white" : "text-gray-400 hover:text-[#A52A2A] hover:bg-gray-100"}`,
                children: focusedSection === i ? "◉" : "◎"
              }
            )
          ] }, i)) })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "flex flex-col flex-1 min-w-0 min-h-0 overflow-auto", children: [
          /* @__PURE__ */ jsxs("div", { className: "sticky top-0 z-30 bg-white border-b border-gray-200 shadow-sm", children: [
            /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3 pb-3 px-4 pt-3", children: [
              /* @__PURE__ */ jsx(
                "input",
                {
                  className: "flex-1 text-2xl font-semibold outline-none bg-transparent placeholder-gray-300",
                  style: { fontFamily: '"Playfair Display", serif' },
                  value: title,
                  placeholder: "Document title",
                  readOnly: readonly,
                  onChange: (e) => {
                    setTitle(e.target.value);
                    titleRef.current = e.target.value;
                    onTitleChange?.(e.target.value);
                    if (editor) scheduleSave(editor.getHTML());
                  }
                }
              ),
              /* @__PURE__ */ jsx("span", { className: `text-xs whitespace-nowrap ${saveStatus === "saved" ? "text-green-600" : saveStatus === "saving" ? "text-yellow-600" : "text-gray-400"}`, children: saveStatus === "saved" ? "Saved" : saveStatus === "saving" ? "Saving..." : "Unsaved" })
            ] }),
            /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-1 px-3 py-1 bg-white border-b border-gray-100 text-xs text-gray-600 flex-wrap", children: [
              /* @__PURE__ */ jsx("button", { onClick: () => setShowOutline(!showOutline), className: "hover:text-[#A52A2A] px-2 py-0.5", children: "Outline" }),
              /* @__PURE__ */ jsx("span", { className: "text-gray-300", children: "|" }),
              /* @__PURE__ */ jsxs("div", { className: "relative", children: [
                /* @__PURE__ */ jsx("button", { onClick: () => setShowInsertMenu(!showInsertMenu), className: "hover:text-[#A52A2A] px-2 py-0.5", children: "Insert" }),
                showInsertMenu && /* @__PURE__ */ jsxs("div", { className: "absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 w-56 max-h-80 overflow-y-auto py-1", children: [
                  /* @__PURE__ */ jsx("div", { className: "px-3 py-1 text-[10px] font-semibold text-gray-400 uppercase", children: "Media" }),
                  /* @__PURE__ */ jsx("button", { onClick: () => {
                    handleImageUpload();
                    setShowInsertMenu(false);
                  }, className: "w-full text-left px-3 py-1.5 hover:bg-gray-50 text-xs", children: "Image Upload" }),
                  /* @__PURE__ */ jsx("button", { onClick: () => {
                    handleImageUrl();
                    setShowInsertMenu(false);
                  }, className: "w-full text-left px-3 py-1.5 hover:bg-gray-50 text-xs", children: "Image by URL" }),
                  /* @__PURE__ */ jsx("div", { className: "border-t border-gray-100 my-1" }),
                  /* @__PURE__ */ jsx("div", { className: "px-3 py-1 text-[10px] font-semibold text-gray-400 uppercase", children: "Tables" }),
                  /* @__PURE__ */ jsx("button", { onClick: () => {
                    handleInsertTable();
                    setShowInsertMenu(false);
                  }, className: "w-full text-left px-3 py-1.5 hover:bg-gray-50 text-xs", children: "Insert Table" }),
                  editor.isActive("table") && /* @__PURE__ */ jsxs(Fragment, { children: [
                    /* @__PURE__ */ jsx("button", { onClick: () => {
                      editor.chain().focus().addColumnAfter().run();
                      setShowInsertMenu(false);
                    }, className: "w-full text-left px-3 py-1.5 hover:bg-gray-50 text-xs pl-6", children: "Add Column" }),
                    /* @__PURE__ */ jsx("button", { onClick: () => {
                      editor.chain().focus().addRowAfter().run();
                      setShowInsertMenu(false);
                    }, className: "w-full text-left px-3 py-1.5 hover:bg-gray-50 text-xs pl-6", children: "Add Row" }),
                    /* @__PURE__ */ jsx("button", { onClick: () => {
                      editor.chain().focus().deleteColumn().run();
                      setShowInsertMenu(false);
                    }, className: "w-full text-left px-3 py-1.5 hover:bg-gray-50 text-xs pl-6", children: "Delete Column" }),
                    /* @__PURE__ */ jsx("button", { onClick: () => {
                      editor.chain().focus().deleteRow().run();
                      setShowInsertMenu(false);
                    }, className: "w-full text-left px-3 py-1.5 hover:bg-gray-50 text-xs pl-6", children: "Delete Row" }),
                    /* @__PURE__ */ jsx("button", { onClick: () => {
                      editor.chain().focus().mergeCells().run();
                      setShowInsertMenu(false);
                    }, className: "w-full text-left px-3 py-1.5 hover:bg-gray-50 text-xs pl-6", children: "Merge Cells" }),
                    /* @__PURE__ */ jsx("button", { onClick: () => {
                      editor.chain().focus().splitCell().run();
                      setShowInsertMenu(false);
                    }, className: "w-full text-left px-3 py-1.5 hover:bg-gray-50 text-xs pl-6", children: "Split Cell" }),
                    /* @__PURE__ */ jsx("button", { onClick: () => {
                      editor.chain().focus().deleteTable().run();
                      setShowInsertMenu(false);
                    }, className: "w-full text-left px-3 py-1.5 hover:bg-gray-50 text-xs pl-6 text-red-500", children: "Delete Table" })
                  ] }),
                  /* @__PURE__ */ jsx("div", { className: "border-t border-gray-100 my-1" }),
                  /* @__PURE__ */ jsx("div", { className: "px-3 py-1 text-[10px] font-semibold text-gray-400 uppercase", children: "Content" }),
                  /* @__PURE__ */ jsx("button", { onClick: () => {
                    handleInsertLink();
                    setShowInsertMenu(false);
                  }, className: "w-full text-left px-3 py-1.5 hover:bg-gray-50 text-xs", children: "Link" }),
                  /* @__PURE__ */ jsx("button", { onClick: () => {
                    editor.chain().focus().setHorizontalRule().run();
                    setShowInsertMenu(false);
                  }, className: "w-full text-left px-3 py-1.5 hover:bg-gray-50 text-xs", children: "Horizontal Line" }),
                  /* @__PURE__ */ jsx("button", { onClick: () => {
                    editor.chain().focus().insertContent('<p style="page-break-after: always;">&nbsp;</p>').run();
                    setShowInsertMenu(false);
                  }, className: "w-full text-left px-3 py-1.5 hover:bg-gray-50 text-xs", children: "Page Break" }),
                  /* @__PURE__ */ jsx("div", { className: "border-t border-gray-100 my-1" }),
                  /* @__PURE__ */ jsx("div", { className: "px-3 py-1 text-[10px] font-semibold text-gray-400 uppercase", children: "Symbols" }),
                  /* @__PURE__ */ jsx("button", { onClick: () => {
                    setShowSymbols(true);
                    setShowInsertMenu(false);
                  }, className: "w-full text-left px-3 py-1.5 hover:bg-gray-50 text-xs", children: "Special Characters" }),
                  /* @__PURE__ */ jsx("div", { className: "border-t border-gray-100 my-1" }),
                  /* @__PURE__ */ jsx("div", { className: "px-3 py-1 text-[10px] font-semibold text-gray-400 uppercase", children: "Structure" }),
                  /* @__PURE__ */ jsx("button", { onClick: () => {
                    const toc = headings.map((h) => `<p style="padding-left:${(h.level - 1) * 20}px"><a href="#">${h.text}</a></p>`).join("");
                    editor.chain().focus().insertContent(`<div class="toc"><h2>Table of Contents</h2>${toc || "<p>No headings found</p>"}</div>`).run();
                    setShowInsertMenu(false);
                  }, className: "w-full text-left px-3 py-1.5 hover:bg-gray-50 text-xs", children: "Table of Contents" }),
                  !disableComments && /* @__PURE__ */ jsx("button", { onClick: () => {
                    handleAddComment();
                    setShowInsertMenu(false);
                  }, className: "w-full text-left px-3 py-1.5 hover:bg-gray-50 text-xs", children: "Comment" })
                ] })
              ] }),
              /* @__PURE__ */ jsx("span", { className: "text-gray-300", children: "|" }),
              !disableExport && /* @__PURE__ */ jsxs(Fragment, { children: [
                /* @__PURE__ */ jsxs("div", { className: "relative group", children: [
                  /* @__PURE__ */ jsx("button", { className: "hover:text-[#A52A2A] px-2 py-0.5", children: "Export" }),
                  /* @__PURE__ */ jsxs("div", { className: "absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 w-40 py-1 hidden group-hover:block", children: [
                    /* @__PURE__ */ jsx("button", { onClick: handleExportPDF, className: "w-full text-left px-3 py-1.5 hover:bg-gray-50 text-xs", children: "PDF" }),
                    /* @__PURE__ */ jsx("button", { onClick: handleExportDOCX, className: "w-full text-left px-3 py-1.5 hover:bg-gray-50 text-xs", children: "DOCX" }),
                    /* @__PURE__ */ jsx("button", { onClick: handleExportHTML, className: "w-full text-left px-3 py-1.5 hover:bg-gray-50 text-xs", children: "HTML" })
                  ] })
                ] }),
                /* @__PURE__ */ jsx("span", { className: "text-gray-300", children: "|" })
              ] }),
              /* @__PURE__ */ jsx("button", { onClick: () => setShowPageSettings(!showPageSettings), className: "hover:text-[#A52A2A] px-2 py-0.5", children: "Page Setup" }),
              /* @__PURE__ */ jsx("span", { className: "text-gray-300", children: "|" }),
              /* @__PURE__ */ jsx("button", { onClick: toggleVoiceTyping, className: `px-2 py-0.5 ${isListening ? "text-red-500 font-semibold" : "hover:text-[#A52A2A]"}`, children: isListening ? "Stop Voice" : "Voice Type" }),
              !disableComments && /* @__PURE__ */ jsxs(Fragment, { children: [
                /* @__PURE__ */ jsx("span", { className: "text-gray-300", children: "|" }),
                /* @__PURE__ */ jsx("button", { onClick: () => setShowComments(!showComments), className: `px-2 py-0.5 ${showComments ? "text-[#A52A2A] font-semibold" : "hover:text-[#A52A2A]"}`, children: "Comments" })
              ] }),
              !disableSuggestions && /* @__PURE__ */ jsxs(Fragment, { children: [
                /* @__PURE__ */ jsx("span", { className: "text-gray-300", children: "|" }),
                /* @__PURE__ */ jsx("button", { onClick: () => setShowSuggestions(!showSuggestions), className: `px-2 py-0.5 ${showSuggestions ? "text-[#A52A2A] font-semibold" : "hover:text-[#A52A2A]"}`, children: "Suggestions" })
              ] }),
              !disableSuggestions && (userRole === "mentor" || userRole === "admin") && !readonly && /* @__PURE__ */ jsxs(Fragment, { children: [
                /* @__PURE__ */ jsx("span", { className: "text-gray-300", children: "|" }),
                /* @__PURE__ */ jsx(
                  "button",
                  {
                    onClick: () => setSuggestionMode(!suggestionMode),
                    className: `px-2 py-0.5 ${suggestionMode ? "text-orange-600 font-semibold" : "hover:text-[#A52A2A]"}`,
                    children: suggestionMode ? "Suggesting" : "Editing"
                  }
                )
              ] }),
              readonly && /* @__PURE__ */ jsxs(Fragment, { children: [
                /* @__PURE__ */ jsx("span", { className: "text-gray-300", children: "|" }),
                /* @__PURE__ */ jsx("span", { className: "px-2 py-0.5 text-[10px] uppercase tracking-wide bg-gray-100 text-gray-500 rounded", children: "View Only" })
              ] })
            ] }),
            showPageSettings && /* @__PURE__ */ jsxs("div", { className: "bg-yellow-50 border-b border-yellow-200 px-4 py-3 flex flex-wrap items-center gap-4 text-xs", children: [
              /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
                /* @__PURE__ */ jsx("span", { className: "font-medium text-gray-600", children: "Page:" }),
                /* @__PURE__ */ jsxs("select", { value: pageSize, onChange: (e) => setPageSize(e.target.value), className: "border border-gray-300 rounded px-2 py-1 text-xs", children: [
                  /* @__PURE__ */ jsx("option", { value: "A4", children: "A4" }),
                  /* @__PURE__ */ jsx("option", { value: "Letter", children: "Letter" })
                ] }),
                /* @__PURE__ */ jsxs("select", { value: pageOrientation, onChange: (e) => setPageOrientation(e.target.value), className: "border border-gray-300 rounded px-2 py-1 text-xs", children: [
                  /* @__PURE__ */ jsx("option", { value: "portrait", children: "Portrait" }),
                  /* @__PURE__ */ jsx("option", { value: "landscape", children: "Landscape" })
                ] })
              ] }),
              /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
                /* @__PURE__ */ jsx("span", { className: "font-medium text-gray-600", children: "Margins (mm):" }),
                ["top", "bottom", "left", "right"].map((side) => /* @__PURE__ */ jsxs("label", { className: "flex items-center gap-1", children: [
                  /* @__PURE__ */ jsx("span", { className: "text-gray-500 capitalize", children: side[0].toUpperCase() }),
                  /* @__PURE__ */ jsx(
                    "input",
                    {
                      type: "number",
                      value: margins[side],
                      onChange: (e) => setMargins({ ...margins, [side]: parseInt(e.target.value) || 0 }),
                      className: "w-10 border border-gray-300 rounded px-1 py-0.5 text-xs text-center"
                    }
                  )
                ] }, side))
              ] }),
              /* @__PURE__ */ jsx("button", { onClick: () => setShowPageSettings(false), className: "text-gray-400 hover:text-gray-600 ml-auto", children: "Close" })
            ] }),
            showSymbols && /* @__PURE__ */ jsxs("div", { className: "bg-white border-b border-gray-200 px-4 py-3", children: [
              /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between mb-2", children: [
                /* @__PURE__ */ jsx("h3", { className: "text-xs font-semibold text-gray-500 uppercase", children: "Special Characters" }),
                /* @__PURE__ */ jsx("button", { onClick: () => setShowSymbols(false), className: "text-gray-400 hover:text-gray-600 text-xs", children: "Close" })
              ] }),
              /* @__PURE__ */ jsx("div", { className: "flex flex-wrap gap-1", children: SPECIAL_CHARACTERS.map((ch, i) => /* @__PURE__ */ jsx(
                "button",
                {
                  onClick: () => {
                    editor.chain().focus().insertContent(ch).run();
                    setShowSymbols(false);
                  },
                  className: "w-8 h-8 flex items-center justify-center border border-gray-200 rounded hover:bg-gray-100 text-sm",
                  children: ch
                },
                i
              )) })
            ] }),
            /* @__PURE__ */ jsxs("div", { className: "flex flex-nowrap md:flex-wrap items-center gap-0.5 px-3 py-1.5 bg-gray-50 border-b border-gray-200 overflow-x-auto", children: [
              /* @__PURE__ */ jsx(ToolbarBtn$1, { onClick: () => editor.chain().focus().undo().run(), title: "Undo", disabled: !editor.can().undo(), children: "↩" }),
              /* @__PURE__ */ jsx(ToolbarBtn$1, { onClick: () => editor.chain().focus().redo().run(), title: "Redo", disabled: !editor.can().redo(), children: "↪" }),
              /* @__PURE__ */ jsx(ToolbarDivider$1, {}),
              /* @__PURE__ */ jsx(
                ToolbarSelect,
                {
                  value: currentHeading,
                  onChange: (v) => {
                    if (v === "paragraph") editor.chain().focus().setParagraph().run();
                    else if (v === "blockquote") editor.chain().focus().toggleBlockquote().run();
                    else {
                      const level = parseInt(v.replace("h", ""));
                      editor.chain().focus().toggleHeading({ level }).run();
                    }
                  },
                  options: HEADING_OPTIONS,
                  title: "Paragraph style",
                  className: "w-28"
                }
              ),
              /* @__PURE__ */ jsx(ToolbarDivider$1, {}),
              /* @__PURE__ */ jsxs("select", { title: "Font family", value: fontFamilySelectValue, onChange: (e) => {
                const v = e.target.value;
                if (v === "__mixed__" || v === "__unknown__") return;
                if (v) editor.chain().focus().setFontFamily(v).run();
                else editor.chain().focus().unsetFontFamily().run();
              }, className: "text-xs border border-gray-200 rounded px-1 py-1 bg-white text-gray-700 w-28", children: [
                familyMixed && /* @__PURE__ */ jsx("option", { value: "__mixed__", disabled: true, hidden: true }),
                !familyMixed && !fontFamilyMatches && /* @__PURE__ */ jsx("option", { value: "__unknown__", disabled: true, hidden: true }),
                FONT_FAMILIES$1.map((f) => /* @__PURE__ */ jsx("option", { value: f.value, children: f.label }, f.value))
              ] }),
              /* @__PURE__ */ jsxs("select", { title: "Font size", value: fontSizeSelectValue, onChange: (e) => {
                const v = e.target.value;
                if (v === "__mixed__") return;
                if (v) editor.chain().focus().setFontSize(v).run();
                else editor.chain().focus().unsetFontSize().run();
              }, className: "text-xs border border-gray-200 rounded px-1 py-1 bg-white text-gray-700 w-16", children: [
                sizeMixed && /* @__PURE__ */ jsx("option", { value: "__mixed__", disabled: true, hidden: true }),
                /* @__PURE__ */ jsx("option", { value: "", children: "Size" }),
                FONT_SIZES$1.map((s) => /* @__PURE__ */ jsx("option", { value: s, children: s }, s))
              ] }),
              /* @__PURE__ */ jsx(ToolbarBtn$1, { onClick: () => {
                const currentSize = editor.getAttributes("textStyle").fontSize;
                const idx = FONT_SIZES$1.indexOf(currentSize || "14px");
                if (idx < FONT_SIZES$1.length - 1) editor.chain().focus().setFontSize(FONT_SIZES$1[idx + 1]).run();
              }, title: "Increase font size", children: "A+" }),
              /* @__PURE__ */ jsx(ToolbarBtn$1, { onClick: () => {
                const currentSize = editor.getAttributes("textStyle").fontSize;
                const idx = FONT_SIZES$1.indexOf(currentSize || "14px");
                if (idx > 0) editor.chain().focus().setFontSize(FONT_SIZES$1[idx - 1]).run();
              }, title: "Decrease font size", children: "A-" }),
              /* @__PURE__ */ jsx(ToolbarDivider$1, {}),
              /* @__PURE__ */ jsx(ToolbarBtn$1, { active: editor.isActive("bold"), onClick: () => editor.chain().focus().toggleBold().run(), title: "Bold", children: /* @__PURE__ */ jsx("strong", { children: "B" }) }),
              /* @__PURE__ */ jsx(ToolbarBtn$1, { active: editor.isActive("italic"), onClick: () => editor.chain().focus().toggleItalic().run(), title: "Italic", children: /* @__PURE__ */ jsx("em", { children: "I" }) }),
              /* @__PURE__ */ jsx(ToolbarBtn$1, { active: editor.isActive("underline"), onClick: () => editor.chain().focus().toggleUnderline().run(), title: "Underline", children: /* @__PURE__ */ jsx("span", { className: "underline", children: "U" }) }),
              /* @__PURE__ */ jsx(ToolbarBtn$1, { active: editor.isActive("strike"), onClick: () => editor.chain().focus().toggleStrike().run(), title: "Strikethrough", children: /* @__PURE__ */ jsx("span", { className: "line-through", children: "S" }) }),
              /* @__PURE__ */ jsxs(ToolbarBtn$1, { active: editor.isActive("subscript"), onClick: () => editor.chain().focus().toggleSubscript().run(), title: "Subscript", children: [
                "X",
                /* @__PURE__ */ jsx("sub", { children: "2" })
              ] }),
              /* @__PURE__ */ jsxs(ToolbarBtn$1, { active: editor.isActive("superscript"), onClick: () => editor.chain().focus().toggleSuperscript().run(), title: "Superscript", children: [
                "X",
                /* @__PURE__ */ jsx("sup", { children: "2" })
              ] }),
              /* @__PURE__ */ jsx(ToolbarDivider$1, {}),
              /* @__PURE__ */ jsxs("div", { className: "relative group", children: [
                /* @__PURE__ */ jsx(ToolbarBtn$1, { onClick: () => {
                }, title: "Text Color", children: /* @__PURE__ */ jsx("span", { style: { color: editor.getAttributes("textStyle").color || "#000" }, children: "A" }) }),
                /* @__PURE__ */ jsxs("div", { className: "absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 p-2 hidden group-hover:grid grid-cols-5 gap-1", children: [
                  TEXT_COLORS$1.map((c) => /* @__PURE__ */ jsx(
                    "button",
                    {
                      onClick: () => editor.chain().focus().setColor(c).run(),
                      className: "w-6 h-6 rounded border border-gray-200",
                      style: { backgroundColor: c }
                    },
                    c
                  )),
                  /* @__PURE__ */ jsx(
                    "button",
                    {
                      onClick: () => editor.chain().focus().unsetColor().run(),
                      className: "col-span-5 text-[10px] text-gray-500 hover:text-gray-700 mt-1",
                      children: "Clear color"
                    }
                  )
                ] })
              ] }),
              /* @__PURE__ */ jsxs("div", { className: "relative group", children: [
                /* @__PURE__ */ jsx(ToolbarBtn$1, { active: editor.isActive("highlight"), onClick: () => {
                }, title: "Highlight", children: /* @__PURE__ */ jsx("span", { className: "bg-yellow-200 px-0.5", children: "H" }) }),
                /* @__PURE__ */ jsx("div", { className: "absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 p-2 hidden group-hover:grid grid-cols-5 gap-1", children: HIGHLIGHT_COLORS$1.map((c) => /* @__PURE__ */ jsx("button", { onClick: () => {
                  if (c === "transparent") editor.chain().focus().unsetHighlight().run();
                  else editor.chain().focus().toggleHighlight({ color: c }).run();
                }, className: "w-6 h-6 rounded border border-gray-200", style: { backgroundColor: c === "transparent" ? "#fff" : c } }, c)) })
              ] }),
              /* @__PURE__ */ jsx(ToolbarBtn$1, { onClick: () => editor.chain().focus().clearNodes().unsetAllMarks().run(), title: "Clear formatting", children: "Tx" }),
              /* @__PURE__ */ jsx(ToolbarDivider$1, {}),
              /* @__PURE__ */ jsx(ToolbarBtn$1, { active: editor.isActive({ textAlign: "left" }), onClick: () => editor.chain().focus().setTextAlign("left").run(), title: "Align Left", children: /* @__PURE__ */ jsx("span", { className: "text-[10px]", children: "☰" }) }),
              /* @__PURE__ */ jsx(ToolbarBtn$1, { active: editor.isActive({ textAlign: "center" }), onClick: () => editor.chain().focus().setTextAlign("center").run(), title: "Center", children: /* @__PURE__ */ jsx("span", { className: "text-[10px]", children: "☰" }) }),
              /* @__PURE__ */ jsx(ToolbarBtn$1, { active: editor.isActive({ textAlign: "right" }), onClick: () => editor.chain().focus().setTextAlign("right").run(), title: "Align Right", children: /* @__PURE__ */ jsx("span", { className: "text-[10px]", children: "☰" }) }),
              /* @__PURE__ */ jsx(ToolbarBtn$1, { active: editor.isActive({ textAlign: "justify" }), onClick: () => editor.chain().focus().setTextAlign("justify").run(), title: "Justify", children: /* @__PURE__ */ jsx("span", { className: "text-[10px]", children: "☰" }) }),
              /* @__PURE__ */ jsx(ToolbarDivider$1, {}),
              /* @__PURE__ */ jsxs("div", { className: "relative group", children: [
                /* @__PURE__ */ jsx(ToolbarBtn$1, { onClick: () => {
                }, title: "Line Spacing", children: /* @__PURE__ */ jsx("span", { className: "text-[10px]", children: "⇕" }) }),
                /* @__PURE__ */ jsxs("div", { className: "absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1 hidden group-hover:block w-32", children: [
                  /* @__PURE__ */ jsx("div", { className: "px-3 py-1 text-[10px] font-semibold text-gray-400 uppercase", children: "Line Spacing" }),
                  LINE_SPACING_OPTIONS.map((o) => /* @__PURE__ */ jsx(
                    "button",
                    {
                      onClick: () => editor.chain().focus().setLineHeight(o.value).run(),
                      className: "w-full text-left px-3 py-1 hover:bg-gray-50 text-xs",
                      children: o.label
                    },
                    o.value
                  )),
                  /* @__PURE__ */ jsx("div", { className: "border-t border-gray-100 my-1" }),
                  /* @__PURE__ */ jsx("div", { className: "px-3 py-1 text-[10px] font-semibold text-gray-400 uppercase", children: "Paragraph" }),
                  /* @__PURE__ */ jsx(
                    "button",
                    {
                      onClick: () => editor.chain().focus().updateAttributes("paragraph", { style: "margin-top: 1em" }).run(),
                      className: "w-full text-left px-3 py-1 hover:bg-gray-50 text-xs",
                      children: "Add space before"
                    }
                  ),
                  /* @__PURE__ */ jsx(
                    "button",
                    {
                      onClick: () => editor.chain().focus().updateAttributes("paragraph", { style: "margin-bottom: 1em" }).run(),
                      className: "w-full text-left px-3 py-1 hover:bg-gray-50 text-xs",
                      children: "Add space after"
                    }
                  )
                ] })
              ] }),
              /* @__PURE__ */ jsx(ToolbarDivider$1, {}),
              /* @__PURE__ */ jsx(ToolbarBtn$1, { active: editor.isActive("bulletList"), onClick: () => editor.chain().focus().toggleBulletList().run(), title: "Bullet List", children: "•" }),
              /* @__PURE__ */ jsx(ToolbarBtn$1, { active: editor.isActive("orderedList"), onClick: () => editor.chain().focus().toggleOrderedList().run(), title: "Numbered List", children: "1." }),
              /* @__PURE__ */ jsx(ToolbarBtn$1, { active: editor.isActive("taskList"), onClick: () => editor.chain().focus().toggleTaskList().run(), title: "Checklist", children: "☑" }),
              /* @__PURE__ */ jsx(ToolbarDivider$1, {}),
              /* @__PURE__ */ jsx(ToolbarBtn$1, { onClick: () => editor.chain().focus().sinkListItem("listItem").run(), title: "Increase Indent", disabled: !editor.can().sinkListItem("listItem"), children: "⇨" }),
              /* @__PURE__ */ jsx(ToolbarBtn$1, { onClick: () => editor.chain().focus().liftListItem("listItem").run(), title: "Decrease Indent", disabled: !editor.can().liftListItem("listItem"), children: "⇦" }),
              /* @__PURE__ */ jsx(ToolbarDivider$1, {}),
              !disableComments && /* @__PURE__ */ jsx(ToolbarBtn$1, { onClick: handleAddComment, title: "Add Comment", children: "💬" }),
              !disableSuggestions && suggestionMode && /* @__PURE__ */ jsx(ToolbarBtn$1, { onClick: handleSuggestionInsert, title: "Add Suggestion", children: "✏" })
            ] })
          ] }),
          /* @__PURE__ */ jsx("div", { className: "flex-1 bg-gray-100 p-4 pb-16", onClick: () => setShowInsertMenu(false), children: /* @__PURE__ */ jsx(
            "div",
            {
              className: "editor-page tiptap-content bg-white mx-auto shadow-sm border border-gray-200 rounded",
              style: {
                maxWidth: pageOrientation === "landscape" ? PAGE_SIZES[pageSize].height : PAGE_SIZES[pageSize].width,
                minHeight: "600px",
                padding: `${margins.top}mm ${margins.right}mm ${margins.bottom}mm ${margins.left}mm`
              },
              children: /* @__PURE__ */ jsx(EditorContent, { editor, className: "min-h-[500px]" })
            }
          ) }),
          /* @__PURE__ */ jsxs("div", { className: "fixed bottom-0 left-0 w-full z-50 flex items-center justify-between px-4 py-1.5 bg-gray-50 border-t border-gray-200 text-[11px] text-gray-500", children: [
            /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3", children: [
              /* @__PURE__ */ jsxs("span", { children: [
                "Words: ",
                wordCount
              ] }),
              selectedWordCount > 0 && /* @__PURE__ */ jsxs("span", { className: "text-[#A52A2A] font-medium", children: [
                "| Selected: ",
                selectedWordCount
              ] }),
              currentSectionName && selectedWordCount === 0 && /* @__PURE__ */ jsxs("span", { className: "text-blue-600", children: [
                "| Section (",
                currentSectionName,
                "): ",
                sectionWordCount
              ] }),
              /* @__PURE__ */ jsxs("span", { className: "text-gray-400", children: [
                "| ",
                charCount,
                " chars"
              ] }),
              /* @__PURE__ */ jsxs("span", { className: "text-gray-400", children: [
                "| ~",
                readingTime,
                " min read"
              ] })
            ] }),
            /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3", children: [
              lastRemoteEdit && /* @__PURE__ */ jsxs("span", { className: "text-green-600 font-medium sync-pulse", children: [
                "Live: ",
                lastRemoteEdit
              ] }),
              currentSectionName && /* @__PURE__ */ jsxs("span", { className: "text-gray-400 truncate max-w-32", title: currentSectionName, children: [
                "§",
                " ",
                currentSectionName
              ] }),
              /* @__PURE__ */ jsxs("span", { children: [
                pageSize,
                " ",
                pageOrientation
              ] }),
              suggestionMode && /* @__PURE__ */ jsx("span", { className: "text-orange-600 font-medium", children: "Suggestion Mode" })
            ] })
          ] })
        ] }),
        !disableComments && showComments && /* @__PURE__ */ jsx(
          CommentPanel,
          {
            docId,
            userEmail,
            currentUserEmail,
            currentUserName,
            userRole,
            editor,
            onClose: () => setShowComments(false),
            onSave: () => scheduleSave(editor.getHTML())
          }
        ),
        !disableSuggestions && showSuggestions && /* @__PURE__ */ jsx(
          SuggestionPanel,
          {
            docId,
            userEmail,
            currentUserEmail,
            userRole,
            editor,
            onClose: () => setShowSuggestions(false),
            onSave: () => scheduleSave(editor.getHTML())
          }
        )
      ]
    }
  );
}
function DocumentTabsBar({
  tabs,
  activeTabId,
  canEdit,
  onSwitch,
  onAdd,
  onRename,
  onDelete,
  onReorder
}) {
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const dragIndexRef = useRef(null);
  if (!tabs || tabs.length === 0) {
    if (!canEdit) return null;
    return /* @__PURE__ */ jsxs("div", { className: "bg-gray-50 border-b border-gray-200 px-4 py-1.5 flex items-center gap-2 flex-none z-10", children: [
      /* @__PURE__ */ jsx("span", { className: "text-[11px] text-gray-400 uppercase tracking-wide", children: "Tabs" }),
      /* @__PURE__ */ jsx(
        "button",
        {
          onClick: () => onAdd?.(),
          className: "text-xs px-2 py-1 rounded border border-dashed border-gray-300 text-gray-500 hover:border-[#A52A2A] hover:text-[#A52A2A] transition-colors",
          children: "+ Add Tab"
        }
      )
    ] });
  }
  const effectiveActiveId = activeTabId ?? tabs[0]?.id;
  function handleDragStart(index) {
    dragIndexRef.current = index;
  }
  function handleDragOver(e, index) {
    e.preventDefault();
    if (dragIndexRef.current === null || dragIndexRef.current === index) {
      setDragOverIndex(null);
      return;
    }
    setDragOverIndex(index);
  }
  function handleDrop(e, dropIndex) {
    e.preventDefault();
    const fromIndex = dragIndexRef.current;
    if (fromIndex === null || fromIndex === dropIndex || !tabs) return;
    const reordered = [...tabs];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(dropIndex, 0, moved);
    onReorder?.(reordered);
    dragIndexRef.current = null;
    setDragOverIndex(null);
  }
  function handleDragEnd() {
    dragIndexRef.current = null;
    setDragOverIndex(null);
  }
  return /* @__PURE__ */ jsxs("div", { className: "bg-gray-50 border-b border-gray-200 px-3 flex items-center gap-1 overflow-x-auto flex-none z-10", children: [
    tabs.map((t, index) => {
      const isActive = t.id === effectiveActiveId;
      const isDragOver = dragOverIndex === index;
      if (renamingId === t.id && canEdit) {
        return /* @__PURE__ */ jsx(
          "input",
          {
            autoFocus: true,
            value: renameValue,
            onChange: (e) => setRenameValue(e.target.value),
            onBlur: () => {
              if (renameValue.trim() && renameValue !== t.title) {
                onRename?.(t.id, renameValue.trim());
              }
              setRenamingId(null);
            },
            onKeyDown: (e) => {
              if (e.key === "Enter") {
                if (renameValue.trim() && renameValue !== t.title) {
                  onRename?.(t.id, renameValue.trim());
                }
                setRenamingId(null);
              } else if (e.key === "Escape") {
                setRenamingId(null);
              }
            },
            className: "px-3 py-1.5 text-xs border border-[#A52A2A] rounded-t bg-white outline-none w-32"
          },
          t.id
        );
      }
      return /* @__PURE__ */ jsxs(
        "button",
        {
          draggable: canEdit,
          onDragStart: () => handleDragStart(index),
          onDragOver: (e) => handleDragOver(e, index),
          onDrop: (e) => handleDrop(e, index),
          onDragEnd: handleDragEnd,
          onClick: () => onSwitch(t.id),
          onDoubleClick: () => {
            if (!canEdit) return;
            setRenamingId(t.id);
            setRenameValue(t.title);
          },
          className: `px-3 py-1.5 text-xs font-medium border-t-2 whitespace-nowrap flex items-center gap-1.5 transition-colors select-none ${isDragOver ? "border-[#A52A2A] bg-[#A52A2A]/10" : isActive ? "border-[#A52A2A] text-[#A52A2A] bg-white" : "border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-100"} ${canEdit ? "cursor-grab active:cursor-grabbing" : ""}`,
          title: canEdit ? "Drag to reorder · Double-click to rename" : void 0,
          children: [
            /* @__PURE__ */ jsx("span", { children: t.title }),
            canEdit && isActive && tabs.length > 1 && /* @__PURE__ */ jsx(
              "span",
              {
                role: "button",
                onClick: (e) => {
                  e.stopPropagation();
                  if (window.confirm(`Delete tab "${t.title}"?`)) onDelete?.(t.id);
                },
                className: "text-gray-400 hover:text-red-500 text-sm leading-none",
                children: "×"
              }
            )
          ]
        },
        t.id
      );
    }),
    canEdit && onAdd && /* @__PURE__ */ jsx(
      "button",
      {
        onClick: onAdd,
        className: "ml-1 px-2 py-1 text-xs rounded text-gray-400 hover:text-[#A52A2A] hover:bg-white transition-colors",
        title: "Add tab",
        children: "+ New Tab"
      }
    )
  ] });
}
const Route$r = createFileRoute("/student")({
  component: StudentDashboard
});
function Wordmark$2() {
  return /* @__PURE__ */ jsx(
    "span",
    {
      className: "text-2xl font-bold text-[#A52A2A] tracking-tight",
      style: { fontFamily: '"Playfair Display", serif' },
      children: "LITWITS"
    }
  );
}
function TabBtn$2({
  active,
  onClick,
  children
}) {
  return /* @__PURE__ */ jsx(
    "button",
    {
      onClick,
      className: `px-5 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${active ? "border-[#A52A2A] text-[#A52A2A]" : "border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300"}`,
      children
    }
  );
}
function DocCard$2({ title, onClick, icon }) {
  return /* @__PURE__ */ jsxs(
    "button",
    {
      onClick,
      className: "group bg-white rounded-lg border border-gray-200 hover:border-[#A52A2A] hover:shadow-md transition-all p-6 text-left flex flex-col gap-3 aspect-[4/3]",
      children: [
        /* @__PURE__ */ jsx("div", { className: "text-3xl text-gray-300 group-hover:text-[#A52A2A] transition-colors", children: icon ?? "📄" }),
        /* @__PURE__ */ jsx("div", { className: "flex-1 flex items-end", children: /* @__PURE__ */ jsx(
          "h3",
          {
            className: "text-base font-semibold text-gray-800 group-hover:text-[#A52A2A] transition-colors leading-tight",
            style: { fontFamily: '"Playfair Display", serif' },
            children: title
          }
        ) })
      ]
    }
  );
}
function StudentDashboard() {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState(null);
  const [tab, setTab] = useState("documents");
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("grid");
  const [selectedDocId, setSelectedDocId] = useState(null);
  const [litwitsDocs, setLitwitsDocs] = useState([]);
  const [litwitsLoading, setLitwitsLoading] = useState(false);
  const [litwitsView, setLitwitsView] = useState("grid");
  const [selectedLitwitsDocId, setSelectedLitwitsDocId] = useState(null);
  useEffect(() => {
    const u = getUser();
    if (!u || u.role !== "student") {
      navigate({ to: "/login" });
      return;
    }
    setCurrentUser(u);
    fetchDocs(u.email);
    fetchLitwitsDocs();
  }, []);
  useEffect(() => {
    if (tab !== "litwits-docs" || litwitsView !== "grid") return;
    const interval = setInterval(() => {
      fetchLitwitsDocs();
    }, 6e3);
    return () => clearInterval(interval);
  }, [tab, litwitsView]);
  async function fetchDocs(email) {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/documents?email=${encodeURIComponent(email)}`);
      const data = await res.json();
      setDocs(data.documents || []);
    } catch {
      setDocs([]);
    } finally {
      setLoading(false);
    }
  }
  async function fetchLitwitsDocs() {
    setLitwitsLoading(true);
    try {
      const res = await apiFetch("/api/litwits-docs");
      const data = await res.json();
      setLitwitsDocs(data.documents || []);
    } catch {
      setLitwitsDocs([]);
    } finally {
      setLitwitsLoading(false);
    }
  }
  async function handleLogout() {
    await apiFetch("/api/auth", { method: "DELETE" });
    clearAuth();
    navigate({ to: "/login" });
  }
  const selectedDoc = useMemo(
    () => docs.find((d) => d.id === selectedDocId) ?? null,
    [docs, selectedDocId]
  );
  const selectedLitwitsDoc = useMemo(
    () => litwitsDocs.find((d) => d.id === selectedLitwitsDocId) ?? null,
    [litwitsDocs, selectedLitwitsDocId]
  );
  function handleTitleChange(docId, newTitle) {
    setDocs((prev) => prev.map((d) => d.id === docId ? { ...d, title: newTitle } : d));
  }
  function updateDocTabs(docId, tabs, activeTabId) {
    setDocs((prev) => prev.map((d) => d.id === docId ? { ...d, tabs, activeTabId } : d));
  }
  function onDocTabAdd(docId) {
    setDocs(
      (prev) => prev.map((d) => {
        if (d.id !== docId) return d;
        const currentTabs = d.tabs && d.tabs.length > 0 ? d.tabs : [{ id: "main", title: "Main", content: d.content || "" }];
        const title = window.prompt("New tab name:", `Tab ${currentTabs.length + 1}`);
        if (!title) return d;
        const newTab = { id: `tab-${Date.now()}`, title, content: "" };
        return { ...d, tabs: [...currentTabs, newTab], activeTabId: newTab.id };
      })
    );
  }
  function onDocTabRename(docId, tabId, newTitle) {
    setDocs(
      (prev) => prev.map(
        (d) => d.id === docId && d.tabs ? { ...d, tabs: d.tabs.map((t) => t.id === tabId ? { ...t, title: newTitle } : t) } : d
      )
    );
  }
  function onDocTabDelete(docId, tabId) {
    setDocs(
      (prev) => prev.map((d) => {
        if (d.id !== docId || !d.tabs) return d;
        const remaining = d.tabs.filter((t) => t.id !== tabId);
        const newActive = d.activeTabId === tabId ? remaining[0]?.id ?? null : d.activeTabId;
        return { ...d, tabs: remaining, activeTabId: newActive };
      })
    );
  }
  function onLitwitsTabAdd(docId) {
    setLitwitsDocs(
      (prev) => prev.map((d) => {
        if (d.id !== docId) return d;
        const currentTabs = d.tabs && d.tabs.length > 0 ? d.tabs : [{ id: "main", title: "Main", content: d.content || "" }];
        const title = window.prompt("New tab name:", `Tab ${currentTabs.length + 1}`);
        if (!title) return d;
        const newTab = { id: `tab-${Date.now()}`, title, content: "" };
        return { ...d, tabs: [...currentTabs, newTab], activeTabId: newTab.id };
      })
    );
  }
  function onLitwitsTabRename(docId, tabId, newTitle) {
    setLitwitsDocs(
      (prev) => prev.map(
        (d) => d.id === docId && d.tabs ? { ...d, tabs: d.tabs.map((t) => t.id === tabId ? { ...t, title: newTitle } : t) } : d
      )
    );
  }
  function onLitwitsTabDelete(docId, tabId) {
    setLitwitsDocs(
      (prev) => prev.map((d) => {
        if (d.id !== docId || !d.tabs) return d;
        const remaining = d.tabs.filter((t) => t.id !== tabId);
        const newActive = d.activeTabId === tabId ? remaining[0]?.id ?? null : d.activeTabId;
        return { ...d, tabs: remaining, activeTabId: newActive };
      })
    );
  }
  function onDocTabReorder(docId, reorderedTabs) {
    setDocs((prev) => prev.map((d) => d.id === docId ? { ...d, tabs: reorderedTabs } : d));
    if (currentUser) {
      saveTabOrder(`doc:${currentUser.email}:${docId}`, reorderedTabs.map((t) => t.id));
    }
  }
  function onLitwitsTabReorder(docId, reorderedTabs) {
    setLitwitsDocs((prev) => prev.map((d) => d.id === docId ? { ...d, tabs: reorderedTabs } : d));
    saveTabOrder(`litwits:${docId}`, reorderedTabs.map((t) => t.id));
  }
  const LITWITS_CATEGORY_ORDER = ["Other Documents", "WSC Documents"];
  const groupedLitwitsDocs = (() => {
    const map = {};
    for (const doc of litwitsDocs) {
      const cat = doc.category || "Other Documents";
      if (!map[cat]) map[cat] = [];
      map[cat].push(doc);
    }
    const ordered = [];
    for (const cat of LITWITS_CATEGORY_ORDER) {
      if (map[cat]?.length) ordered.push([cat, map[cat]]);
    }
    for (const cat of Object.keys(map)) {
      if (!LITWITS_CATEGORY_ORDER.includes(cat)) ordered.push([cat, map[cat]]);
    }
    return ordered;
  })();
  const docIcons = {
    1: "🏆",
    2: "✍️",
    3: "🎤",
    4: "🌐",
    5: "📝"
  };
  const activeContent = selectedDoc ? selectedDoc.tabs && selectedDoc.activeTabId ? selectedDoc.tabs.find((t) => t.id === selectedDoc.activeTabId)?.content ?? selectedDoc.content : selectedDoc.content : "";
  const editorKey = selectedDoc ? `${currentUser?.email}-${selectedDoc.id}` : "none";
  const activeLitwitsContent = selectedLitwitsDoc ? selectedLitwitsDoc.tabs && selectedLitwitsDoc.activeTabId ? selectedLitwitsDoc.tabs.find((t) => t.id === selectedLitwitsDoc.activeTabId)?.content ?? selectedLitwitsDoc.content : selectedLitwitsDoc.content : "";
  const litwitsEditorKey = selectedLitwitsDoc ? `${selectedLitwitsDoc.id}` : "none";
  return /* @__PURE__ */ jsxs("div", { className: "h-screen bg-gray-50 flex flex-col overflow-hidden", children: [
    /* @__PURE__ */ jsxs("header", { className: "bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between flex-none z-20", children: [
      /* @__PURE__ */ jsx(Wordmark$2, {}),
      /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-4", children: [
        /* @__PURE__ */ jsx("span", { className: "text-sm text-gray-500 hidden sm:block", children: currentUser?.name }),
        /* @__PURE__ */ jsx(
          "button",
          {
            onClick: handleLogout,
            className: "text-xs text-gray-500 hover:text-[#A52A2A] transition-colors uppercase tracking-wide",
            children: "Logout"
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "bg-white border-b border-gray-200 px-6 flex gap-0 overflow-x-auto flex-none z-10", children: [
      /* @__PURE__ */ jsx(TabBtn$2, { active: tab === "documents", onClick: () => setTab("documents"), children: "My Documents" }),
      /* @__PURE__ */ jsx(TabBtn$2, { active: tab === "litwits-docs", onClick: () => setTab("litwits-docs"), children: "LITWITS Documents" })
    ] }),
    tab === "documents" && /* @__PURE__ */ jsxs("main", { className: "flex-1 min-h-0 flex flex-col", children: [
      view === "grid" && /* @__PURE__ */ jsx("div", { className: "flex-1 min-h-0 overflow-auto", children: /* @__PURE__ */ jsxs("div", { className: "p-6 max-w-6xl mx-auto w-full", children: [
        /* @__PURE__ */ jsx(
          "h1",
          {
            className: "text-2xl font-semibold text-gray-800 mb-6",
            style: { fontFamily: '"Playfair Display", serif' },
            children: "My Documents"
          }
        ),
        loading ? /* @__PURE__ */ jsx("p", { className: "text-sm text-gray-400", children: "Loading..." }) : /* @__PURE__ */ jsx("div", { className: "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4", children: docs.map((doc) => /* @__PURE__ */ jsx(
          DocCard$2,
          {
            title: doc.title,
            icon: docIcons[doc.id],
            onClick: () => {
              setSelectedDocId(doc.id);
              setView("editor");
            }
          },
          doc.id
        )) })
      ] }) }),
      view === "editor" && selectedDoc && currentUser && /* @__PURE__ */ jsxs("div", { className: "flex-1 min-h-0 flex flex-col", children: [
        /* @__PURE__ */ jsxs("div", { className: "bg-white border-b border-gray-200 px-6 py-2 flex items-center gap-3 flex-none z-10", children: [
          /* @__PURE__ */ jsxs(
            "button",
            {
              onClick: () => setView("grid"),
              className: "text-xs text-gray-500 hover:text-[#A52A2A] transition-colors uppercase tracking-wide flex items-center gap-1",
              children: [
                /* @__PURE__ */ jsx("span", { children: "←" }),
                " Back to Documents"
              ]
            }
          ),
          /* @__PURE__ */ jsx("span", { className: "text-xs text-gray-300", children: "|" }),
          /* @__PURE__ */ jsx("span", { className: "text-xs text-gray-500", children: selectedDoc.title })
        ] }),
        /* @__PURE__ */ jsx(
          DocumentTabsBar,
          {
            tabs: selectedDoc.tabs || null,
            activeTabId: selectedDoc.activeTabId || null,
            canEdit: true,
            onSwitch: (tabId) => {
              setDocs(
                (prev) => prev.map((d) => d.id === selectedDoc.id ? { ...d, activeTabId: tabId } : d)
              );
            },
            onAdd: () => onDocTabAdd(selectedDoc.id),
            onRename: (tabId, newTitle) => onDocTabRename(selectedDoc.id, tabId, newTitle),
            onDelete: (tabId) => onDocTabDelete(selectedDoc.id, tabId),
            onReorder: (reorderedTabs) => onDocTabReorder(selectedDoc.id, reorderedTabs)
          }
        ),
        /* @__PURE__ */ jsx("div", { className: "flex-1 min-h-0 bg-white", children: /* @__PURE__ */ jsx(
          Editor,
          {
            docId: selectedDoc.id,
            userEmail: currentUser.email,
            initialTitle: selectedDoc.title,
            initialContent: activeContent,
            userRole: "student",
            currentUserEmail: currentUser.email,
            currentUserName: currentUser.name,
            onTitleChange: (t) => handleTitleChange(selectedDoc.id, t),
            tabs: selectedDoc.tabs || null,
            activeTabId: selectedDoc.activeTabId || null,
            onTabsUpdate: (tabs, activeTabId) => updateDocTabs(selectedDoc.id, tabs, activeTabId)
          },
          editorKey
        ) })
      ] })
    ] }),
    tab === "litwits-docs" && /* @__PURE__ */ jsxs("main", { className: "flex-1 min-h-0 flex flex-col", children: [
      litwitsView === "grid" && /* @__PURE__ */ jsx("div", { className: "flex-1 min-h-0 overflow-auto", children: /* @__PURE__ */ jsxs("div", { className: "p-6 max-w-6xl mx-auto w-full", children: [
        /* @__PURE__ */ jsx(
          "h1",
          {
            className: "text-2xl font-semibold text-gray-800 mb-6",
            style: { fontFamily: '"Playfair Display", serif' },
            children: "LITWITS Documents"
          }
        ),
        litwitsLoading ? /* @__PURE__ */ jsx("p", { className: "text-sm text-gray-400", children: "Loading..." }) : litwitsDocs.length === 0 ? /* @__PURE__ */ jsx("p", { className: "text-sm text-gray-400", children: "No documents assigned yet." }) : /* @__PURE__ */ jsx("div", { className: "space-y-6", children: groupedLitwitsDocs.map(([category, catDocs]) => /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("h2", { className: "text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3", children: category }),
          /* @__PURE__ */ jsx("div", { className: "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4", children: catDocs.map((doc) => /* @__PURE__ */ jsx(
            DocCard$2,
            {
              title: doc.title,
              onClick: () => {
                setSelectedLitwitsDocId(doc.id);
                setLitwitsView("editor");
              }
            },
            doc.id
          )) })
        ] }, category)) })
      ] }) }),
      litwitsView === "editor" && selectedLitwitsDoc && currentUser && /* @__PURE__ */ jsxs("div", { className: "flex-1 min-h-0 flex flex-col", children: [
        /* @__PURE__ */ jsxs("div", { className: "bg-white border-b border-gray-200 px-6 py-2 flex items-center gap-3 flex-none z-10", children: [
          /* @__PURE__ */ jsxs(
            "button",
            {
              onClick: () => setLitwitsView("grid"),
              className: "text-xs text-gray-500 hover:text-[#A52A2A] transition-colors uppercase tracking-wide flex items-center gap-1",
              children: [
                /* @__PURE__ */ jsx("span", { children: "←" }),
                " Back to Documents"
              ]
            }
          ),
          /* @__PURE__ */ jsx("span", { className: "text-xs text-gray-300", children: "|" }),
          /* @__PURE__ */ jsx("span", { className: "text-xs text-gray-500", children: selectedLitwitsDoc.title })
        ] }),
        /* @__PURE__ */ jsx(
          DocumentTabsBar,
          {
            tabs: selectedLitwitsDoc.tabs || null,
            activeTabId: selectedLitwitsDoc.activeTabId || null,
            canEdit: true,
            onSwitch: (tabId) => {
              setLitwitsDocs(
                (prev) => prev.map(
                  (d) => d.id === selectedLitwitsDoc.id ? { ...d, activeTabId: tabId } : d
                )
              );
            },
            onAdd: () => onLitwitsTabAdd(selectedLitwitsDoc.id),
            onRename: (tabId, newTitle) => onLitwitsTabRename(selectedLitwitsDoc.id, tabId, newTitle),
            onDelete: (tabId) => onLitwitsTabDelete(selectedLitwitsDoc.id, tabId),
            onReorder: (reorderedTabs) => onLitwitsTabReorder(selectedLitwitsDoc.id, reorderedTabs)
          }
        ),
        /* @__PURE__ */ jsx("div", { className: "flex-1 min-h-0 bg-white", children: /* @__PURE__ */ jsx(
          Editor,
          {
            docId: selectedLitwitsDoc.id,
            userEmail: currentUser.email,
            initialTitle: selectedLitwitsDoc.title,
            initialContent: activeLitwitsContent,
            readonly: true,
            userRole: "student",
            currentUserEmail: currentUser.email,
            currentUserName: currentUser.name,
            apiPath: "/api/litwits-doc-sync",
            disableExport: true,
            disableComments: true,
            disableSuggestions: true,
            enableCopyProtection: true,
            activityLogPath: "/api/litwits-doc-activity",
            tabs: selectedLitwitsDoc.tabs || null,
            activeTabId: selectedLitwitsDoc.activeTabId || null,
            onTabsUpdate: (tabs, activeTabId) => {
              setLitwitsDocs(
                (prev) => prev.map(
                  (d) => d.id === selectedLitwitsDoc.id ? { ...d, tabs, activeTabId } : d
                )
              );
            }
          },
          litwitsEditorKey
        ) })
      ] })
    ] })
  ] });
}
const $$splitComponentImporter$6 = () => import("./sales-DgpJQJQt.js");
const Route$q = createFileRoute("/sales")({
  component: lazyRouteComponent($$splitComponentImporter$6, "component")
});
const $$splitComponentImporter$5 = () => import("./resume-ooP-YZ6B.js");
const Route$p = createFileRoute("/resume")({
  component: lazyRouteComponent($$splitComponentImporter$5, "component")
});
const $$splitComponentImporter$4 = () => import("./projects-CG19KGn3.js");
const Route$o = createFileRoute("/projects")({
  component: lazyRouteComponent($$splitComponentImporter$4, "component")
});
const Route$n = createFileRoute("/mentor")({
  component: MentorDashboard
});
function Wordmark$1() {
  return /* @__PURE__ */ jsx(
    "span",
    {
      className: "text-2xl font-bold text-[#A52A2A] tracking-tight",
      style: { fontFamily: '"Playfair Display", serif' },
      children: "LITWITS"
    }
  );
}
function TabBtn$1({
  active,
  onClick,
  children
}) {
  return /* @__PURE__ */ jsx(
    "button",
    {
      onClick,
      className: `px-5 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${active ? "border-[#A52A2A] text-[#A52A2A]" : "border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300"}`,
      children
    }
  );
}
function StudentCard({ name, role, onClick }) {
  const initials = name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
  return /* @__PURE__ */ jsxs(
    "button",
    {
      onClick,
      className: "group bg-white rounded-lg border border-gray-200 hover:border-[#A52A2A] hover:shadow-md transition-all p-5 text-left flex flex-col items-center gap-3",
      children: [
        /* @__PURE__ */ jsx("div", { className: "w-14 h-14 rounded-full bg-[#A52A2A]/10 text-[#A52A2A] flex items-center justify-center font-semibold text-lg group-hover:bg-[#A52A2A] group-hover:text-white transition-colors", children: initials || "?" }),
        /* @__PURE__ */ jsx("h3", { className: "text-sm font-semibold text-gray-800 text-center leading-tight", children: name }),
        role && /* @__PURE__ */ jsx("p", { className: "text-[10px] uppercase tracking-wide text-gray-400", children: role })
      ]
    }
  );
}
function DocCard$1({ title, onClick, icon }) {
  return /* @__PURE__ */ jsxs(
    "button",
    {
      onClick,
      className: "group bg-white rounded-lg border border-gray-200 hover:border-[#A52A2A] hover:shadow-md transition-all p-6 text-left flex flex-col gap-3 aspect-[4/3]",
      children: [
        /* @__PURE__ */ jsx("div", { className: "text-3xl text-gray-300 group-hover:text-[#A52A2A] transition-colors", children: icon ?? "📄" }),
        /* @__PURE__ */ jsx("div", { className: "flex-1 flex items-end", children: /* @__PURE__ */ jsx(
          "h3",
          {
            className: "text-base font-semibold text-gray-800 group-hover:text-[#A52A2A] transition-colors leading-tight",
            style: { fontFamily: '"Playfair Display", serif' },
            children: title
          }
        ) })
      ]
    }
  );
}
const DOC_ICONS$1 = {
  1: "🏆",
  2: "✍️",
  3: "🎤",
  4: "🌐",
  5: "📝"
};
function MentorDashboard() {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState(null);
  const [tab, setTab] = useState("students");
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [studentsView, setStudentsView] = useState("grid");
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [docs, setDocs] = useState([]);
  const [selectedDocId, setSelectedDocId] = useState(null);
  const [docsLoading, setDocsLoading] = useState(false);
  const [mentorDocs, setMentorDocs] = useState([]);
  const [mentorDocsLoading, setMentorDocsLoading] = useState(false);
  const [mentorDocView, setMentorDocView] = useState("grid");
  const [selectedMentorDocId, setSelectedMentorDocId] = useState(null);
  const [litwitsDocs, setLitwitsDocs] = useState([]);
  const [litwitsLoading, setLitwitsLoading] = useState(false);
  const [litwitsView, setLitwitsView] = useState("grid");
  const [selectedLitwitsDocId, setSelectedLitwitsDocId] = useState(null);
  useEffect(() => {
    const u = getUser();
    if (!u || u.role !== "mentor") {
      navigate({ to: "/login" });
      return;
    }
    setCurrentUser(u);
    fetchStudents();
    fetchLitwitsDocs();
    fetchMentorDocs(u.email);
  }, []);
  useEffect(() => {
    if (tab !== "litwits-docs" || litwitsView !== "grid") return;
    const interval = setInterval(() => {
      fetchLitwitsDocs();
    }, 6e3);
    return () => clearInterval(interval);
  }, [tab, litwitsView]);
  async function fetchStudents() {
    setLoading(true);
    try {
      const res = await apiFetch("/api/users");
      const data = await res.json();
      setStudents(data.users || []);
    } catch {
      setStudents([]);
    } finally {
      setLoading(false);
    }
  }
  async function fetchLitwitsDocs() {
    setLitwitsLoading(true);
    try {
      const res = await apiFetch("/api/litwits-docs");
      const data = await res.json();
      setLitwitsDocs(data.documents || []);
    } catch {
      setLitwitsDocs([]);
    } finally {
      setLitwitsLoading(false);
    }
  }
  async function fetchMentorDocs(email) {
    setMentorDocsLoading(true);
    try {
      const res = await apiFetch(`/api/mentor-documents?email=${encodeURIComponent(email)}`);
      const data = await res.json();
      setMentorDocs(data.documents || []);
    } catch {
      setMentorDocs([]);
    } finally {
      setMentorDocsLoading(false);
    }
  }
  async function loadStudentDocs(student) {
    setSelectedStudent(student);
    setSelectedDocId(null);
    setStudentsView("studentDocs");
    setDocsLoading(true);
    try {
      const res = await apiFetch(`/api/documents?email=${encodeURIComponent(student.email)}`);
      const data = await res.json();
      setDocs(data.documents || []);
    } catch {
      setDocs([]);
    } finally {
      setDocsLoading(false);
    }
  }
  async function handleLogout() {
    await apiFetch("/api/auth", { method: "DELETE" });
    clearAuth();
    navigate({ to: "/login" });
  }
  const selectedStudentDoc = useMemo(
    () => docs.find((d) => d.id === selectedDocId) ?? null,
    [docs, selectedDocId]
  );
  const selectedMentorDoc = useMemo(
    () => mentorDocs.find((d) => d.id === selectedMentorDocId) ?? null,
    [mentorDocs, selectedMentorDocId]
  );
  const selectedLitwitsDoc = useMemo(
    () => litwitsDocs.find((d) => d.id === selectedLitwitsDocId) ?? null,
    [litwitsDocs, selectedLitwitsDocId]
  );
  function onStudentTabsUpdate(docId, tabs, activeTabId) {
    setDocs((prev) => prev.map((d) => d.id === docId ? { ...d, tabs, activeTabId } : d));
  }
  function onStudentTabAdd(docId) {
    setDocs(
      (prev) => prev.map((d) => {
        if (d.id !== docId) return d;
        const currentTabs = d.tabs && d.tabs.length > 0 ? d.tabs : [{ id: "main", title: "Main", content: d.content || "" }];
        const title = window.prompt("New tab name:", `Tab ${currentTabs.length + 1}`);
        if (!title) return d;
        const newTab = { id: `tab-${Date.now()}`, title, content: "" };
        return { ...d, tabs: [...currentTabs, newTab], activeTabId: newTab.id };
      })
    );
  }
  function onStudentTabRename(docId, tabId, newTitle) {
    setDocs(
      (prev) => prev.map(
        (d) => d.id === docId && d.tabs ? { ...d, tabs: d.tabs.map((t) => t.id === tabId ? { ...t, title: newTitle } : t) } : d
      )
    );
  }
  function onStudentTabDelete(docId, tabId) {
    setDocs(
      (prev) => prev.map((d) => {
        if (d.id !== docId || !d.tabs) return d;
        const remaining = d.tabs.filter((t) => t.id !== tabId);
        const newActive = d.activeTabId === tabId ? remaining[0]?.id ?? null : d.activeTabId;
        return { ...d, tabs: remaining, activeTabId: newActive };
      })
    );
  }
  function onMentorTabsUpdate(docId, tabs, activeTabId) {
    setMentorDocs((prev) => prev.map((d) => d.id === docId ? { ...d, tabs, activeTabId } : d));
  }
  function onMentorTabAdd(docId) {
    setMentorDocs(
      (prev) => prev.map((d) => {
        if (d.id !== docId) return d;
        const currentTabs = d.tabs && d.tabs.length > 0 ? d.tabs : [{ id: "main", title: "Main", content: d.content || "" }];
        const title = window.prompt("New tab name:", `Tab ${currentTabs.length + 1}`);
        if (!title) return d;
        const newTab = { id: `tab-${Date.now()}`, title, content: "" };
        return { ...d, tabs: [...currentTabs, newTab], activeTabId: newTab.id };
      })
    );
  }
  function onMentorTabRename(docId, tabId, newTitle) {
    setMentorDocs(
      (prev) => prev.map(
        (d) => d.id === docId && d.tabs ? { ...d, tabs: d.tabs.map((t) => t.id === tabId ? { ...t, title: newTitle } : t) } : d
      )
    );
  }
  function onMentorTabDelete(docId, tabId) {
    setMentorDocs(
      (prev) => prev.map((d) => {
        if (d.id !== docId || !d.tabs) return d;
        const remaining = d.tabs.filter((t) => t.id !== tabId);
        const newActive = d.activeTabId === tabId ? remaining[0]?.id ?? null : d.activeTabId;
        return { ...d, tabs: remaining, activeTabId: newActive };
      })
    );
  }
  function onStudentTabReorder(docId, reorderedTabs) {
    setDocs((prev) => prev.map((d) => d.id === docId ? { ...d, tabs: reorderedTabs } : d));
    if (selectedStudent) {
      saveTabOrder(`doc:${selectedStudent.email}:${docId}`, reorderedTabs.map((t) => t.id));
    }
  }
  function onMentorTabReorder(docId, reorderedTabs) {
    setMentorDocs((prev) => prev.map((d) => d.id === docId ? { ...d, tabs: reorderedTabs } : d));
    if (currentUser) {
      saveTabOrder(`mentor:${currentUser.email}:${docId}`, reorderedTabs.map((t) => t.id));
    }
  }
  function onLitwitsTabReorder(docId, reorderedTabs) {
    setLitwitsDocs((prev) => prev.map((d) => d.id === docId ? { ...d, tabs: reorderedTabs } : d));
    saveTabOrder(`litwits:${docId}`, reorderedTabs.map((t) => t.id));
  }
  const studentDocActiveContent = selectedStudentDoc ? selectedStudentDoc.tabs && selectedStudentDoc.activeTabId ? selectedStudentDoc.tabs.find((t) => t.id === selectedStudentDoc.activeTabId)?.content ?? selectedStudentDoc.content : selectedStudentDoc.content : "";
  const studentDocEditorKey = selectedStudentDoc && selectedStudent ? `${selectedStudent.email}-${selectedStudentDoc.id}` : "none";
  const mentorDocActiveContent = selectedMentorDoc ? selectedMentorDoc.tabs && selectedMentorDoc.activeTabId ? selectedMentorDoc.tabs.find((t) => t.id === selectedMentorDoc.activeTabId)?.content ?? selectedMentorDoc.content : selectedMentorDoc.content : "";
  const mentorDocEditorKey = selectedMentorDoc && currentUser ? `${currentUser.email}-m-${selectedMentorDoc.id}` : "none";
  const activeLitwitsContent = selectedLitwitsDoc ? selectedLitwitsDoc.tabs && selectedLitwitsDoc.activeTabId ? selectedLitwitsDoc.tabs.find((t) => t.id === selectedLitwitsDoc.activeTabId)?.content ?? selectedLitwitsDoc.content : selectedLitwitsDoc.content : "";
  const litwitsEditorKey = selectedLitwitsDoc ? `${selectedLitwitsDoc.id}` : "none";
  const LITWITS_CATEGORY_ORDER = ["Other Documents", "WSC Documents"];
  const groupedLitwitsDocs = (() => {
    const map = {};
    for (const doc of litwitsDocs) {
      const cat = doc.category || "Other Documents";
      if (!map[cat]) map[cat] = [];
      map[cat].push(doc);
    }
    const ordered = [];
    for (const cat of LITWITS_CATEGORY_ORDER) {
      if (map[cat]?.length) ordered.push([cat, map[cat]]);
    }
    for (const cat of Object.keys(map)) {
      if (!LITWITS_CATEGORY_ORDER.includes(cat)) ordered.push([cat, map[cat]]);
    }
    return ordered;
  })();
  return /* @__PURE__ */ jsxs("div", { className: "h-screen bg-gray-50 flex flex-col overflow-hidden", children: [
    /* @__PURE__ */ jsxs("header", { className: "bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between flex-none z-20", children: [
      /* @__PURE__ */ jsx(Wordmark$1, {}),
      /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-4", children: [
        /* @__PURE__ */ jsx("span", { className: "text-sm text-gray-500 hidden sm:block", children: currentUser?.name }),
        /* @__PURE__ */ jsx(
          "button",
          {
            onClick: handleLogout,
            className: "text-xs text-gray-500 hover:text-[#A52A2A] transition-colors uppercase tracking-wide",
            children: "Logout"
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "bg-white border-b border-gray-200 px-6 flex gap-0 overflow-x-auto flex-none z-10", children: [
      /* @__PURE__ */ jsx(TabBtn$1, { active: tab === "students", onClick: () => setTab("students"), children: "My Students" }),
      /* @__PURE__ */ jsx(TabBtn$1, { active: tab === "my-docs", onClick: () => setTab("my-docs"), children: "Mentor Documents" }),
      /* @__PURE__ */ jsx(TabBtn$1, { active: tab === "litwits-docs", onClick: () => setTab("litwits-docs"), children: "LITWITS Documents" })
    ] }),
    tab === "students" && /* @__PURE__ */ jsxs("main", { className: "flex-1 min-h-0 flex flex-col", children: [
      studentsView === "grid" && /* @__PURE__ */ jsx("div", { className: "flex-1 min-h-0 overflow-auto p-6", children: /* @__PURE__ */ jsxs("div", { className: "max-w-7xl mx-auto w-full", children: [
        /* @__PURE__ */ jsx("h1", { className: "text-2xl font-semibold text-gray-800 mb-6", style: { fontFamily: '"Playfair Display", serif' }, children: "My Students" }),
        loading ? /* @__PURE__ */ jsx("p", { className: "text-sm text-gray-400", children: "Loading..." }) : students.length === 0 ? /* @__PURE__ */ jsx("p", { className: "text-sm text-gray-400", children: "No students assigned yet." }) : /* @__PURE__ */ jsx("div", { className: "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4", children: students.map((s) => /* @__PURE__ */ jsx(
          StudentCard,
          {
            name: s.name,
            role: s.role,
            onClick: () => loadStudentDocs(s)
          },
          s.email
        )) })
      ] }) }),
      studentsView === "studentDocs" && selectedStudent && /* @__PURE__ */ jsx("div", { className: "flex-1 min-h-0 overflow-auto p-6", children: /* @__PURE__ */ jsxs("div", { className: "max-w-6xl mx-auto w-full", children: [
        /* @__PURE__ */ jsx("div", { className: "flex items-center gap-3 mb-6", children: /* @__PURE__ */ jsx(
          "button",
          {
            onClick: () => {
              setStudentsView("grid");
              setSelectedStudent(null);
              setSelectedDocId(null);
            },
            className: "text-xs text-gray-500 hover:text-[#A52A2A] transition-colors uppercase tracking-wide",
            children: "← Back to Students"
          }
        ) }),
        /* @__PURE__ */ jsx("h1", { className: "text-2xl font-semibold text-gray-800 mb-2", style: { fontFamily: '"Playfair Display", serif' }, children: selectedStudent.name }),
        /* @__PURE__ */ jsx("p", { className: "text-sm text-gray-500 mb-6", children: "Documents" }),
        docsLoading ? /* @__PURE__ */ jsx("p", { className: "text-sm text-gray-400", children: "Loading..." }) : /* @__PURE__ */ jsx("div", { className: "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4", children: docs.map((doc) => /* @__PURE__ */ jsx(
          DocCard$1,
          {
            title: doc.title,
            icon: DOC_ICONS$1[doc.id],
            onClick: () => {
              setSelectedDocId(doc.id);
              setStudentsView("editor");
            }
          },
          doc.id
        )) })
      ] }) }),
      studentsView === "editor" && selectedStudent && selectedStudentDoc && currentUser && /* @__PURE__ */ jsxs("div", { className: "flex-1 min-h-0 flex flex-col", children: [
        /* @__PURE__ */ jsxs("div", { className: "bg-white border-b border-gray-200 px-6 py-2 flex items-center gap-3 flex-none z-10", children: [
          /* @__PURE__ */ jsxs(
            "button",
            {
              onClick: () => setStudentsView("studentDocs"),
              className: "text-xs text-gray-500 hover:text-[#A52A2A] uppercase tracking-wide",
              children: [
                "← Back to ",
                selectedStudent.name,
                "'s Documents"
              ]
            }
          ),
          /* @__PURE__ */ jsx("span", { className: "text-xs text-gray-300", children: "|" }),
          /* @__PURE__ */ jsxs("span", { className: "text-xs text-gray-500", children: [
            "Editing ",
            selectedStudent.name,
            " - ",
            selectedStudentDoc.title
          ] })
        ] }),
        /* @__PURE__ */ jsx(
          DocumentTabsBar,
          {
            tabs: selectedStudentDoc.tabs || null,
            activeTabId: selectedStudentDoc.activeTabId || null,
            canEdit: true,
            onSwitch: (tabId) => {
              setDocs(
                (prev) => prev.map(
                  (d) => d.id === selectedStudentDoc.id ? { ...d, activeTabId: tabId } : d
                )
              );
            },
            onAdd: () => onStudentTabAdd(selectedStudentDoc.id),
            onRename: (tabId, newTitle) => onStudentTabRename(selectedStudentDoc.id, tabId, newTitle),
            onDelete: (tabId) => onStudentTabDelete(selectedStudentDoc.id, tabId),
            onReorder: (reorderedTabs) => onStudentTabReorder(selectedStudentDoc.id, reorderedTabs)
          }
        ),
        /* @__PURE__ */ jsx("div", { className: "flex-1 min-h-0 bg-white", children: /* @__PURE__ */ jsx(
          Editor,
          {
            docId: selectedStudentDoc.id,
            userEmail: selectedStudent.email,
            initialTitle: selectedStudentDoc.title,
            initialContent: studentDocActiveContent,
            userRole: "mentor",
            currentUserEmail: currentUser.email,
            currentUserName: currentUser.name,
            tabs: selectedStudentDoc.tabs || null,
            activeTabId: selectedStudentDoc.activeTabId || null,
            onTabsUpdate: (tabs, activeTabId) => onStudentTabsUpdate(selectedStudentDoc.id, tabs, activeTabId)
          },
          studentDocEditorKey
        ) })
      ] })
    ] }),
    tab === "my-docs" && /* @__PURE__ */ jsxs("main", { className: "flex-1 min-h-0 flex flex-col", children: [
      mentorDocView === "grid" && /* @__PURE__ */ jsx("div", { className: "flex-1 min-h-0 overflow-auto p-6", children: /* @__PURE__ */ jsxs("div", { className: "max-w-6xl mx-auto w-full", children: [
        /* @__PURE__ */ jsx("h1", { className: "text-2xl font-semibold text-gray-800 mb-2", style: { fontFamily: '"Playfair Display", serif' }, children: "Mentor Documents" }),
        /* @__PURE__ */ jsx("p", { className: "text-sm text-gray-500 mb-6", children: "Your private workspace (not visible to students)" }),
        mentorDocsLoading ? /* @__PURE__ */ jsx("p", { className: "text-sm text-gray-400", children: "Loading..." }) : /* @__PURE__ */ jsx("div", { className: "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4", children: mentorDocs.map((doc) => /* @__PURE__ */ jsx(
          DocCard$1,
          {
            title: doc.title,
            onClick: () => {
              setSelectedMentorDocId(doc.id);
              setMentorDocView("editor");
            }
          },
          doc.id
        )) })
      ] }) }),
      mentorDocView === "editor" && selectedMentorDoc && currentUser && /* @__PURE__ */ jsxs("div", { className: "flex-1 min-h-0 flex flex-col", children: [
        /* @__PURE__ */ jsxs("div", { className: "bg-white border-b border-gray-200 px-6 py-2 flex items-center gap-3 flex-none z-10", children: [
          /* @__PURE__ */ jsx(
            "button",
            {
              onClick: () => setMentorDocView("grid"),
              className: "text-xs text-gray-500 hover:text-[#A52A2A] uppercase tracking-wide",
              children: "← Back to Mentor Documents"
            }
          ),
          /* @__PURE__ */ jsx("span", { className: "text-xs text-gray-300", children: "|" }),
          /* @__PURE__ */ jsx("span", { className: "text-xs text-gray-500", children: selectedMentorDoc.title })
        ] }),
        /* @__PURE__ */ jsx(
          DocumentTabsBar,
          {
            tabs: selectedMentorDoc.tabs || null,
            activeTabId: selectedMentorDoc.activeTabId || null,
            canEdit: true,
            onSwitch: (tabId) => {
              setMentorDocs(
                (prev) => prev.map(
                  (d) => d.id === selectedMentorDoc.id ? { ...d, activeTabId: tabId } : d
                )
              );
            },
            onAdd: () => onMentorTabAdd(selectedMentorDoc.id),
            onRename: (tabId, newTitle) => onMentorTabRename(selectedMentorDoc.id, tabId, newTitle),
            onDelete: (tabId) => onMentorTabDelete(selectedMentorDoc.id, tabId),
            onReorder: (reorderedTabs) => onMentorTabReorder(selectedMentorDoc.id, reorderedTabs)
          }
        ),
        /* @__PURE__ */ jsx("div", { className: "flex-1 min-h-0 bg-white", children: /* @__PURE__ */ jsx(
          Editor,
          {
            docId: selectedMentorDoc.id,
            userEmail: currentUser.email,
            initialTitle: selectedMentorDoc.title,
            initialContent: mentorDocActiveContent,
            userRole: "mentor",
            currentUserEmail: currentUser.email,
            currentUserName: currentUser.name,
            apiPath: "/api/mentor-documents",
            disableExport: true,
            tabs: selectedMentorDoc.tabs || null,
            activeTabId: selectedMentorDoc.activeTabId || null,
            onTabsUpdate: (tabs, activeTabId) => onMentorTabsUpdate(selectedMentorDoc.id, tabs, activeTabId)
          },
          mentorDocEditorKey
        ) })
      ] })
    ] }),
    tab === "litwits-docs" && /* @__PURE__ */ jsxs("main", { className: "flex-1 min-h-0 flex flex-col", children: [
      litwitsView === "grid" && /* @__PURE__ */ jsx("div", { className: "flex-1 min-h-0 overflow-auto p-6", children: /* @__PURE__ */ jsxs("div", { className: "max-w-6xl mx-auto w-full", children: [
        /* @__PURE__ */ jsx("h1", { className: "text-2xl font-semibold text-gray-800 mb-6", style: { fontFamily: '"Playfair Display", serif' }, children: "LITWITS Documents" }),
        litwitsLoading ? /* @__PURE__ */ jsx("p", { className: "text-sm text-gray-400", children: "Loading..." }) : litwitsDocs.length === 0 ? /* @__PURE__ */ jsx("p", { className: "text-sm text-gray-400", children: "No documents assigned yet." }) : /* @__PURE__ */ jsx("div", { className: "space-y-6", children: groupedLitwitsDocs.map(([category, catDocs]) => /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("h2", { className: "text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3", children: category }),
          /* @__PURE__ */ jsx("div", { className: "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4", children: catDocs.map((doc) => /* @__PURE__ */ jsx(
            DocCard$1,
            {
              title: doc.title,
              onClick: () => {
                setSelectedLitwitsDocId(doc.id);
                setLitwitsView("editor");
              }
            },
            doc.id
          )) })
        ] }, category)) })
      ] }) }),
      litwitsView === "editor" && selectedLitwitsDoc && currentUser && /* @__PURE__ */ jsxs("div", { className: "flex-1 min-h-0 flex flex-col", children: [
        /* @__PURE__ */ jsxs("div", { className: "bg-white border-b border-gray-200 px-6 py-2 flex items-center gap-3 flex-none z-10", children: [
          /* @__PURE__ */ jsx(
            "button",
            {
              onClick: () => setLitwitsView("grid"),
              className: "text-xs text-gray-500 hover:text-[#A52A2A] uppercase tracking-wide",
              children: "← Back to Documents"
            }
          ),
          /* @__PURE__ */ jsx("span", { className: "text-xs text-gray-300", children: "|" }),
          /* @__PURE__ */ jsx("span", { className: "text-xs text-gray-500", children: selectedLitwitsDoc.title })
        ] }),
        /* @__PURE__ */ jsx(
          DocumentTabsBar,
          {
            tabs: selectedLitwitsDoc.tabs || null,
            activeTabId: selectedLitwitsDoc.activeTabId || null,
            canEdit: true,
            onSwitch: (tabId) => {
              setLitwitsDocs(
                (prev) => prev.map(
                  (d) => d.id === selectedLitwitsDoc.id ? { ...d, activeTabId: tabId } : d
                )
              );
            },
            onAdd: () => {
              const title = window.prompt("New tab name:", "New Tab");
              if (!title) return;
              setLitwitsDocs(
                (prev) => prev.map((d) => {
                  if (d.id !== selectedLitwitsDoc.id) return d;
                  const currentTabs = d.tabs && d.tabs.length > 0 ? d.tabs : [{ id: "main", title: "Main", content: d.content || "" }];
                  const newTab = { id: `tab-${Date.now()}`, title, content: "" };
                  return { ...d, tabs: [...currentTabs, newTab], activeTabId: newTab.id };
                })
              );
            },
            onRename: (tabId, newTitle) => {
              setLitwitsDocs(
                (prev) => prev.map(
                  (d) => d.id === selectedLitwitsDoc.id && d.tabs ? { ...d, tabs: d.tabs.map((t) => t.id === tabId ? { ...t, title: newTitle } : t) } : d
                )
              );
            },
            onDelete: (tabId) => {
              setLitwitsDocs(
                (prev) => prev.map((d) => {
                  if (d.id !== selectedLitwitsDoc.id || !d.tabs) return d;
                  const remaining = d.tabs.filter((t) => t.id !== tabId);
                  const newActive = d.activeTabId === tabId ? remaining[0]?.id ?? null : d.activeTabId;
                  return { ...d, tabs: remaining, activeTabId: newActive };
                })
              );
            },
            onReorder: (reorderedTabs) => onLitwitsTabReorder(selectedLitwitsDoc.id, reorderedTabs)
          }
        ),
        /* @__PURE__ */ jsx("div", { className: "flex-1 min-h-0 bg-white", children: /* @__PURE__ */ jsx(
          Editor,
          {
            docId: selectedLitwitsDoc.id,
            userEmail: currentUser.email,
            initialTitle: selectedLitwitsDoc.title,
            initialContent: activeLitwitsContent,
            userRole: "mentor",
            currentUserEmail: currentUser.email,
            currentUserName: currentUser.name,
            apiPath: "/api/litwits-doc-sync",
            disableExport: true,
            disableComments: true,
            disableSuggestions: true,
            enableCopyProtection: true,
            activityLogPath: "/api/litwits-doc-activity",
            tabs: selectedLitwitsDoc.tabs || null,
            activeTabId: selectedLitwitsDoc.activeTabId || null,
            onTabsUpdate: (tabs, activeTabId) => {
              setLitwitsDocs(
                (prev) => prev.map(
                  (d) => d.id === selectedLitwitsDoc.id ? { ...d, tabs, activeTabId } : d
                )
              );
            }
          },
          litwitsEditorKey
        ) })
      ] })
    ] })
  ] });
}
const $$splitComponentImporter$3 = () => import("./login-DoK_xiBY.js");
const Route$m = createFileRoute("/login")({
  component: lazyRouteComponent($$splitComponentImporter$3, "component")
});
const $$splitComponentImporter$2 = () => import("./contact-WiKvVM2d.js");
const Route$l = createFileRoute("/contact")({
  component: lazyRouteComponent($$splitComponentImporter$2, "component")
});
const FONT_FAMILIES = [
  { label: "Default", value: "" },
  { label: "Playfair Display", value: '"Playfair Display", serif' },
  { label: "Georgia", value: "Georgia, serif" },
  { label: "Arial", value: "Arial, sans-serif" },
  { label: "Courier New", value: '"Courier New", monospace' },
  { label: "Times New Roman", value: '"Times New Roman", serif' },
  { label: "Verdana", value: "Verdana, sans-serif" },
  { label: "Trebuchet MS", value: '"Trebuchet MS", sans-serif' }
];
const FONT_SIZES = [
  "8px",
  "9px",
  "10px",
  "11px",
  "12px",
  "14px",
  "16px",
  "18px",
  "20px",
  "24px",
  "28px",
  "32px",
  "36px",
  "48px"
];
const TEXT_COLORS = [
  "#000000",
  "#434343",
  "#666666",
  "#999999",
  "#cccccc",
  "#A52A2A",
  "#e74c3c",
  "#e67e22",
  "#f1c40f",
  "#2ecc71",
  "#1abc9c",
  "#3498db",
  "#2980b9",
  "#9b59b6",
  "#8e44ad"
];
const HIGHLIGHT_COLORS = [
  "transparent",
  "#fff3cd",
  "#d4edda",
  "#d1ecf1",
  "#f8d7da",
  "#fce4ec",
  "#e8eaf6",
  "#e0f2f1",
  "#fff9c4",
  "#f3e5f5"
];
const FontSize = Extension.create({
  name: "fontSize",
  addGlobalAttributes() {
    return [
      {
        types: ["textStyle"],
        attributes: {
          fontSize: {
            default: null,
            parseHTML: (el) => el.style.fontSize || null,
            renderHTML: (attrs) => attrs.fontSize ? { style: `font-size: ${attrs.fontSize}` } : {}
          }
        }
      }
    ];
  },
  addCommands() {
    return {
      setFontSize: (size) => ({ chain }) => chain().setMark("textStyle", { fontSize: size }).run(),
      unsetFontSize: () => ({ chain }) => chain().setMark("textStyle", { fontSize: null }).removeEmptyTextStyle().run()
    };
  }
});
const CommentMark = Mark.create({
  name: "comment",
  addAttributes() {
    return { commentId: { default: null } };
  },
  parseHTML() {
    return [{ tag: "span[data-comment-id]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      {
        "data-comment-id": HTMLAttributes.commentId,
        class: "comment-highlight",
        style: "background-color: #fff3cd; border-bottom: 2px solid #ffc107;"
      },
      0
    ];
  }
});
const SuggestionMark = Mark.create({
  name: "suggestion",
  addAttributes() {
    return { suggestionId: { default: null } };
  },
  parseHTML() {
    return [{ tag: "span[data-suggestion-id]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      {
        "data-suggestion-id": HTMLAttributes.suggestionId,
        class: "suggestion-highlight",
        style: "background-color: #d4edda; border-bottom: 2px dashed #28a745;"
      },
      0
    ];
  }
});
function ToolbarBtn({
  active,
  onClick,
  children,
  title,
  disabled
}) {
  return /* @__PURE__ */ jsx(
    "button",
    {
      type: "button",
      title,
      onClick,
      disabled,
      className: `px-2 py-1 text-xs rounded transition-colors border ${disabled ? "opacity-40 cursor-not-allowed bg-gray-50 border-gray-100 text-gray-400" : active ? "bg-[#A52A2A] text-white border-[#A52A2A]" : "bg-white border-gray-200 text-gray-700 hover:bg-gray-100"}`,
      children
    }
  );
}
function ToolbarDivider() {
  return /* @__PURE__ */ jsx("div", { className: "w-px h-6 bg-gray-300 mx-0.5" });
}
function ActiveCellEditor({ value, onCommit, onFocus, onBlur }) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: false, codeBlock: false }),
      Underline,
      TextStyle,
      FontFamily,
      FontSize,
      Color,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ["paragraph"] }),
      CommentMark,
      SuggestionMark,
      Placeholder.configure({ placeholder: "" })
    ],
    content: value || "",
    autofocus: "end",
    editorProps: {
      attributes: {
        class: "arsr-cell-editor outline-none px-2 py-1 min-h-[28px] text-sm"
      }
    },
    onCreate: ({ editor: editor2 }) => onFocus(editor2),
    onFocus: ({ editor: editor2 }) => onFocus(editor2),
    onBlur: () => {
      onBlur();
      onCommit(editor?.getHTML() || "");
    }
  });
  if (!editor) {
    return /* @__PURE__ */ jsx(
      "div",
      {
        className: "px-2 py-1 min-h-[28px] text-sm",
        dangerouslySetInnerHTML: { __html: value || "<br/>" }
      }
    );
  }
  return /* @__PURE__ */ jsx(EditorContent, { editor });
}
function CellPreview({ value, onClick }) {
  return /* @__PURE__ */ jsx(
    "div",
    {
      className: "px-2 py-1 min-h-[28px] text-sm cursor-text arsr-cell-editor",
      onClick,
      dangerouslySetInnerHTML: { __html: value || "<br/>" }
    }
  );
}
function Spreadsheet({
  sheets,
  activeSheetId,
  onChange,
  onAddSheet,
  onRenameSheet,
  onDeleteSheet,
  onSwitchSheet,
  toolbarExtras,
  lockedColumns,
  readOnlyColumns
}) {
  const activeSheet = sheets.find((s) => s.id === activeSheetId) || sheets[0] || null;
  const [focusedEditor, setFocusedEditor] = useState(null);
  const [activeCell, setActiveCell] = useState(null);
  const [, setForceTick] = useState(0);
  const [renamingSheetId, setRenamingSheetId] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const isReadOnlyCol = (col) => Array.isArray(readOnlyColumns) && readOnlyColumns.includes(col);
  useEffect(() => {
    if (!focusedEditor) return;
    const handler = () => setForceTick((t) => t + 1);
    focusedEditor.on("selectionUpdate", handler);
    focusedEditor.on("transaction", handler);
    return () => {
      focusedEditor.off("selectionUpdate", handler);
      focusedEditor.off("transaction", handler);
    };
  }, [focusedEditor]);
  const updateCell = useCallback(
    (rowIdx, col, html) => {
      if (!activeSheet) return;
      const updated = sheets.map((s) => {
        if (s.id !== activeSheet.id) return s;
        const rows = s.rows.slice();
        while (rows.length <= rowIdx) rows.push({});
        const existing = rows[rowIdx] || {};
        if (existing[col] === html) return s;
        rows[rowIdx] = { ...existing, [col]: html };
        return { ...s, rows, updatedAt: Date.now() };
      });
      onChange(updated, activeSheet.id);
    },
    [activeSheet, sheets, onChange]
  );
  const addRow = () => {
    if (!activeSheet) return;
    const updated = sheets.map((s) => {
      if (s.id !== activeSheet.id) return s;
      return { ...s, rows: [...s.rows, {}], updatedAt: Date.now() };
    });
    onChange(updated, activeSheet.id);
  };
  const addColumn = () => {
    if (!activeSheet || lockedColumns) return;
    const name = prompt("Column name:");
    if (!name) return;
    const updated = sheets.map((s) => {
      if (s.id !== activeSheet.id) return s;
      return { ...s, columns: [...s.columns, name], updatedAt: Date.now() };
    });
    onChange(updated, activeSheet.id);
  };
  const renameColumn = (col) => {
    if (!activeSheet || lockedColumns) return;
    const newName = prompt("Rename column:", col);
    if (!newName || newName === col) return;
    const updated = sheets.map((s) => {
      if (s.id !== activeSheet.id) return s;
      const idx = s.columns.indexOf(col);
      if (idx === -1) return s;
      const cols = s.columns.slice();
      cols[idx] = newName;
      const rows = s.rows.map((r) => {
        const next = { ...r };
        if (col in next) {
          next[newName] = next[col];
          delete next[col];
        }
        return next;
      });
      return { ...s, columns: cols, rows, updatedAt: Date.now() };
    });
    onChange(updated, activeSheet.id);
  };
  const deleteColumn = (col) => {
    if (!activeSheet || lockedColumns) return;
    if (!confirm(`Delete column "${col}"?`)) return;
    const updated = sheets.map((s) => {
      if (s.id !== activeSheet.id) return s;
      return {
        ...s,
        columns: s.columns.filter((c) => c !== col),
        rows: s.rows.map((r) => {
          const next = { ...r };
          delete next[col];
          return next;
        }),
        updatedAt: Date.now()
      };
    });
    onChange(updated, activeSheet.id);
  };
  const deleteRow = (rowIdx) => {
    if (!activeSheet) return;
    const updated = sheets.map((s) => {
      if (s.id !== activeSheet.id) return s;
      return { ...s, rows: s.rows.filter((_, i) => i !== rowIdx), updatedAt: Date.now() };
    });
    onChange(updated, activeSheet.id);
  };
  const fontFamilyValue = focusedEditor?.getAttributes("textStyle").fontFamily || "";
  const fontSizeValue = focusedEditor?.getAttributes("textStyle").fontSize || "";
  return /* @__PURE__ */ jsxs("div", { className: "flex flex-col h-full bg-white", children: [
    /* @__PURE__ */ jsxs("div", { className: "sticky top-0 z-30 bg-gray-50 border-b border-gray-200 flex flex-wrap items-center gap-0.5 px-3 py-1.5", children: [
      /* @__PURE__ */ jsx(
        ToolbarBtn,
        {
          onClick: () => focusedEditor?.chain().focus().undo().run(),
          title: "Undo",
          disabled: !focusedEditor?.can().undo(),
          children: "↩"
        }
      ),
      /* @__PURE__ */ jsx(
        ToolbarBtn,
        {
          onClick: () => focusedEditor?.chain().focus().redo().run(),
          title: "Redo",
          disabled: !focusedEditor?.can().redo(),
          children: "↪"
        }
      ),
      /* @__PURE__ */ jsx(ToolbarDivider, {}),
      /* @__PURE__ */ jsx(
        "select",
        {
          title: "Font family",
          value: fontFamilyValue,
          onChange: (e) => {
            const v = e.target.value;
            if (!focusedEditor) return;
            if (v) focusedEditor.chain().focus().setFontFamily(v).run();
            else focusedEditor.chain().focus().unsetFontFamily().run();
          },
          className: "text-xs border border-gray-200 rounded px-1 py-1 bg-white text-gray-700 w-28",
          children: FONT_FAMILIES.map((f) => /* @__PURE__ */ jsx("option", { value: f.value, children: f.label }, f.value))
        }
      ),
      /* @__PURE__ */ jsxs(
        "select",
        {
          title: "Font size",
          value: fontSizeValue,
          onChange: (e) => {
            const v = e.target.value;
            if (!focusedEditor) return;
            if (v) focusedEditor.chain().focus().setFontSize(v).run();
            else focusedEditor.chain().focus().unsetFontSize().run();
          },
          className: "text-xs border border-gray-200 rounded px-1 py-1 bg-white text-gray-700 w-16",
          children: [
            /* @__PURE__ */ jsx("option", { value: "", children: "Size" }),
            FONT_SIZES.map((s) => /* @__PURE__ */ jsx("option", { value: s, children: s }, s))
          ]
        }
      ),
      /* @__PURE__ */ jsx(ToolbarDivider, {}),
      /* @__PURE__ */ jsx(
        ToolbarBtn,
        {
          active: focusedEditor?.isActive("bold"),
          onClick: () => focusedEditor?.chain().focus().toggleBold().run(),
          title: "Bold",
          children: /* @__PURE__ */ jsx("strong", { children: "B" })
        }
      ),
      /* @__PURE__ */ jsx(
        ToolbarBtn,
        {
          active: focusedEditor?.isActive("italic"),
          onClick: () => focusedEditor?.chain().focus().toggleItalic().run(),
          title: "Italic",
          children: /* @__PURE__ */ jsx("em", { children: "I" })
        }
      ),
      /* @__PURE__ */ jsx(
        ToolbarBtn,
        {
          active: focusedEditor?.isActive("underline"),
          onClick: () => focusedEditor?.chain().focus().toggleUnderline().run(),
          title: "Underline",
          children: /* @__PURE__ */ jsx("span", { className: "underline", children: "U" })
        }
      ),
      /* @__PURE__ */ jsx(
        ToolbarBtn,
        {
          active: focusedEditor?.isActive("strike"),
          onClick: () => focusedEditor?.chain().focus().toggleStrike().run(),
          title: "Strikethrough",
          children: /* @__PURE__ */ jsx("span", { className: "line-through", children: "S" })
        }
      ),
      /* @__PURE__ */ jsx(ToolbarDivider, {}),
      /* @__PURE__ */ jsxs("div", { className: "relative group", children: [
        /* @__PURE__ */ jsx(ToolbarBtn, { onClick: () => {
        }, title: "Text Color", children: /* @__PURE__ */ jsx("span", { style: { color: focusedEditor?.getAttributes("textStyle").color || "#000" }, children: "A" }) }),
        /* @__PURE__ */ jsxs("div", { className: "absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 p-2 hidden group-hover:grid grid-cols-5 gap-1", children: [
          TEXT_COLORS.map((c) => /* @__PURE__ */ jsx(
            "button",
            {
              onClick: () => focusedEditor?.chain().focus()?.setColor(c).run(),
              className: "w-6 h-6 rounded border border-gray-200",
              style: { backgroundColor: c }
            },
            c
          )),
          /* @__PURE__ */ jsx(
            "button",
            {
              onClick: () => focusedEditor?.chain().focus()?.unsetColor().run(),
              className: "col-span-5 text-[10px] text-gray-500 hover:text-gray-700 mt-1",
              children: "Clear color"
            }
          )
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "relative group", children: [
        /* @__PURE__ */ jsx(
          ToolbarBtn,
          {
            active: focusedEditor?.isActive("highlight"),
            onClick: () => {
            },
            title: "Highlight",
            children: /* @__PURE__ */ jsx("span", { className: "bg-yellow-200 px-0.5", children: "H" })
          }
        ),
        /* @__PURE__ */ jsx("div", { className: "absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 p-2 hidden group-hover:grid grid-cols-5 gap-1", children: HIGHLIGHT_COLORS.map((c) => /* @__PURE__ */ jsx(
          "button",
          {
            onClick: () => {
              if (!focusedEditor) return;
              if (c === "transparent") focusedEditor.chain().focus().unsetHighlight().run();
              else focusedEditor.chain().focus().toggleHighlight({ color: c }).run();
            },
            className: "w-6 h-6 rounded border border-gray-200",
            style: { backgroundColor: c === "transparent" ? "#fff" : c }
          },
          c
        )) })
      ] }),
      /* @__PURE__ */ jsx(ToolbarDivider, {}),
      /* @__PURE__ */ jsx(
        ToolbarBtn,
        {
          active: focusedEditor?.isActive({ textAlign: "left" }),
          onClick: () => focusedEditor?.chain().focus().setTextAlign("left").run(),
          title: "Align Left",
          children: "L"
        }
      ),
      /* @__PURE__ */ jsx(
        ToolbarBtn,
        {
          active: focusedEditor?.isActive({ textAlign: "center" }),
          onClick: () => focusedEditor?.chain().focus().setTextAlign("center").run(),
          title: "Center",
          children: "C"
        }
      ),
      /* @__PURE__ */ jsx(
        ToolbarBtn,
        {
          active: focusedEditor?.isActive({ textAlign: "right" }),
          onClick: () => focusedEditor?.chain().focus().setTextAlign("right").run(),
          title: "Align Right",
          children: "R"
        }
      ),
      /* @__PURE__ */ jsx(
        ToolbarBtn,
        {
          active: focusedEditor?.isActive({ textAlign: "justify" }),
          onClick: () => focusedEditor?.chain().focus().setTextAlign("justify").run(),
          title: "Justify",
          children: "J"
        }
      ),
      /* @__PURE__ */ jsx(ToolbarDivider, {}),
      /* @__PURE__ */ jsx(
        ToolbarBtn,
        {
          active: focusedEditor?.isActive("bulletList"),
          onClick: () => focusedEditor?.chain().focus().toggleBulletList().run(),
          title: "Bullet List",
          children: "•"
        }
      ),
      /* @__PURE__ */ jsx(
        ToolbarBtn,
        {
          active: focusedEditor?.isActive("orderedList"),
          onClick: () => focusedEditor?.chain().focus().toggleOrderedList().run(),
          title: "Numbered List",
          children: "1."
        }
      ),
      /* @__PURE__ */ jsx(ToolbarDivider, {}),
      /* @__PURE__ */ jsx(
        ToolbarBtn,
        {
          onClick: () => {
            if (!focusedEditor) return;
            const id = `cmt_${Date.now()}`;
            focusedEditor.chain().focus().setMark("comment", { commentId: id }).run();
          },
          title: "Add Comment",
          children: "💬"
        }
      ),
      /* @__PURE__ */ jsx(
        ToolbarBtn,
        {
          onClick: () => {
            if (!focusedEditor) return;
            const id = `sug_${Date.now()}`;
            focusedEditor.chain().focus().setMark("suggestion", { suggestionId: id }).run();
          },
          title: "Add Suggestion",
          children: "✏"
        }
      ),
      toolbarExtras && /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx(ToolbarDivider, {}),
        toolbarExtras
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "border-b border-gray-200 bg-gray-50 flex items-center gap-1 px-2 py-1 overflow-x-auto", children: [
      sheets.map((s) => {
        const active = s.id === activeSheetId;
        if (renamingSheetId === s.id) {
          return /* @__PURE__ */ jsx(
            "input",
            {
              autoFocus: true,
              value: renameValue,
              onChange: (e) => setRenameValue(e.target.value),
              onBlur: () => {
                if (renameValue.trim()) onRenameSheet(s.id, renameValue.trim());
                setRenamingSheetId(null);
              },
              onKeyDown: (e) => {
                if (e.key === "Enter") {
                  if (renameValue.trim()) onRenameSheet(s.id, renameValue.trim());
                  setRenamingSheetId(null);
                } else if (e.key === "Escape") {
                  setRenamingSheetId(null);
                }
              },
              className: "text-xs border border-[#A52A2A] rounded px-2 py-1 bg-white outline-none"
            },
            s.id
          );
        }
        return /* @__PURE__ */ jsxs(
          "div",
          {
            className: `group flex items-center gap-1 px-2 py-1 rounded text-xs cursor-pointer border ${active ? "bg-white border-[#A52A2A] text-[#A52A2A]" : "border-transparent text-gray-600 hover:bg-white"}`,
            onClick: () => onSwitchSheet(s.id),
            onDoubleClick: () => {
              setRenamingSheetId(s.id);
              setRenameValue(s.name);
            },
            title: "Double-click to rename",
            children: [
              /* @__PURE__ */ jsx("span", { children: s.name }),
              sheets.length > 1 && /* @__PURE__ */ jsx(
                "button",
                {
                  type: "button",
                  className: "opacity-0 group-hover:opacity-100 hover:text-red-600 ml-1",
                  onClick: (e) => {
                    e.stopPropagation();
                    if (confirm(`Delete sheet "${s.name}"?`)) onDeleteSheet(s.id);
                  },
                  "aria-label": "Delete sheet",
                  children: "×"
                }
              )
            ]
          },
          s.id
        );
      }),
      /* @__PURE__ */ jsx(
        "button",
        {
          type: "button",
          onClick: onAddSheet,
          className: "text-xs px-2 py-1 rounded text-gray-500 hover:text-[#A52A2A] hover:bg-white border border-dashed border-gray-300",
          children: "+ Sheet"
        }
      )
    ] }),
    /* @__PURE__ */ jsx("div", { className: "flex-1 min-h-0 overflow-auto", children: activeSheet ? /* @__PURE__ */ jsxs("table", { className: "border-collapse w-max min-w-full", children: [
      /* @__PURE__ */ jsx("thead", { className: "sticky top-0 z-20 bg-gray-100", children: /* @__PURE__ */ jsxs("tr", { children: [
        /* @__PURE__ */ jsx("th", { className: "w-10 border border-gray-200 bg-gray-100 text-xs text-gray-400 sticky left-0 z-10", children: "#" }),
        activeSheet.columns.map((col) => /* @__PURE__ */ jsx(
          "th",
          {
            className: "border border-gray-200 bg-gray-100 text-xs font-semibold text-gray-700 px-2 py-1 min-w-[160px] text-left group/col",
            onDoubleClick: () => renameColumn(col),
            title: lockedColumns ? col : "Double-click to rename",
            children: /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between gap-2", children: [
              /* @__PURE__ */ jsx("span", { children: col }),
              !lockedColumns && /* @__PURE__ */ jsx(
                "button",
                {
                  type: "button",
                  onClick: () => deleteColumn(col),
                  className: "opacity-0 group-hover/col:opacity-100 text-gray-400 hover:text-red-600 text-[10px]",
                  "aria-label": "Delete column",
                  children: "×"
                }
              )
            ] })
          },
          col
        )),
        !lockedColumns && /* @__PURE__ */ jsx("th", { className: "border border-gray-200 bg-gray-100 px-2 py-1 w-10", children: /* @__PURE__ */ jsx(
          "button",
          {
            type: "button",
            onClick: addColumn,
            className: "text-xs text-gray-500 hover:text-[#A52A2A]",
            title: "Add column",
            children: "+"
          }
        ) })
      ] }) }),
      /* @__PURE__ */ jsxs("tbody", { children: [
        activeSheet.rows.map((row, rIdx) => /* @__PURE__ */ jsxs("tr", { className: "group/row", children: [
          /* @__PURE__ */ jsx("td", { className: "w-10 border border-gray-200 bg-gray-50 text-[10px] text-gray-400 text-center sticky left-0 z-10", children: /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-center gap-1", children: [
            /* @__PURE__ */ jsx("span", { children: rIdx + 1 }),
            /* @__PURE__ */ jsx(
              "button",
              {
                type: "button",
                onClick: () => deleteRow(rIdx),
                className: "opacity-0 group-hover/row:opacity-100 text-gray-400 hover:text-red-600",
                "aria-label": "Delete row",
                children: "×"
              }
            )
          ] }) }),
          activeSheet.columns.map((col) => {
            const isActive = activeCell?.row === rIdx && activeCell?.col === col;
            const readOnly = isReadOnlyCol(col);
            return /* @__PURE__ */ jsx(
              "td",
              {
                className: `border border-gray-200 align-top ${isActive ? "ring-2 ring-[#A52A2A] bg-yellow-50" : "bg-white"} ${readOnly ? "bg-gray-50" : ""}`,
                onClick: () => {
                  if (readOnly) return;
                  setActiveCell({ row: rIdx, col });
                },
                children: isActive && !readOnly ? /* @__PURE__ */ jsx(
                  ActiveCellEditor,
                  {
                    value: row[col] || "",
                    onCommit: (html) => updateCell(rIdx, col, html),
                    onFocus: (ed) => setFocusedEditor(ed),
                    onBlur: () => {
                    }
                  },
                  `${activeSheet.id}-${rIdx}-${col}`
                ) : /* @__PURE__ */ jsx(
                  CellPreview,
                  {
                    value: row[col] || "",
                    onClick: () => {
                      if (readOnly) return;
                      setActiveCell({ row: rIdx, col });
                    }
                  }
                )
              },
              col
            );
          }),
          !lockedColumns && /* @__PURE__ */ jsx("td", { className: "border border-gray-200 bg-white" })
        ] }, rIdx)),
        /* @__PURE__ */ jsx("tr", { children: /* @__PURE__ */ jsx("td", { colSpan: activeSheet.columns.length + (lockedColumns ? 1 : 2), children: /* @__PURE__ */ jsx(
          "button",
          {
            type: "button",
            onClick: addRow,
            className: "w-full text-xs text-gray-500 hover:text-[#A52A2A] py-1.5 hover:bg-gray-50",
            children: "+ Add row"
          }
        ) }) })
      ] })
    ] }) : /* @__PURE__ */ jsx("div", { className: "p-6 text-sm text-gray-500", children: "No sheet selected." }) })
  ] });
}
const SR_DEFAULT_COLUMNS = ["Date", "Session", "Mentor", "Topic", "Attendance"];
const AR_DEFAULT_COLUMNS = [
  "Name",
  "Documents",
  "School Board",
  "GMB Review",
  "Remarks",
  "Parent Name",
  "NO. OF SESSION",
  "Validity"
];
const AR_LOCKED_COLUMNS = [];
const MONTH_LABELS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December"
];
function monthColumnFor(dateStr) {
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const year = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  const day = parseInt(m[3], 10);
  if (!month || month < 1 || month > 12) return null;
  return { column: `${MONTH_LABELS[month - 1]} ${year}`, day };
}
function htmlToText(html) {
  if (!html) return "";
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  return (tmp.textContent || tmp.innerText || "").trim();
}
function textToHtml(text) {
  const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<p>${escaped.replace(/\n/g, "<br/>")}</p>`;
}
function emptySheet$1(name, columns) {
  const id = `sheet_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  return {
    id,
    name,
    columns,
    rows: Array.from({ length: 30 }, () => Object.fromEntries(columns.map((c) => [c, ""]))),
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
}
function normalizeName(n) {
  return n.toLowerCase().replace(/\s+/g, " ").replace(/[^a-z0-9 ]/g, "").trim();
}
function splitName(normalized) {
  const parts = normalized.split(" ").filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}
function nameSimilarity(a, b) {
  if (a === b) return 1;
  if (!a || !b) return 0;
  const maxLen = Math.max(a.length, b.length);
  const matrix = Array.from(
    { length: a.length + 1 },
    (_, i) => Array.from({ length: b.length + 1 }, (_2, j) => i === 0 ? j : j === 0 ? i : 0)
  );
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return 1 - matrix[a.length][b.length] / maxLen;
}
function parseExcelDate(value) {
  if (value == null || value === "") return null;
  if (typeof value === "number" && value > 3e4 && value < 1e5) {
    const d = new Date(Math.round((value - 25569) * 864e5));
    if (isNaN(d.getTime())) return null;
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return null;
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, "0");
    const day = String(value.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  const str = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const d = /* @__PURE__ */ new Date(str + "T00:00:00Z");
    if (isNaN(d.getTime())) return null;
    return str;
  }
  const slashMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const [, a, b, y] = slashMatch;
    const iso = `${y}-${a.padStart(2, "0")}-${b.padStart(2, "0")}`;
    const d = /* @__PURE__ */ new Date(iso + "T00:00:00Z");
    if (!isNaN(d.getTime())) return iso;
  }
  return null;
}
function parseZoomWorkbook(buf) {
  const wb = XLSX.read(buf, { type: "array" });
  const all = [];
  const invalid = [];
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
    if (rows.length === 0) continue;
    const sample = rows[0];
    const keys = Object.keys(sample);
    const nameKey = keys.find((k) => /name/i.test(k) && !/email/i.test(k)) || keys.find((k) => /participant|attendee|user/i.test(k));
    const durationKey = keys.find((k) => /duration.*\(.*minute/i.test(k)) || keys.find((k) => /duration/i.test(k)) || keys.find((k) => /minutes/i.test(k)) || keys.find((k) => /time.*spent/i.test(k));
    const emailKey = keys.find((k) => /email/i.test(k));
    const dateKey = keys.find((k) => /\bdate\b/i.test(k)) || keys.find((k) => /join.*time|start.*time|session.*date/i.test(k));
    if (!nameKey) continue;
    for (const row of rows) {
      const rawName = String(row[nameKey] || "").trim();
      if (!rawName) {
        invalid.push({ row, reason: "Missing name" });
        continue;
      }
      let dur = 0;
      if (durationKey) {
        const v = row[durationKey];
        if (typeof v === "number") dur = v;
        else if (typeof v === "string") {
          const m = v.match(/(\d+)/);
          if (m) dur = parseInt(m[1], 10);
        }
      }
      const email = emailKey ? String(row[emailKey] || "").trim() : "";
      const date = dateKey ? parseExcelDate(row[dateKey]) : void 0;
      all.push({ name: rawName, durationMinutes: dur, email: email || void 0, date: date || void 0 });
    }
  }
  return { entries: all, invalidRows: invalid };
}
function matchAttendees(zoom, invalidRows, users, arSheet) {
  const counts = /* @__PURE__ */ new Map();
  for (const e of zoom) {
    const k = normalizeName(e.name);
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  const seen = /* @__PURE__ */ new Set();
  const userByNorm = /* @__PURE__ */ new Map();
  const usersByFirstName = /* @__PURE__ */ new Map();
  for (const u of users) {
    const norm = normalizeName(u.name);
    userByNorm.set(norm, u);
    const { firstName } = splitName(norm);
    if (firstName) {
      const list = usersByFirstName.get(firstName) || [];
      list.push(u);
      usersByFirstName.set(firstName, list);
    }
  }
  const sheetNamesNorm = /* @__PURE__ */ new Set();
  if (arSheet) {
    for (const r of arSheet.rows) {
      const txt = htmlToText(r["Name"] || r["Student"] || "");
      if (txt) sheetNamesNorm.add(normalizeName(txt));
    }
  }
  const matched = [];
  const unmatched = [];
  const duplicates = [];
  for (const e of zoom) {
    const key2 = normalizeName(e.name);
    if (counts.get(key2) > 1 && !seen.has(key2)) {
      duplicates.push({ name: e.name, count: counts.get(key2) });
    }
    if (seen.has(key2)) continue;
    seen.add(key2);
    const exactMatch = userByNorm.get(key2);
    if (exactMatch) {
      matched.push({ name: exactMatch.name, source: "user", email: exactMatch.email, zoomName: e.name });
      continue;
    }
    const { firstName: zoomFirst, lastName: zoomLast } = splitName(key2);
    let userMatch = null;
    if (zoomFirst) {
      const candidates = usersByFirstName.get(zoomFirst);
      if (candidates) {
        if (candidates.length === 1) {
          userMatch = candidates[0];
        } else if (candidates.length > 1) {
          if (zoomLast) {
            const lastMatches = candidates.filter((u) => {
              const { lastName } = splitName(normalizeName(u.name));
              return lastName === zoomLast;
            });
            if (lastMatches.length === 1) {
              userMatch = lastMatches[0];
            } else {
              const pool = lastMatches.length > 0 ? lastMatches : candidates;
              let best = null;
              let bestScore = 0;
              for (const c of pool) {
                const score = nameSimilarity(key2, normalizeName(c.name));
                if (score > bestScore) {
                  bestScore = score;
                  best = c;
                }
              }
              if (best && bestScore > 0.5) userMatch = best;
            }
          } else {
            let best = null;
            let bestScore = 0;
            for (const c of candidates) {
              const score = nameSimilarity(key2, normalizeName(c.name));
              if (score > bestScore) {
                bestScore = score;
                best = c;
              }
            }
            if (best && bestScore > 0.5) userMatch = best;
          }
        }
      }
    }
    if (userMatch) {
      matched.push({ name: userMatch.name, source: "user", email: userMatch.email, zoomName: e.name });
      continue;
    }
    if (sheetNamesNorm.has(key2)) {
      matched.push({ name: e.name, source: "sheet", zoomName: e.name });
      continue;
    }
    unmatched.push({ name: e.name });
  }
  return { matched, unmatched, duplicates, invalid: invalidRows };
}
function UploadModal({ open, onClose, onApply, arSheet, users }) {
  const [file, setFile] = useState(null);
  const [parsed, setParsed] = useState(null);
  const [minMinutes, setMinMinutes] = useState(5);
  const [sessionDate, setSessionDate] = useState(
    () => (/* @__PURE__ */ new Date()).toISOString().slice(0, 10)
  );
  const [parsing, setParsing] = useState(false);
  const [summary, setSummary] = useState(null);
  const [processing, setProcessing] = useState(false);
  useEffect(() => {
    if (!open) {
      setFile(null);
      setParsed(null);
      setSummary(null);
      setProcessing(false);
    }
  }, [open]);
  async function handleFile(f) {
    setFile(f);
    setParsing(true);
    setSummary(null);
    try {
      const buf = await f.arrayBuffer();
      const result = parseZoomWorkbook(buf);
      setParsed(result);
      const firstDate = result.entries.find((e) => e.date)?.date;
      if (firstDate) setSessionDate(firstDate);
    } catch (err) {
      console.error("Parse error", err);
      alert("Could not read this Excel file.");
    } finally {
      setParsing(false);
    }
  }
  const hasDatesInFile = useMemo(() => {
    if (!parsed) return false;
    return parsed.entries.some((e) => e.date);
  }, [parsed]);
  const filtered = useMemo(() => {
    if (!parsed) return [];
    return parsed.entries.filter((e) => e.durationMinutes >= minMinutes);
  }, [parsed, minMinutes]);
  const matchResult = useMemo(() => {
    if (!parsed) return null;
    return matchAttendees(filtered, parsed.invalidRows, users, arSheet);
  }, [parsed, filtered, users, arSheet]);
  if (!open) return null;
  async function applyUpload() {
    if (!matchResult || !parsed) return;
    setProcessing(true);
    try {
      const entries = [];
      for (const m of matchResult.matched) {
        const entry = filtered.find((e) => normalizeName(e.name) === normalizeName(m.zoomName));
        const date = entry?.date || sessionDate;
        entries.push({ name: m.name, date });
      }
      for (const u of matchResult.unmatched) {
        const entry = filtered.find((e) => normalizeName(e.name) === normalizeName(u.name));
        const date = entry?.date || sessionDate;
        entries.push({ name: `${u.name} (Discovery Student)`, date });
      }
      const filteredOut = (parsed.entries.length || 0) - filtered.length;
      const result = await onApply({
        entries,
        matchResult,
        stats: { totalParsed: parsed.entries.length, filteredOut, invalidCount: parsed.invalidRows.length }
      });
      setSummary(result);
    } finally {
      setProcessing(false);
    }
  }
  if (summary) {
    return /* @__PURE__ */ jsx("div", { className: "fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4", children: /* @__PURE__ */ jsxs("div", { className: "bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between border-b border-gray-200 px-5 py-3", children: [
        /* @__PURE__ */ jsx(
          "h2",
          {
            className: "text-lg font-semibold text-gray-800",
            style: { fontFamily: '"Playfair Display", serif' },
            children: "Upload Summary"
          }
        ),
        /* @__PURE__ */ jsx(
          "button",
          {
            onClick: onClose,
            className: "text-gray-400 hover:text-gray-700 text-xl leading-none",
            children: "×"
          }
        )
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "flex-1 overflow-auto px-5 py-4 space-y-4", children: [
        /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-3 gap-3", children: [
          /* @__PURE__ */ jsxs("div", { className: "bg-gray-50 border border-gray-200 rounded p-3 text-center", children: [
            /* @__PURE__ */ jsx("div", { className: "text-2xl font-bold text-gray-800", children: summary.total }),
            /* @__PURE__ */ jsx("div", { className: "text-xs text-gray-500 uppercase tracking-wide", children: "Total Rows" })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "bg-green-50 border border-green-200 rounded p-3 text-center", children: [
            /* @__PURE__ */ jsx("div", { className: "text-2xl font-bold text-green-700", children: summary.saved }),
            /* @__PURE__ */ jsx("div", { className: "text-xs text-green-600 uppercase tracking-wide", children: "Saved" })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "bg-amber-50 border border-amber-200 rounded p-3 text-center", children: [
            /* @__PURE__ */ jsx("div", { className: "text-2xl font-bold text-amber-700", children: summary.skipped }),
            /* @__PURE__ */ jsx("div", { className: "text-xs text-amber-600 uppercase tracking-wide", children: "Skipped" })
          ] })
        ] }),
        summary.reasons.length > 0 && /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("div", { className: "text-xs font-semibold text-gray-600 uppercase mb-2", children: "Skip Reasons" }),
          /* @__PURE__ */ jsx("div", { className: "border border-gray-200 rounded bg-gray-50 max-h-48 overflow-auto", children: /* @__PURE__ */ jsxs("table", { className: "w-full text-xs", children: [
            /* @__PURE__ */ jsx("thead", { children: /* @__PURE__ */ jsxs("tr", { className: "border-b border-gray-200", children: [
              /* @__PURE__ */ jsx("th", { className: "px-3 py-1.5 text-left text-gray-500", children: "Name" }),
              /* @__PURE__ */ jsx("th", { className: "px-3 py-1.5 text-left text-gray-500", children: "Reason" })
            ] }) }),
            /* @__PURE__ */ jsx("tbody", { children: summary.reasons.map((r, i) => /* @__PURE__ */ jsxs("tr", { className: "border-b border-gray-100 last:border-0", children: [
              /* @__PURE__ */ jsx("td", { className: "px-3 py-1 text-gray-700", children: r.name || "—" }),
              /* @__PURE__ */ jsx("td", { className: "px-3 py-1 text-amber-700", children: r.reason })
            ] }, i)) })
          ] }) })
        ] })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "border-t border-gray-200 px-5 py-3 flex items-center justify-end", children: /* @__PURE__ */ jsx(
        "button",
        {
          onClick: onClose,
          className: "text-xs px-4 py-1.5 rounded bg-[#A52A2A] text-white hover:bg-[#8b1f1f] uppercase tracking-wide",
          children: "Close"
        }
      ) })
    ] }) });
  }
  return /* @__PURE__ */ jsx("div", { className: "fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4", children: /* @__PURE__ */ jsxs("div", { className: "bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between border-b border-gray-200 px-5 py-3", children: [
      /* @__PURE__ */ jsx(
        "h2",
        {
          className: "text-lg font-semibold text-gray-800",
          style: { fontFamily: '"Playfair Display", serif' },
          children: "Upload Zoom Attendance"
        }
      ),
      /* @__PURE__ */ jsx(
        "button",
        {
          onClick: onClose,
          className: "text-gray-400 hover:text-gray-700 text-xl leading-none",
          children: "×"
        }
      )
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "flex-1 overflow-auto px-5 py-4 space-y-4", children: [
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("label", { className: "block text-xs font-semibold text-gray-600 uppercase mb-2", children: "Zoom Excel File" }),
        /* @__PURE__ */ jsx(
          "input",
          {
            type: "file",
            accept: ".xlsx,.xls,.csv",
            onChange: (e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            },
            className: "text-sm"
          }
        ),
        file && /* @__PURE__ */ jsxs("p", { className: "text-xs text-gray-500 mt-1", children: [
          file.name,
          " (",
          Math.round(file.size / 1024),
          " KB)"
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-1 sm:grid-cols-2 gap-3", children: [
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("label", { className: "block text-xs font-semibold text-gray-600 uppercase mb-1", children: "Min duration (minutes)" }),
          /* @__PURE__ */ jsx(
            "input",
            {
              type: "number",
              value: minMinutes,
              min: 0,
              onChange: (e) => setMinMinutes(parseInt(e.target.value || "0", 10)),
              className: "w-full text-sm border border-gray-200 rounded px-2 py-1"
            }
          )
        ] }),
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsxs("label", { className: "block text-xs font-semibold text-gray-600 uppercase mb-1", children: [
            "Session Date ",
            hasDatesInFile && /* @__PURE__ */ jsx("span", { className: "text-green-600 normal-case", children: "(auto-detected from file)" })
          ] }),
          /* @__PURE__ */ jsx(
            "input",
            {
              type: "date",
              value: sessionDate,
              onChange: (e) => setSessionDate(e.target.value),
              className: "w-full text-sm border border-gray-200 rounded px-2 py-1",
              title: hasDatesInFile ? "Dates detected in file — this is a fallback for rows without dates" : void 0
            }
          ),
          hasDatesInFile && /* @__PURE__ */ jsx("p", { className: "text-[10px] text-green-600 mt-0.5", children: "Per-row dates found in file. This date is a fallback for rows missing a date." })
        ] })
      ] }),
      parsing && /* @__PURE__ */ jsx("p", { className: "text-sm text-gray-500", children: "Parsing file..." }),
      matchResult && /* @__PURE__ */ jsxs("div", { className: "border border-gray-200 rounded p-3 bg-gray-50 space-y-3", children: [
        /* @__PURE__ */ jsxs("div", { className: "text-xs", children: [
          /* @__PURE__ */ jsx("span", { className: "font-semibold", children: "Found:" }),
          " ",
          parsed?.entries.length || 0,
          " rows; kept ",
          filtered.length,
          " after <",
          minMinutes,
          "m filter.",
          (parsed?.entries.length || 0) - filtered.length > 0 && /* @__PURE__ */ jsxs("span", { className: "text-amber-600 ml-1", children: [
            "(",
            (parsed?.entries.length || 0) - filtered.length,
            " skipped for short duration)"
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-3", children: [
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsxs("div", { className: "text-xs font-semibold text-green-700 uppercase mb-1", children: [
              "Matched (",
              matchResult.matched.length,
              ")"
            ] }),
            /* @__PURE__ */ jsx("ul", { className: "text-xs space-y-0.5 max-h-40 overflow-auto", children: matchResult.matched.map((m, i) => {
              const fuzzy = normalizeName(m.zoomName) !== normalizeName(m.name);
              return /* @__PURE__ */ jsxs("li", { children: [
                fuzzy ? /* @__PURE__ */ jsxs(Fragment, { children: [
                  /* @__PURE__ */ jsx("span", { className: "text-gray-500", children: m.zoomName }),
                  /* @__PURE__ */ jsx("span", { className: "text-gray-400", children: " → " }),
                  m.name
                ] }) : m.name,
                " ",
                /* @__PURE__ */ jsxs("span", { className: "text-gray-400", children: [
                  "(",
                  m.source === "user" ? "user" : "sheet",
                  ")"
                ] })
              ] }, i);
            }) })
          ] }),
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsxs("div", { className: "text-xs font-semibold text-amber-700 uppercase mb-1", children: [
              "Unmatched → Discovery (",
              matchResult.unmatched.length,
              ")"
            ] }),
            /* @__PURE__ */ jsx("ul", { className: "text-xs space-y-0.5 max-h-40 overflow-auto", children: matchResult.unmatched.map((m, i) => /* @__PURE__ */ jsxs("li", { children: [
              m.name,
              " (Discovery Student)"
            ] }, i)) })
          ] }),
          matchResult.duplicates.length > 0 && /* @__PURE__ */ jsxs("div", { className: "md:col-span-2", children: [
            /* @__PURE__ */ jsxs("div", { className: "text-xs font-semibold text-blue-700 uppercase mb-1", children: [
              "Duplicates collapsed (",
              matchResult.duplicates.length,
              ")"
            ] }),
            /* @__PURE__ */ jsx("ul", { className: "text-xs space-y-0.5 max-h-24 overflow-auto", children: matchResult.duplicates.map((d, i) => /* @__PURE__ */ jsxs("li", { children: [
              d.name,
              " ×",
              d.count
            ] }, i)) })
          ] }),
          matchResult.invalid.length > 0 && /* @__PURE__ */ jsxs("div", { className: "md:col-span-2", children: [
            /* @__PURE__ */ jsxs("div", { className: "text-xs font-semibold text-red-700 uppercase mb-1", children: [
              "Invalid rows (",
              matchResult.invalid.length,
              ")"
            ] }),
            /* @__PURE__ */ jsx("ul", { className: "text-xs space-y-0.5 max-h-24 overflow-auto", children: matchResult.invalid.map((d, i) => /* @__PURE__ */ jsx("li", { children: d.reason }, i)) })
          ] })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "border-t border-gray-200 px-5 py-3 flex items-center justify-end gap-2", children: [
      /* @__PURE__ */ jsx(
        "button",
        {
          onClick: onClose,
          className: "text-xs text-gray-500 hover:text-gray-800 px-3 py-1.5 uppercase tracking-wide",
          children: "Cancel"
        }
      ),
      /* @__PURE__ */ jsx(
        "button",
        {
          disabled: !matchResult || processing,
          onClick: applyUpload,
          className: "text-xs px-3 py-1.5 rounded bg-[#A52A2A] text-white hover:bg-[#8b1f1f] disabled:opacity-50 uppercase tracking-wide",
          children: processing ? "Saving…" : "Apply to SR"
        }
      )
    ] })
  ] }) });
}
function ARSRModule({
  currentUser: _currentUser,
  onUploadComplete
}) {
  const [section, setSection] = useState("sr");
  const [workbooks, setWorkbooks] = useState({
    sr: null,
    ar: null
  });
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState("idle");
  const [rosterStatus, setRosterStatus] = useState("idle");
  const [users, setUsers] = useState([]);
  const [showUpload, setShowUpload] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const saveTimers = useRef({ sr: null, ar: null });
  const wb = workbooks[section];
  async function loadWorkbook(s) {
    try {
      const res = await apiFetch(`/api/arsr-sheets?section=${s}`);
      if (!res.ok) throw new Error(`Load ${s} failed`);
      const data = await res.json();
      setWorkbooks((prev) => ({ ...prev, [s]: data.workbook }));
    } catch (err) {
      console.error(err);
    }
  }
  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      await Promise.all([loadWorkbook("sr"), loadWorkbook("ar")]);
      try {
        const r = await apiFetch("/api/users");
        if (r.ok) {
          const d = await r.json();
          if (mounted) setUsers(d.users || []);
        }
      } catch {
      }
      if (mounted) setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, []);
  useEffect(() => {
    function onBeforeUnload(e) {
      const hasPending = Boolean(saveTimers.current.sr || saveTimers.current.ar);
      if (hasPending || saveStatus === "saving") {
        e.preventDefault();
        e.returnValue = "";
      }
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [saveStatus]);
  function scheduleSave(s, next) {
    if (saveTimers.current[s]) clearTimeout(saveTimers.current[s]);
    setSaveStatus("saving");
    saveTimers.current[s] = setTimeout(async () => {
      try {
        const res = await apiFetch(`/api/arsr-sheets?section=${s}`, {
          method: "PUT",
          body: JSON.stringify(next)
        });
        if (!res.ok) throw new Error("Save failed");
        setSaveStatus("saved");
        setTimeout(() => setSaveStatus("idle"), 1500);
      } catch (err) {
        console.error(err);
        setSaveStatus("error");
      }
    }, 700);
  }
  async function flushPendingSaves() {
    const pending = Object.keys(saveTimers.current).filter(
      (k) => saveTimers.current[k]
    );
    if (pending.length === 0) return;
    setSaveStatus("saving");
    try {
      await Promise.all(
        pending.map(async (s) => {
          if (saveTimers.current[s]) clearTimeout(saveTimers.current[s]);
          saveTimers.current[s] = null;
          const wbk = workbooks[s];
          if (!wbk) return;
          const res = await apiFetch(`/api/arsr-sheets?section=${s}`, {
            method: "PUT",
            body: JSON.stringify(wbk)
          });
          if (!res.ok) throw new Error(`Flush ${s} failed`);
        })
      );
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 1200);
    } catch (err) {
      console.error("flushPendingSaves", err);
      setSaveStatus("error");
    }
  }
  async function switchSection(next) {
    if (next === section) return;
    await flushPendingSaves();
    setSection(next);
  }
  function updateWorkbook(s, updater) {
    setWorkbooks((prev) => {
      const current = prev[s];
      if (!current) return prev;
      const next = updater(current);
      scheduleSave(s, next);
      return { ...prev, [s]: next };
    });
  }
  function handleSheetsChange(sheets, activeSheetId) {
    updateWorkbook(section, (w) => ({ ...w, sheets, activeSheetId }));
  }
  function addSheet() {
    if (!wb) return;
    const cols = section === "sr" ? SR_DEFAULT_COLUMNS : AR_DEFAULT_COLUMNS;
    const newSheet = emptySheet$1(`Sheet ${wb.sheets.length + 1}`, cols);
    updateWorkbook(section, (w) => ({
      ...w,
      sheets: [...w.sheets, newSheet],
      activeSheetId: newSheet.id
    }));
  }
  function renameSheet(id, name) {
    updateWorkbook(section, (w) => ({
      ...w,
      sheets: w.sheets.map((s) => s.id === id ? { ...s, name } : s)
    }));
  }
  function deleteSheet(id) {
    updateWorkbook(section, (w) => {
      const remaining = w.sheets.filter((s) => s.id !== id);
      const newActive = w.activeSheetId === id ? remaining[0]?.id || null : w.activeSheetId;
      return { ...w, sheets: remaining, activeSheetId: newActive };
    });
  }
  function switchSheet(id) {
    updateWorkbook(section, (w) => ({ ...w, activeSheetId: id }));
  }
  async function refreshRoster() {
    setRosterStatus("loading");
    try {
      const r = await apiFetch("/api/google-sheets-fetch?refresh=1");
      if (!r.ok) {
        setRosterStatus("error");
        return;
      }
      const r2 = await apiFetch("/api/ar-enrich", {
        method: "POST",
        body: JSON.stringify({ retryAll: true })
      });
      if (!r2.ok) {
        setRosterStatus("error");
        return;
      }
      await loadWorkbook("ar");
      setRosterStatus("ok");
      setTimeout(() => setRosterStatus("idle"), 1500);
    } catch {
      setRosterStatus("error");
    }
  }
  function activeSheetOf(s) {
    const wbk = workbooks[s];
    if (!wbk) return null;
    return wbk.sheets.find((sh) => sh.id === wbk.activeSheetId) || wbk.sheets[0] || null;
  }
  async function applyZoomUpload(params) {
    const srWb = workbooks.sr;
    const arWb = workbooks.ar;
    const skipReasons = [];
    let savedCount = 0;
    if (!srWb) {
      return { total: params.stats.totalParsed, saved: 0, skipped: params.stats.totalParsed, reasons: [{ name: "", reason: "SR workbook not loaded" }] };
    }
    const srActive = srWb.sheets.find((s) => s.id === srWb.activeSheetId) || srWb.sheets[0];
    if (!srActive) {
      return { total: params.stats.totalParsed, saved: 0, skipped: params.stats.totalParsed, reasons: [{ name: "", reason: "No active SR sheet" }] };
    }
    for (let i = 0; i < params.stats.filteredOut; i++) {
      skipReasons.push({ name: "", reason: "Duration below minimum" });
    }
    for (let i = 0; i < params.stats.invalidCount; i++) {
      skipReasons.push({ name: "", reason: "Invalid row in file" });
    }
    const newStudentSessions = { ...srWb.studentSessions };
    const newStudentUserMap = { ...srWb.studentUserMap || {} };
    for (const m of params.matchResult.matched) {
      if (m.email) newStudentUserMap[m.name] = m.email;
    }
    const rows = srActive.rows.slice();
    const byDate = /* @__PURE__ */ new Map();
    for (const e of params.entries) {
      if (!e.date) {
        console.log(`[SR Upload] Skipped [${e.name}] — no date`);
        skipReasons.push({ name: e.name, reason: "No date" });
        continue;
      }
      console.log(`[SR Upload] Processing [${e.name}] for date [${e.date}]`);
      const list = byDate.get(e.date) || [];
      list.push(e.name);
      byDate.set(e.date, list);
    }
    for (const [date, names] of byDate) {
      let rowIdx = rows.findIndex((r) => {
        const cellDate = htmlToText(r["Date"] || "").trim();
        return cellDate === date;
      });
      if (rowIdx === -1) {
        rowIdx = rows.findIndex(
          (r) => Object.values(r).every((v) => !htmlToText(v || ""))
        );
        if (rowIdx === -1) {
          rows.push({});
          rowIdx = rows.length - 1;
        }
        rows[rowIdx] = { ...rows[rowIdx], Date: textToHtml(date) };
      }
      const existing = rows[rowIdx];
      const existingNames = htmlToText(existing["Attendance"] || "").split(/\n|,/).map((s) => s.trim()).filter(Boolean);
      const seen = new Set(existingNames.map((n) => n.toLowerCase()));
      const merged = existingNames.slice();
      for (const name of names) {
        const sessions = newStudentSessions[name] || [];
        if (sessions.includes(date)) {
          console.log(`[SR Upload] Duplicate skipped — [${name}] already has session on [${date}]`);
          skipReasons.push({ name, reason: `Already has session on ${date}` });
          continue;
        }
        if (seen.has(name.toLowerCase())) {
          console.log(`[SR Upload] Duplicate skipped — [${name}] already in attendance for [${date}]`);
          skipReasons.push({ name, reason: `Already in attendance for ${date}` });
          continue;
        }
        console.log(`[SR Upload] Matched [${name}]`);
        console.log(`[SR Upload] Session added for [${name}] on [${date}]`);
        merged.push(name);
        seen.add(name.toLowerCase());
        newStudentSessions[name] = [...newStudentSessions[name] || [], date];
        savedCount++;
      }
      rows[rowIdx] = {
        ...rows[rowIdx],
        Attendance: textToHtml(merged.join("\n"))
      };
    }
    const updatedSrSheet = { ...srActive, rows, updatedAt: Date.now() };
    const newErrors = [];
    for (const u of params.matchResult.unmatched) {
      newErrors.push({
        id: `err_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        type: "unmatched",
        message: `"${u.name}" not matched — added as Discovery Student`,
        createdAt: Date.now()
      });
    }
    for (const d of params.matchResult.duplicates) {
      newErrors.push({
        id: `err_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        type: "duplicate",
        message: `"${d.name}" appeared ${d.count}× in upload`,
        createdAt: Date.now()
      });
    }
    for (const i of params.matchResult.invalid) {
      newErrors.push({
        id: `err_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        type: "invalid",
        message: i.reason,
        context: i.row,
        createdAt: Date.now()
      });
    }
    const nextSr = {
      ...srWb,
      sheets: srWb.sheets.map((s) => s.id === updatedSrSheet.id ? updatedSrSheet : s),
      studentSessions: newStudentSessions,
      studentUserMap: newStudentUserMap,
      errors: [...srWb.errors, ...newErrors],
      updatedAt: Date.now()
    };
    let nextAr = null;
    if (arWb) {
      const allDates = Array.from(byDate.keys());
      const updatedArSheets = arWb.sheets.map((sheet) => {
        const cols = sheet.columns.slice();
        for (const date of allDates) {
          const monthInfo = monthColumnFor(date);
          if (monthInfo && !cols.includes(monthInfo.column)) cols.push(monthInfo.column);
        }
        const arRows = sheet.rows.map((r) => {
          const next = {};
          for (const c of cols) next[c] = r[c] || "";
          return next;
        });
        return { ...sheet, columns: cols, rows: arRows };
      });
      const crossIndex = /* @__PURE__ */ new Map();
      updatedArSheets.forEach((sheet, si) => {
        const studentCol = sheet.columns.includes("Name") ? "Name" : sheet.columns.includes("Student") ? "Student" : sheet.columns[0];
        sheet.rows.forEach((r, ri) => {
          const t = htmlToText(r[studentCol] || "").toLowerCase();
          if (t && !crossIndex.has(t)) crossIndex.set(t, { si, ri });
        });
      });
      const appendDay = (cellHtml, day) => {
        const text = htmlToText(cellHtml);
        const days = text.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
        if (days.includes(String(day))) return cellHtml;
        days.push(String(day));
        return textToHtml(days.join(", "));
      };
      const allNames = /* @__PURE__ */ new Set();
      for (const names of byDate.values()) {
        for (const n of names) allNames.add(n);
      }
      for (const name of allNames) {
        const key2 = name.toLowerCase();
        let target = crossIndex.get(key2);
        if (!target) {
          const defaultIdx = 0;
          const sheet2 = updatedArSheets[defaultIdx];
          const studentCol = sheet2.columns.includes("Name") ? "Name" : sheet2.columns.includes("Student") ? "Student" : sheet2.columns[0];
          let emptyIdx = sheet2.rows.findIndex(
            (r) => Object.values(r).every((v) => !htmlToText(v || ""))
          );
          if (emptyIdx === -1) {
            const newRow = {};
            for (const c of sheet2.columns) newRow[c] = "";
            sheet2.rows.push(newRow);
            emptyIdx = sheet2.rows.length - 1;
          }
          sheet2.rows[emptyIdx][studentCol] = textToHtml(name);
          target = { si: defaultIdx, ri: emptyIdx };
          crossIndex.set(key2, target);
        }
        const sheet = updatedArSheets[target.si];
        const row = sheet.rows[target.ri];
        const studentDates = newStudentSessions[name] || [];
        for (const date of studentDates) {
          const monthInfo = monthColumnFor(date);
          if (monthInfo) {
            row[monthInfo.column] = appendDay(row[monthInfo.column] || "", monthInfo.day);
          }
        }
        const sessions = new Set(newStudentSessions[name] || []);
        for (const c of sheet.columns) {
          if (!/^[A-Za-z]+ \d{4}$/.test(c)) continue;
          const monthMatch = c.match(/^([A-Za-z]+) (\d{4})$/);
          if (!monthMatch) continue;
          const monthIdx = MONTH_LABELS.indexOf(monthMatch[1]);
          if (monthIdx < 0) continue;
          const year = monthMatch[2];
          const days = htmlToText(row[c] || "").split(/[,\s]+/).map((s) => s.trim()).filter((s) => /^\d+$/.test(s));
          for (const d of days) {
            const padDay = String(d).padStart(2, "0");
            const padMonth = String(monthIdx + 1).padStart(2, "0");
            sessions.add(`${year}-${padMonth}-${padDay}`);
          }
        }
        const attended = sessions.size;
        const current = htmlToText(row["NO. OF SESSION"] || "");
        const m = current.match(/^\d+\s*\/\s*(\d+)$/);
        const enrolled = m ? parseInt(m[1], 10) : 0;
        row["NO. OF SESSION"] = textToHtml(`${attended} / ${enrolled}`);
        console.log(`[SR Upload] AR updated for [${name}] on sheet [${sheet.name}]: ${attended} / ${enrolled}`);
        sheet.rows[target.ri] = row;
      }
      nextAr = {
        ...arWb,
        sheets: updatedArSheets.map((s) => ({ ...s, updatedAt: Date.now() })),
        studentSessions: newStudentSessions,
        studentUserMap: newStudentUserMap,
        updatedAt: Date.now()
      };
    }
    setWorkbooks((prev) => ({
      ...prev,
      sr: nextSr,
      ...nextAr ? { ar: nextAr } : {}
    }));
    if (newErrors.length > 0) setShowErrors(true);
    if (saveTimers.current.sr) {
      clearTimeout(saveTimers.current.sr);
      saveTimers.current.sr = null;
    }
    if (saveTimers.current.ar) {
      clearTimeout(saveTimers.current.ar);
      saveTimers.current.ar = null;
    }
    setSaveStatus("saving");
    try {
      const saves = [
        apiFetch("/api/arsr-sheets?section=sr", { method: "PUT", body: JSON.stringify(nextSr) })
      ];
      if (nextAr) {
        saves.push(apiFetch("/api/arsr-sheets?section=ar", { method: "PUT", body: JSON.stringify(nextAr) }));
      }
      const results = await Promise.all(saves);
      const allOk = results.every((r) => r.ok);
      setSaveStatus(allOk ? "saved" : "error");
      if (allOk) setTimeout(() => setSaveStatus("idle"), 1500);
    } catch {
      setSaveStatus("error");
    }
    console.log("[SR Upload] Server saves complete — notifying Manage Users to refresh");
    onUploadComplete?.();
    const summary = {
      total: params.stats.totalParsed,
      saved: savedCount,
      skipped: skipReasons.length,
      reasons: skipReasons
    };
    console.log(`[SR Upload] === Summary: ${summary.total} total, ${summary.saved} saved, ${summary.skipped} skipped ===`);
    return summary;
  }
  function resolveError(id) {
    if (!wb) return;
    updateWorkbook(section, (w) => ({
      ...w,
      errors: w.errors.map((e) => e.id === id ? { ...e, resolved: true } : e)
    }));
  }
  function clearResolvedErrors() {
    updateWorkbook(section, (w) => ({ ...w, errors: w.errors.filter((e) => !e.resolved) }));
  }
  if (loading) {
    return /* @__PURE__ */ jsx("div", { className: "p-6 text-sm text-gray-500", children: "Loading AR & SR…" });
  }
  if (!wb) {
    return /* @__PURE__ */ jsx("div", { className: "p-6 text-sm text-red-500", children: "Failed to load workbook." });
  }
  const errorCount = wb.errors.filter((e) => !e.resolved).length;
  return /* @__PURE__ */ jsxs("div", { className: "flex-1 min-h-0 flex flex-col", children: [
    /* @__PURE__ */ jsxs("div", { className: "bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between flex-none", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsx(
          "button",
          {
            onClick: () => switchSection("sr"),
            className: `text-sm font-semibold px-4 py-1.5 rounded-md border transition-colors ${section === "sr" ? "bg-[#A52A2A] text-white border-[#A52A2A]" : "bg-white text-gray-600 border-gray-200 hover:border-[#A52A2A] hover:text-[#A52A2A]"}`,
            children: "SR — Session Report"
          }
        ),
        /* @__PURE__ */ jsx(
          "button",
          {
            onClick: () => switchSection("ar"),
            className: `text-sm font-semibold px-4 py-1.5 rounded-md border transition-colors ${section === "ar" ? "bg-[#A52A2A] text-white border-[#A52A2A]" : "bg-white text-gray-600 border-gray-200 hover:border-[#A52A2A] hover:text-[#A52A2A]"}`,
            children: "AR — Attendance Report"
          }
        )
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3", children: [
        /* @__PURE__ */ jsx("span", { className: "text-xs text-gray-400", children: saveStatus === "saving" ? "Saving…" : saveStatus === "saved" ? "Saved" : saveStatus === "error" ? "Save failed" : "" }),
        /* @__PURE__ */ jsxs(
          "button",
          {
            type: "button",
            onClick: () => setShowErrors((v) => !v),
            className: `text-xs px-3 py-1.5 rounded border ${errorCount > 0 ? "bg-amber-50 border-amber-200 text-amber-700" : "bg-white border-gray-200 text-gray-500"}`,
            children: [
              "Errors (",
              errorCount,
              ")"
            ]
          }
        ),
        section === "ar" && /* @__PURE__ */ jsx(
          "button",
          {
            type: "button",
            onClick: refreshRoster,
            disabled: rosterStatus === "loading",
            title: "Re-fetch School Board / Parent Name from Google Sheets and retry pending enrichments",
            className: "text-xs px-3 py-1.5 rounded border bg-white border-gray-200 text-gray-600 hover:border-[#A52A2A] hover:text-[#A52A2A] disabled:opacity-50",
            children: rosterStatus === "loading" ? "Refreshing…" : rosterStatus === "error" ? "Refresh roster ⚠" : "Refresh roster"
          }
        ),
        /* @__PURE__ */ jsx(
          "button",
          {
            type: "button",
            onClick: () => setShowUpload(true),
            className: "text-xs px-3 py-1.5 rounded bg-[#A52A2A] text-white hover:bg-[#8b1f1f] uppercase tracking-wide",
            children: "Upload Zoom Excel"
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "flex-1 min-h-0 flex", children: [
      /* @__PURE__ */ jsx("div", { className: "flex-1 min-h-0 flex flex-col", children: /* @__PURE__ */ jsx(
        Spreadsheet,
        {
          sheets: wb.sheets,
          activeSheetId: wb.activeSheetId,
          onChange: handleSheetsChange,
          onAddSheet: addSheet,
          onRenameSheet: renameSheet,
          onDeleteSheet: deleteSheet,
          onSwitchSheet: switchSheet,
          lockedColumns: section === "sr",
          readOnlyColumns: section === "ar" ? AR_LOCKED_COLUMNS : []
        }
      ) }),
      showErrors && /* @__PURE__ */ jsxs("aside", { className: "w-80 border-l border-gray-200 bg-white flex flex-col flex-none", children: [
        /* @__PURE__ */ jsxs("div", { className: "border-b border-gray-200 px-4 py-2 flex items-center justify-between", children: [
          /* @__PURE__ */ jsx("h3", { className: "text-sm font-semibold text-gray-700", children: "Errors" }),
          /* @__PURE__ */ jsx(
            "button",
            {
              onClick: clearResolvedErrors,
              className: "text-[10px] text-gray-400 hover:text-[#A52A2A] uppercase",
              children: "Clear resolved"
            }
          )
        ] }),
        /* @__PURE__ */ jsx("div", { className: "flex-1 overflow-auto p-3 space-y-2", children: wb.errors.length === 0 ? /* @__PURE__ */ jsx("p", { className: "text-xs text-gray-400", children: "No errors." }) : wb.errors.map((e) => /* @__PURE__ */ jsx(
          "div",
          {
            className: `text-xs rounded border p-2 ${e.resolved ? "opacity-50 line-through bg-gray-50 border-gray-200" : e.type === "unmatched" ? "bg-amber-50 border-amber-200 text-amber-800" : e.type === "duplicate" ? "bg-blue-50 border-blue-200 text-blue-800" : "bg-red-50 border-red-200 text-red-800"}`,
            children: /* @__PURE__ */ jsxs("div", { className: "flex items-start justify-between gap-2", children: [
              /* @__PURE__ */ jsxs("div", { children: [
                /* @__PURE__ */ jsx("div", { className: "font-semibold uppercase text-[10px] tracking-wide", children: e.type }),
                /* @__PURE__ */ jsx("div", { children: e.message })
              ] }),
              !e.resolved && /* @__PURE__ */ jsx(
                "button",
                {
                  onClick: () => resolveError(e.id),
                  className: "text-[10px] text-gray-500 hover:text-[#A52A2A]",
                  title: "Mark resolved",
                  children: "✓"
                }
              )
            ] })
          },
          e.id
        )) })
      ] })
    ] }),
    /* @__PURE__ */ jsx(
      UploadModal,
      {
        open: showUpload,
        onClose: () => setShowUpload(false),
        onApply: applyZoomUpload,
        arSheet: activeSheetOf("ar"),
        users
      }
    )
  ] });
}
const Route$k = createFileRoute("/admin")({
  component: AdminDashboard
});
const ROLES = ["student", "mentor", "admin"];
const DOC_ICONS = {
  1: "🏆",
  2: "✍️",
  3: "🎤",
  4: "🌐",
  5: "📝"
};
function Wordmark() {
  return /* @__PURE__ */ jsx(
    "span",
    {
      className: "text-2xl font-bold text-[#A52A2A] tracking-tight",
      style: { fontFamily: '"Playfair Display", serif' },
      children: "LITWITS"
    }
  );
}
function TabBtn({
  active,
  onClick,
  children
}) {
  return /* @__PURE__ */ jsx(
    "button",
    {
      onClick,
      className: `px-5 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${active ? "border-[#A52A2A] text-[#A52A2A]" : "border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300"}`,
      children
    }
  );
}
function PersonCard({
  name,
  role,
  onClick
}) {
  const initials = name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
  return /* @__PURE__ */ jsxs(
    "button",
    {
      onClick,
      className: "group bg-white rounded-lg border border-gray-200 hover:border-[#A52A2A] hover:shadow-md transition-all p-5 text-left flex flex-col items-center gap-3",
      children: [
        /* @__PURE__ */ jsx("div", { className: "w-14 h-14 rounded-full bg-[#A52A2A]/10 text-[#A52A2A] flex items-center justify-center font-semibold text-lg group-hover:bg-[#A52A2A] group-hover:text-white transition-colors", children: initials || "?" }),
        /* @__PURE__ */ jsx("h3", { className: "text-sm font-semibold text-gray-800 text-center leading-tight", children: name }),
        role && /* @__PURE__ */ jsx("p", { className: "text-[10px] uppercase tracking-wide text-gray-400", children: role })
      ]
    }
  );
}
function DocCard({
  title,
  onClick,
  icon,
  onDelete
}) {
  return /* @__PURE__ */ jsxs("div", { className: "relative group", children: [
    /* @__PURE__ */ jsxs(
      "button",
      {
        onClick,
        className: "w-full bg-white rounded-lg border border-gray-200 hover:border-[#A52A2A] hover:shadow-md transition-all p-6 text-left flex flex-col gap-3 aspect-[4/3]",
        children: [
          /* @__PURE__ */ jsx("div", { className: "text-3xl text-gray-300 group-hover:text-[#A52A2A] transition-colors", children: icon ?? "📄" }),
          /* @__PURE__ */ jsx("div", { className: "flex-1 flex items-end", children: /* @__PURE__ */ jsx(
            "h3",
            {
              className: "text-base font-semibold text-gray-800 group-hover:text-[#A52A2A] transition-colors leading-tight",
              style: { fontFamily: '"Playfair Display", serif' },
              children: title
            }
          ) })
        ]
      }
    ),
    onDelete && /* @__PURE__ */ jsx(
      "button",
      {
        type: "button",
        onClick: (e) => {
          e.stopPropagation();
          onDelete();
        },
        title: "Delete document",
        "aria-label": "Delete document",
        className: "absolute top-2 right-2 w-8 h-8 rounded-md bg-white/90 border border-gray-200 text-gray-500 hover:text-red-600 hover:border-red-300 hover:bg-white opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity flex items-center justify-center text-base",
        children: "🗑"
      }
    )
  ] });
}
function SyncStatusPill({
  state,
  message
}) {
  if (state === "idle" || !message) return null;
  const tone = state === "error" ? "bg-red-50 text-red-700 border-red-200" : state === "saved" ? "bg-green-50 text-green-700 border-green-200" : "bg-amber-50 text-amber-700 border-amber-200";
  const dot = state === "error" ? "bg-red-500" : state === "saved" ? "bg-green-500" : "bg-amber-500 animate-pulse";
  return /* @__PURE__ */ jsxs(
    "span",
    {
      className: `inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded border ${tone}`,
      title: "Live sync status",
      children: [
        /* @__PURE__ */ jsx("span", { className: `inline-block w-1.5 h-1.5 rounded-full ${dot}` }),
        message
      ]
    }
  );
}
function ValidityBadge({
  status,
  daysUntilExpiry
}) {
  if (!status || status === "unset") return null;
  if (status === "ok") return null;
  const tone = status === "expired" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700";
  const text = status === "expired" ? "Expired" : daysUntilExpiry != null ? `Expiring · ${Math.max(0, daysUntilExpiry)}d` : "Expiring Soon";
  return /* @__PURE__ */ jsx("span", { className: `inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold ${tone}`, children: text });
}
function AdminDashboard() {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState(null);
  const [tab, setTab] = useState("students");
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const blankForm = {
    name: "",
    email: "",
    password: "",
    role: "student",
    phone: "",
    assignedLitwitsDocs: [],
    validityStart: "",
    validityEnd: "",
    packageSessions: "",
    sessionType: "Individual",
    packagePlan: "numeric"
  };
  const [form, setForm] = useState(blankForm);
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState("");
  const [bulkRows, setBulkRows] = useState([]);
  const [bulkStatus, setBulkStatus] = useState("");
  const [arBulkRows, setArBulkRows] = useState([]);
  const [arBulkStatus, setArBulkStatus] = useState("");
  const [arBulkErrors, setArBulkErrors] = useState([]);
  const [srBulkRows, setSrBulkRows] = useState([]);
  const [srBulkStatus, setSrBulkStatus] = useState("");
  const [srBulkErrors, setSrBulkErrors] = useState([]);
  const [studentsView, setStudentsView] = useState("grid");
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [studentDocs, setStudentDocs] = useState([]);
  const [selectedStudentDocId, setSelectedStudentDocId] = useState(null);
  const [docsLoading, setDocsLoading] = useState(false);
  const [editingCell, setEditingCell] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [savingUser, setSavingUser] = useState(null);
  const [syncState, setSyncState] = useState("idle");
  const [syncStateMessage, setSyncStateMessage] = useState("");
  const [filterMentor, setFilterMentor] = useState("");
  const [filterSessionType, setFilterSessionType] = useState("");
  const [filterExpiringOnly, setFilterExpiringOnly] = useState(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem("litwits-admin-user-filters");
      if (raw) {
        const f = JSON.parse(raw);
        if (typeof f?.mentor === "string") setFilterMentor(f.mentor);
        if (typeof f?.sessionType === "string") setFilterSessionType(f.sessionType);
        if (typeof f?.expiringOnly === "boolean") setFilterExpiringOnly(f.expiringOnly);
      }
    } catch {
    }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(
        "litwits-admin-user-filters",
        JSON.stringify({
          mentor: filterMentor,
          sessionType: filterSessionType,
          expiringOnly: filterExpiringOnly
        })
      );
    } catch {
    }
  }, [filterMentor, filterSessionType, filterExpiringOnly]);
  const [mentorDropdownOpen, setMentorDropdownOpen] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState("");
  const [litwitsDocs, setLitwitsDocs] = useState([]);
  const [litwitsLoading, setLitwitsLoading] = useState(false);
  const [litwitsView, setLitwitsView] = useState("grid");
  const [selectedLitwitsDocId, setSelectedLitwitsDocId] = useState(null);
  const [litwitsDocDropdownOpen, setLitwitsDocDropdownOpen] = useState(null);
  const [activityLogs, setActivityLogs] = useState([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityFilterUser, setActivityFilterUser] = useState("");
  const [activityFilterDoc, setActivityFilterDoc] = useState("");
  const [activityFilterDate, setActivityFilterDate] = useState("");
  const [versions, setVersions] = useState([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [versionDocId, setVersionDocId] = useState("");
  const [versionContent, setVersionContent] = useState(null);
  const [versionViewTimestamp, setVersionViewTimestamp] = useState(null);
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadDocType, setUploadDocType] = useState("");
  const [uploadStatus, setUploadStatus] = useState("");
  const [uploadParsing, setUploadParsing] = useState(false);
  const [mentorsList, setMentorsList] = useState([]);
  const [mentorsListLoading, setMentorsListLoading] = useState(false);
  const [mentorDocsView, setMentorDocsView] = useState("grid");
  const [selectedMentor, setSelectedMentor] = useState(null);
  const [mentorDocs, setMentorDocs] = useState([]);
  const [mentorDocsLoading, setMentorDocsLoading] = useState(false);
  const [selectedMentorDocId, setSelectedMentorDocId] = useState(null);
  const [uploadPreview, setUploadPreview] = useState("");
  useEffect(() => {
    const u = getUser();
    if (!u || u.role !== "admin") {
      navigate({ to: "/login" });
      return;
    }
    setCurrentUser(u);
    fetchUsers();
    fetchLitwitsDocs();
    fetchMentorsList();
  }, []);
  useEffect(() => {
    if (tab !== "litwits-docs" || litwitsView !== "grid") return;
    const interval = setInterval(() => {
      fetchLitwitsDocs();
    }, 6e3);
    return () => clearInterval(interval);
  }, [tab, litwitsView]);
  useEffect(() => {
    if (tab !== "users" && tab !== "renewals") return;
    const interval = setInterval(() => {
      if (editingCell) return;
      if (savingUser) return;
      fetchUsers({ silent: true });
    }, 8e3);
    return () => clearInterval(interval);
  }, [tab, editingCell, savingUser]);
  useEffect(() => {
    if (syncState !== "saved") return;
    const id = setTimeout(() => {
      setSyncState("idle");
      setSyncStateMessage("");
    }, 1800);
    return () => clearTimeout(id);
  }, [syncState]);
  useEffect(() => {
    try {
      const raw = localStorage.getItem("litwits-admin-create-draft");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          setForm((prev) => ({ ...prev, ...parsed }));
        }
      }
    } catch {
    }
  }, []);
  useEffect(() => {
    if (tab !== "create") return;
    try {
      localStorage.setItem("litwits-admin-create-draft", JSON.stringify(form));
    } catch {
    }
  }, [tab, form]);
  useEffect(() => {
    function onBeforeUnload(e) {
      const hasDraft = form.name || form.email || form.password;
      if (editingCell || hasDraft) {
        e.preventDefault();
        e.returnValue = "";
      }
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [editingCell, form]);
  function safeSetTab(next) {
    if (editingCell) {
      const u = users.find((x) => x.email === editingCell.email);
      if (u && editingCell.field === "attendedSessions") {
        const desired = parseInt(editValue || "0", 10) || 0;
        if (desired !== (u.attendedSessions ?? 0)) {
          saveAttendedEdit(u, editValue);
        } else {
          setEditingCell(null);
        }
      } else if (u && editValue !== u[editingCell.field]) {
        saveInlineEdit(editingCell.email, editingCell.field, editValue);
      } else {
        setEditingCell(null);
      }
    }
    setTab(next);
  }
  async function fetchUsers(opts) {
    if (!opts?.silent) setLoading(true);
    setSyncState("syncing");
    setSyncStateMessage("Syncing…");
    try {
      const res = await apiFetch("/api/users");
      const data = await res.json();
      const normalized = (data.users || []).map(normalizeUser);
      setUsers(normalized);
      setSyncState("idle");
      setSyncStateMessage("");
    } catch {
      setError("Failed to load users");
      setSyncState("error");
      setSyncStateMessage("Sync failed");
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }
  function normalizeUser(u) {
    return {
      ...u,
      name: String(u.name || "").replace(/\s+/g, " ").trim(),
      assignedMentors: Array.isArray(u.assignedMentors) ? u.assignedMentors : u.mentorEmail ? [u.mentorEmail] : [],
      assignedLitwitsDocs: Array.isArray(u.assignedLitwitsDocs) ? u.assignedLitwitsDocs : [],
      validityStart: u.validityStart || "",
      validityEnd: u.validityEnd || "",
      status: u.status || "active",
      packageSessions: typeof u.packageSessions === "number" ? u.packageSessions : parseInt(String(u.packageSessions || ""), 10) || 0,
      sessionType: u.sessionType || "",
      packagePlan: u.packagePlan === "signature" || u.packagePlan === "platinum" ? u.packagePlan : "numeric",
      attendedSessions: typeof u.attendedSessions === "number" ? u.attendedSessions : 0,
      srCount: typeof u.srCount === "number" ? u.srCount : 0,
      manualAdjustment: typeof u.manualAdjustment === "number" ? u.manualAdjustment : 0,
      validityStatus: u.validityStatus || "unset",
      daysUntilExpiry: typeof u.daysUntilExpiry === "number" ? u.daysUntilExpiry : null,
      needsRenewal: Boolean(u.needsRenewal),
      lastModified: typeof u.lastModified === "number" ? u.lastModified : 0
    };
  }
  function todayISO2() {
    const d = /* @__PURE__ */ new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  function addDaysISO2(iso, days) {
    const [y, m, d] = iso.split("-").map((s) => parseInt(s, 10));
    if (!y || !m || !d) return "";
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + days);
    const yy = dt.getFullYear();
    const mm = String(dt.getMonth() + 1).padStart(2, "0");
    const dd = String(dt.getDate()).padStart(2, "0");
    return `${yy}-${mm}-${dd}`;
  }
  function addMonthsISO2(iso, months) {
    const [y, m, d] = iso.split("-").map((s) => parseInt(s, 10));
    if (!y || !m || !d) return "";
    const dt = new Date(y, m - 1, d);
    dt.setMonth(dt.getMonth() + months);
    const yy = dt.getFullYear();
    const mm = String(dt.getMonth() + 1).padStart(2, "0");
    const dd = String(dt.getDate()).padStart(2, "0");
    return `${yy}-${mm}-${dd}`;
  }
  function computeValidityEnd2(start, plan, sessions) {
    if (!start) return "";
    if (plan === "signature") return addMonthsISO2(start, 6);
    if (plan === "platinum") return addMonthsISO2(start, 12);
    const n = Math.max(0, Math.floor(sessions || 0));
    if (n <= 0) return "";
    return addDaysISO2(start, n * 7);
  }
  async function handleCreate(e) {
    e.preventDefault();
    setFormError("");
    setFormSuccess("");
    setSyncState("saving");
    setSyncStateMessage("Saving…");
    try {
      const sessions = parseInt(form.packageSessions || "0", 10) || 0;
      const start = form.role === "student" ? form.validityStart || todayISO2() : form.validityStart;
      const end = form.role === "student" && !form.validityEnd ? computeValidityEnd2(start, form.packagePlan, sessions) : form.validityEnd;
      const res = await apiFetch("/api/users", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          name: form.name.replace(/\s+/g, " ").trim(),
          assignedLitwitsDocs: form.assignedLitwitsDocs,
          validityStart: start,
          validityEnd: end,
          packageSessions: sessions,
          sessionType: form.sessionType,
          packagePlan: form.packagePlan
        })
      });
      const data = await res.json();
      if (!res.ok) {
        setFormError(data.error || "Failed to create user");
        setSyncState("error");
        setSyncStateMessage("Save failed");
        return;
      }
      setFormSuccess(`User ${form.name} created successfully`);
      setForm(blankForm);
      try {
        localStorage.removeItem("litwits-admin-create-draft");
      } catch {
      }
      if (data.user) {
        const created = normalizeUser(data.user);
        setUsers((prev) => {
          const without = prev.filter((u) => u.email !== created.email);
          return [...without, created];
        });
      }
      setSyncState("saved");
      setSyncStateMessage("Saved");
      await fetchUsers({ silent: true });
    } catch {
      setFormError("Server error");
      setSyncState("error");
      setSyncStateMessage("Save failed");
    }
  }
  async function handleReAdd(u) {
    const baseEnd = u.validityEnd && /^\d{4}-\d{2}-\d{2}$/.test(u.validityEnd) ? u.validityEnd : todayISO2();
    const today = todayISO2();
    const nextStart = baseEnd > today ? addDaysISO2(baseEnd, 1) : today;
    const plan = u.packagePlan || "numeric";
    const sessions = u.packageSessions || 0;
    const nextEnd = computeValidityEnd2(nextStart, plan, sessions);
    if (!confirm(`Re-add ${u.name} with a new package starting ${nextStart}?`)) return;
    setSavingUser(u.email);
    setSyncState("saving");
    setSyncStateMessage("Saving…");
    try {
      const res = await apiFetchRetry("/api/users", {
        method: "PUT",
        body: JSON.stringify({
          email: u.email,
          validityStart: nextStart,
          validityEnd: nextEnd,
          status: "active",
          expectedLastModified: u.lastModified || 0
        })
      });
      if (!res.ok) {
        setSyncState("error");
        setSyncStateMessage("Save failed");
        alert("Failed to start a new set");
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (data?.user) {
        const normalized = normalizeUser(data.user);
        setUsers((prev) => prev.map((x) => x.email === u.email ? normalized : x));
      }
      setSyncState("saved");
      setSyncStateMessage("Saved");
    } catch {
      setSyncState("error");
      setSyncStateMessage("Save failed");
    } finally {
      setSavingUser(null);
    }
  }
  async function handleDelete(email) {
    if (!confirm(`Delete user ${email}?`)) return;
    const previous = users;
    setUsers((prev) => prev.filter((u) => u.email !== email));
    try {
      const res = await apiFetch(`/api/users?email=${encodeURIComponent(email)}`, { method: "DELETE" });
      if (!res.ok) {
        setUsers(previous);
        alert("Failed to delete user");
      }
    } catch {
      setUsers(previous);
      alert("Failed to delete user");
    }
  }
  function startEdit(email, field, currentValue) {
    setEditingCell({ email, field });
    setEditValue(currentValue);
  }
  async function saveInlineEdit(email, field, value) {
    setSavingUser(email);
    setSyncState("saving");
    setSyncStateMessage("Saving…");
    const previous = users;
    const target = users.find((u) => u.email === email);
    const expectedLastModified = target?.lastModified || 0;
    const normalisedValue = field === "name" ? String(value).replace(/\s+/g, " ").trim() : value;
    setUsers((prev) => prev.map((u) => u.email === email ? { ...u, [field]: normalisedValue } : u));
    setEditingCell(null);
    setEditValue("");
    try {
      const res = await apiFetch("/api/users", {
        method: "PUT",
        body: JSON.stringify({ email, [field]: normalisedValue, expectedLastModified })
      });
      if (!res.ok) {
        setUsers(previous);
        setSyncState("error");
        setSyncStateMessage(res.status === 409 ? "Conflict — refresh to see latest" : "Save failed");
        if (res.status === 409) await fetchUsers({ silent: true });
        else alert("Failed to save changes");
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (data?.user) {
        const normalized = normalizeUser(data.user);
        setUsers((prev) => prev.map((u) => u.email === email ? normalized : u));
      }
      setSyncState("saved");
      setSyncStateMessage("Saved");
    } catch {
      setUsers(previous);
      setSyncState("error");
      setSyncStateMessage("Save failed");
      alert("Failed to save changes");
    } finally {
      setSavingUser(null);
    }
  }
  async function saveAttendedEdit(u, raw) {
    const desired = Math.max(0, Math.floor(parseInt(raw || "0", 10) || 0));
    const enrolled = u.packageSessions ?? 0;
    const plan = u.packagePlan || "numeric";
    if (plan === "numeric" && enrolled > 0 && desired > enrolled) {
      alert(`Attended (${desired}) cannot exceed Enrolled (${enrolled}).`);
      return;
    }
    if (desired < 0) {
      alert("Attended cannot be negative.");
      return;
    }
    setSavingUser(u.email);
    setSyncState("saving");
    setSyncStateMessage("Saving…");
    const previous = users;
    setUsers(
      (prev) => prev.map(
        (x) => x.email === u.email ? {
          ...x,
          attendedSessions: desired,
          manualAdjustment: desired - (x.srCount ?? 0)
        } : x
      )
    );
    setEditingCell(null);
    setEditValue("");
    try {
      const res = await apiFetchRetry("/api/users", {
        method: "PUT",
        body: JSON.stringify({
          email: u.email,
          attendedSessions: desired,
          expectedLastModified: u.lastModified || 0
        })
      });
      if (!res.ok) {
        const data2 = await res.json().catch(() => ({}));
        setUsers(previous);
        setSyncState("error");
        setSyncStateMessage(data2?.error || "Save failed");
        if (res.status === 409) await fetchUsers({ silent: true });
        else alert(data2?.error || "Failed to save Attended Sessions");
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (data?.user) {
        const normalized = normalizeUser(data.user);
        setUsers(
          (prev) => prev.map((x) => x.email === u.email ? normalized : x)
        );
      }
      setSyncState("saved");
      setSyncStateMessage("Saved");
    } catch {
      setUsers(previous);
      setSyncState("error");
      setSyncStateMessage("Save failed");
      alert("Failed to save Attended Sessions");
    } finally {
      setSavingUser(null);
    }
  }
  async function toggleMentor(studentEmail, mentorEmail, currentMentors) {
    const updated = currentMentors.includes(mentorEmail) ? currentMentors.filter((m) => m !== mentorEmail) : [...currentMentors, mentorEmail];
    const previous = users;
    setUsers((prev) => prev.map((u) => u.email === studentEmail ? { ...u, assignedMentors: updated } : u));
    setSavingUser(studentEmail);
    try {
      const res = await apiFetch("/api/users", {
        method: "PUT",
        body: JSON.stringify({ email: studentEmail, assignedMentors: updated })
      });
      if (!res.ok) {
        setUsers(previous);
        alert("Failed to update mentors");
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (data?.user) {
        const normalized = normalizeUser(data.user);
        setUsers((prev) => prev.map((u) => u.email === studentEmail ? normalized : u));
      }
    } catch {
      setUsers(previous);
      alert("Failed to update mentors");
    } finally {
      setSavingUser(null);
    }
  }
  function handleBulkFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const data = new Uint8Array(ev.target?.result);
      const wb = XLSX.read(data, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet);
      setBulkRows(rows);
      setBulkStatus(`Parsed ${rows.length} rows. Review and click Import.`);
    };
    reader.readAsArrayBuffer(file);
  }
  async function handleBulkImport() {
    setBulkStatus("Importing…");
    let success = 0;
    let fail = 0;
    for (const row of bulkRows) {
      try {
        const pick = (...keys) => {
          for (const k of keys) {
            if (row[k] !== void 0 && row[k] !== null && String(row[k]).length > 0) return row[k];
          }
          return "";
        };
        const toList = (v) => {
          if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
          return String(v ?? "").split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean);
        };
        const toDate = (v) => {
          if (v === void 0 || v === null || v === "") return "";
          if (typeof v === "number") {
            const parsed = XLSX.SSF?.parse_date_code?.(v);
            if (parsed) {
              const y = String(parsed.y).padStart(4, "0");
              const m = String(parsed.m).padStart(2, "0");
              const d = String(parsed.d).padStart(2, "0");
              return `${y}-${m}-${d}`;
            }
          }
          return String(v).trim();
        };
        const mentorList = toList(
          pick("assignedMentors", "AssignedMentors", "assigned_mentors", "Assigned Mentors", "mentors", "Mentors")
        );
        const docsList = toList(
          pick(
            "documentsShared",
            "DocumentsShared",
            "documents_shared",
            "Documents Shared",
            "documents",
            "Documents",
            "assignedLitwitsDocs"
          )
        );
        const packageSessionsValue = parseInt(
          pick(
            "packageSessions",
            "PackageSessions",
            "package_sessions",
            "Package of Sessions",
            "sessions",
            "Sessions"
          ) || "0",
          10
        ) || 0;
        const packageRaw = String(
          pick("packagePlan", "PackagePlan", "package_plan", "Package", "Plan") || ""
        ).trim().toLowerCase();
        let packagePlanValue = "numeric";
        let resolvedSessions = packageSessionsValue;
        if (packageRaw === "signature") packagePlanValue = "signature";
        else if (packageRaw === "platinum") packagePlanValue = "platinum";
        else if (packageRaw && /^\d+$/.test(packageRaw)) {
          if (!resolvedSessions) resolvedSessions = parseInt(packageRaw, 10);
        }
        const startRaw = toDate(
          pick("validityStart", "ValidityStart", "Validity Start", "validity_start")
        );
        const endRaw = toDate(
          pick("validityEnd", "ValidityEnd", "Validity End", "validity_end")
        );
        const startResolved = startRaw || todayISO2();
        const endResolved = endRaw || computeValidityEnd2(startResolved, packagePlanValue, resolvedSessions);
        const payload = {
          name: String(pick("name", "Name") || "").replace(/\s+/g, " ").trim(),
          email: pick("email", "Email"),
          password: pick("password", "Password"),
          role: pick("role", "Role") || "student",
          phone: pick("phone", "Phone"),
          validityStart: startResolved,
          validityEnd: endResolved,
          status: pick("status", "Status") || "active",
          packageSessions: resolvedSessions,
          packagePlan: packagePlanValue,
          sessionType: pick(
            "sessionType",
            "SessionType",
            "session_type",
            "Session Type",
            "Type"
          )
        };
        if (mentorList.length > 0) payload.assignedMentors = mentorList;
        if (docsList.length > 0) payload.assignedLitwitsDocs = docsList;
        const res = await apiFetch("/api/users", {
          method: "POST",
          body: JSON.stringify(payload)
        });
        if (res.ok) success++;
        else fail++;
      } catch {
        fail++;
      }
    }
    setBulkStatus(`Done: ${success} imported, ${fail} failed.`);
    setBulkRows([]);
    await fetchUsers();
  }
  function handleArBulkFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const data = new Uint8Array(ev.target?.result);
      const wb = XLSX.read(data, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet);
      setArBulkRows(rows);
      setArBulkStatus(`Parsed ${rows.length} rows. Review and click Import.`);
      setArBulkErrors([]);
    };
    reader.readAsArrayBuffer(file);
  }
  async function handleArBulkImport() {
    setArBulkStatus("Importing…");
    const errors = [];
    let success = 0;
    for (const row of arBulkRows) {
      const pick = (...keys) => {
        for (const k of keys) {
          if (row[k] !== void 0 && row[k] !== null && String(row[k]).length > 0) return row[k];
        }
        return "";
      };
      const name = String(pick("Name", "name") || "").replace(/\s+/g, " ").trim();
      const email = String(pick("Email", "email") || "").trim().toLowerCase();
      if (!name || !email) {
        errors.push({
          name: name || "(unnamed)",
          issue: "Missing Name or Email",
          action: "Skipped"
        });
        continue;
      }
      const enrolled = Math.max(
        0,
        parseInt(String(pick("Enrolled Sessions", "EnrolledSessions", "enrolledSessions") || "0"), 10) || 0
      );
      const attended = Math.max(
        0,
        parseInt(String(pick("Attended Sessions", "AttendedSessions", "attendedSessions") || "0"), 10) || 0
      );
      const sessionType = String(pick("Session Type", "SessionType", "sessionType") || "Individual").trim();
      const schoolBoard = String(pick("School Board", "SchoolBoard", "schoolBoard") || "").trim();
      const parentName = String(pick("Parent Name", "ParentName", "parentName") || "").trim();
      const gmbReview = String(pick("GMB Review", "GMBReview", "gmbReview") || "").trim();
      const remarks = String(pick("Remarks", "remarks") || "").trim();
      try {
        const existing = users.find((u) => u.email.toLowerCase() === email);
        if (existing) {
          const plan = existing.packagePlan || "numeric";
          if (plan === "numeric" && enrolled > 0 && attended > enrolled) {
            errors.push({
              name,
              issue: `Attended (${attended}) exceeds Enrolled (${enrolled})`,
              action: "Skipped"
            });
            continue;
          }
          await apiFetch("/api/users", {
            method: "PUT",
            body: JSON.stringify({
              email: existing.email,
              packageSessions: enrolled,
              sessionType
            })
          });
          const r = await apiFetch("/api/users", {
            method: "PUT",
            body: JSON.stringify({
              email: existing.email,
              attendedSessions: attended
            })
          });
          if (!r.ok) {
            const data = await r.json().catch(() => ({}));
            errors.push({
              name,
              issue: data?.error || "Server error",
              action: "Skipped"
            });
            continue;
          }
        } else {
          if (enrolled > 0 && attended > enrolled) {
            errors.push({
              name,
              issue: `Attended (${attended}) exceeds Enrolled (${enrolled})`,
              action: "Skipped"
            });
            continue;
          }
          const tempPassword = Math.random().toString(36).slice(2, 6) + Math.random().toString(36).slice(2, 6).toUpperCase();
          const create = await apiFetch("/api/users", {
            method: "POST",
            body: JSON.stringify({
              name,
              email,
              password: tempPassword,
              role: "student",
              packageSessions: enrolled,
              sessionType,
              packagePlan: "numeric"
            })
          });
          if (!create.ok) {
            const data = await create.json().catch(() => ({}));
            errors.push({
              name,
              issue: data?.error || "Failed to create user",
              action: "Skipped"
            });
            continue;
          }
          if (attended > 0) {
            await apiFetch("/api/users", {
              method: "PUT",
              body: JSON.stringify({ email, attendedSessions: attended })
            });
          }
        }
        await apiFetch("/api/ar-enrich", {
          method: "POST",
          body: JSON.stringify({ email, name, sessionType, packageSessions: enrolled })
        });
        if (schoolBoard || parentName || gmbReview || remarks) {
          await patchArRowFields({
            email,
            name,
            schoolBoard,
            parentName,
            gmbReview,
            remarks
          });
        }
        success++;
      } catch (err) {
        errors.push({ name, issue: "Server error", action: "Skipped" });
      }
    }
    setArBulkStatus(`Done: ${success} processed, ${errors.length} errors.`);
    setArBulkErrors(errors);
    setArBulkRows([]);
    await fetchUsers();
  }
  async function patchArRowFields(p) {
    try {
      const r = await apiFetch("/api/arsr-sheets?section=ar");
      if (!r.ok) return;
      const data = await r.json();
      const wb = data.workbook;
      if (!wb || !Array.isArray(wb.sheets)) return;
      const target = p.email.toLowerCase();
      const targetName = p.name.toLowerCase().replace(/\s+/g, " ").replace(/[^a-z0-9 ]/g, "").trim();
      const stripHtml = (s) => String(s || "").replace(/<[^>]+>/g, "").trim();
      const wrap = (s) => `<p>${s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>`;
      let mutated = false;
      for (const sh of wb.sheets) {
        for (let i = 0; i < sh.rows.length; i++) {
          const row = sh.rows[i];
          const e = stripHtml(row["Email"] || "").toLowerCase();
          const n = stripHtml(row["Name"] || "").toLowerCase().replace(/\s+/g, " ").replace(/[^a-z0-9 ]/g, "").trim();
          if (target && e === target || !e && n === targetName) {
            const next = { ...row };
            if (p.schoolBoard) next["School Board"] = wrap(p.schoolBoard);
            if (p.parentName) next["Parent Name"] = wrap(p.parentName);
            if (p.gmbReview) next["GMB Review"] = wrap(p.gmbReview);
            if (p.remarks) next["Remarks"] = wrap(p.remarks);
            sh.rows[i] = next;
            mutated = true;
            break;
          }
        }
      }
      if (mutated) {
        await apiFetch("/api/arsr-sheets?section=ar", {
          method: "PUT",
          body: JSON.stringify(wb)
        });
      }
    } catch {
    }
  }
  function handleSrBulkFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const data = new Uint8Array(ev.target?.result);
      const wb = XLSX.read(data, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet);
      setSrBulkRows(rows);
      setSrBulkStatus(`Parsed ${rows.length} rows. Review and click Import.`);
      setSrBulkErrors([]);
    };
    reader.readAsArrayBuffer(file);
  }
  async function handleSrBulkImport() {
    setSrBulkStatus("Importing…");
    const errors = [];
    const usersByName = /* @__PURE__ */ new Map();
    for (const u of users) {
      if (u.role !== "student") continue;
      const k = u.name.toLowerCase().replace(/\s+/g, " ").replace(/[^a-z0-9 ]/g, "").trim();
      if (k) usersByName.set(k, u);
    }
    const seen = /* @__PURE__ */ new Set();
    const toAdd = [];
    for (const row of srBulkRows) {
      const pick = (...keys) => {
        for (const k of keys) {
          if (row[k] !== void 0 && row[k] !== null && String(row[k]).length > 0) return row[k];
        }
        return "";
      };
      const studentRaw = String(pick("Student Name", "StudentName", "Student", "Name") || "").trim();
      if (!studentRaw) {
        errors.push({ name: "(unknown)", issue: "Missing Student Name", action: "Skipped" });
        continue;
      }
      let dateRaw = pick("Date", "date");
      let dateISO = "";
      if (typeof dateRaw === "number") {
        const parsed = XLSX.SSF?.parse_date_code?.(dateRaw);
        if (parsed) {
          const y = String(parsed.y).padStart(4, "0");
          const m = String(parsed.m).padStart(2, "0");
          const d = String(parsed.d).padStart(2, "0");
          dateISO = `${y}-${m}-${d}`;
        }
      } else if (typeof dateRaw === "string") {
        const m = dateRaw.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (m) dateISO = `${m[1]}-${m[2]}-${m[3]}`;
        else {
          const t = Date.parse(dateRaw);
          if (Number.isFinite(t)) {
            const dt = new Date(t);
            dateISO = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
          }
        }
      }
      if (!dateISO) {
        errors.push({ name: studentRaw, issue: "Invalid Date", action: "Skipped" });
        continue;
      }
      const durRaw = pick("Duration", "duration", "Duration (minutes)");
      let durationMinutes = 0;
      if (typeof durRaw === "number") durationMinutes = durRaw;
      else if (typeof durRaw === "string") {
        const m = durRaw.match(/(\d+)/);
        if (m) durationMinutes = parseInt(m[1], 10);
      }
      if (durationMinutes < 5) {
        errors.push({
          name: studentRaw,
          issue: `Duration ${durationMinutes}m < 5m`,
          action: "Skipped"
        });
        continue;
      }
      const norm = studentRaw.toLowerCase().replace(/\s+/g, " ").replace(/[^a-z0-9 ]/g, "").trim();
      const dedupeKey = `${norm}|${dateISO}`;
      if (seen.has(dedupeKey)) {
        errors.push({
          name: studentRaw,
          issue: `Duplicate (same date)`,
          action: "Skipped"
        });
        continue;
      }
      seen.add(dedupeKey);
      const matched = usersByName.get(norm);
      const finalName = matched ? matched.name : `${studentRaw} (Discovery Student)`;
      if (!matched) {
        errors.push({
          name: studentRaw,
          issue: "Not found in Manage Users",
          action: "Added as Discovery Student"
        });
      }
      toAdd.push({ name: finalName, date: dateISO });
    }
    if (toAdd.length === 0) {
      setSrBulkStatus(`Done: 0 sessions added, ${errors.length} errors.`);
      setSrBulkErrors(errors);
      setSrBulkRows([]);
      return;
    }
    try {
      const r = await apiFetch("/api/arsr-sheets?section=ar");
      const data = await r.json();
      const wb = data.workbook || { studentSessions: {} };
      const sessions = { ...wb.studentSessions || {} };
      let added = 0;
      for (const e of toAdd) {
        const list = sessions[e.name] || [];
        if (!list.includes(e.date)) {
          sessions[e.name] = [...list, e.date];
          added++;
        }
      }
      const put = await apiFetch("/api/arsr-sheets?section=ar", {
        method: "PUT",
        body: JSON.stringify({ ...wb, studentSessions: sessions })
      });
      if (!put.ok) {
        setSrBulkStatus(`Error saving SR data.`);
        return;
      }
      setSrBulkStatus(`Done: ${added} sessions added, ${errors.length} errors.`);
      setSrBulkErrors(errors);
      setSrBulkRows([]);
      await fetchUsers();
    } catch {
      setSrBulkStatus("Server error during import.");
    }
  }
  async function loadStudentDocs(student) {
    setSelectedStudent(student);
    setSelectedStudentDocId(null);
    setStudentsView("studentDocs");
    setDocsLoading(true);
    try {
      const res = await apiFetch(`/api/documents?email=${encodeURIComponent(student.email)}`);
      const data = await res.json();
      setStudentDocs(data.documents || []);
    } catch {
      setStudentDocs([]);
    } finally {
      setDocsLoading(false);
    }
  }
  const mentors = users.filter((u) => u.role === "mentor");
  const students = users.filter((u) => u.role === "student");
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      if (filterMentor) {
        if (u.role !== "student") return false;
        if (!u.assignedMentors.includes(filterMentor)) return false;
      }
      if (filterSessionType) {
        if (u.role !== "student") return false;
        if ((u.sessionType || "") !== filterSessionType) return false;
      }
      if (filterExpiringOnly) {
        if (u.role !== "student") return false;
        if (u.validityStatus !== "expiring" && u.validityStatus !== "expired") return false;
      }
      return true;
    });
  }, [users, filterMentor, filterSessionType, filterExpiringOnly]);
  const renewalUsers = useMemo(
    () => users.filter((u) => u.role === "student" && u.needsRenewal),
    [users]
  );
  async function handleSyncAssignments() {
    if (!confirm("This will assign ALL mentors to ALL students. Continue?")) return;
    setSyncing(true);
    setSyncResult("");
    try {
      const res = await apiFetch("/api/sync-assignments", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setSyncResult(
          `Sync complete: ${data.studentsUpdated} of ${data.totalStudents} students updated (${data.totalMentors} mentors).`
        );
        fetchUsers();
      } else {
        setSyncResult(`Error: ${data.error || "Failed to sync"}`);
      }
    } catch {
      setSyncResult("Server error during sync");
    } finally {
      setSyncing(false);
    }
  }
  async function handleLogout() {
    await apiFetch("/api/auth", { method: "DELETE" });
    clearAuth();
    navigate({ to: "/login" });
  }
  async function fetchLitwitsDocs() {
    setLitwitsLoading(true);
    try {
      const res = await apiFetch("/api/litwits-docs");
      const data = await res.json();
      setLitwitsDocs(data.documents || []);
    } catch {
      setLitwitsDocs([]);
    } finally {
      setLitwitsLoading(false);
    }
  }
  async function fetchMentorsList() {
    setMentorsListLoading(true);
    try {
      const res = await apiFetch("/api/mentor-documents?listMentors=1");
      const data = await res.json();
      setMentorsList(data.mentors || []);
    } catch {
      setMentorsList([]);
    } finally {
      setMentorsListLoading(false);
    }
  }
  async function loadMentorDocs(mentor) {
    setSelectedMentor(mentor);
    setSelectedMentorDocId(null);
    setMentorDocsView("mentorDocs");
    setMentorDocsLoading(true);
    try {
      const res = await apiFetch(`/api/mentor-documents?email=${encodeURIComponent(mentor.email)}`);
      const data = await res.json();
      setMentorDocs(data.documents || []);
    } catch {
      setMentorDocs([]);
    } finally {
      setMentorDocsLoading(false);
    }
  }
  async function initAllLitwitsDocs() {
    const defaultDocs = [
      { id: "wsc-curriculum", title: "WSC Curriculum", category: "WSC Documents" },
      { id: "wsc-writing-prompts", title: "WSC Writing Prompts", category: "WSC Documents" },
      { id: "wsc-debating-motions", title: "WSC Debating Motions", category: "WSC Documents" },
      { id: "wsc-quiz", title: "WSC Quiz", category: "WSC Documents" },
      { id: "writing-competition", title: "Writing Competition", category: "Other Documents" },
      { id: "debating-competition", title: "Debating Competition", category: "Other Documents" },
      { id: "mun-events", title: "MUN Events", category: "Other Documents" },
      { id: "fundamentals-of-debating", title: "Fundamentals of Debating", category: "Other Documents" }
    ];
    for (const doc of defaultDocs) {
      await apiFetch("/api/litwits-docs", {
        method: "POST",
        body: JSON.stringify(doc)
      });
    }
    fetchLitwitsDocs();
  }
  async function createLitwitsDoc(category) {
    const id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const initialTabs = [{ id: "main", title: "Main", content: "" }];
    const optimistic = {
      id,
      title: "Untitled Document",
      category,
      content: "",
      tabs: initialTabs,
      activeTabId: "main"
    };
    setLitwitsDocs((prev) => [...prev, optimistic]);
    setSelectedLitwitsDocId(id);
    setLitwitsView("editor");
    try {
      const res = await apiFetch("/api/litwits-docs", {
        method: "POST",
        body: JSON.stringify({
          docId: id,
          title: optimistic.title,
          category,
          content: "",
          tabs: initialTabs,
          activeTabId: "main"
        })
      });
      if (!res.ok) {
        setLitwitsDocs((prev) => prev.filter((d) => d.id !== id));
        if (selectedLitwitsDocId === id) {
          setSelectedLitwitsDocId(null);
          setLitwitsView("grid");
        }
        alert("Failed to create document");
      }
    } catch {
      setLitwitsDocs((prev) => prev.filter((d) => d.id !== id));
      if (selectedLitwitsDocId === id) {
        setSelectedLitwitsDocId(null);
        setLitwitsView("grid");
      }
      alert("Failed to create document");
    }
  }
  async function deleteLitwitsDoc(doc) {
    if (!confirm(`Delete "${doc.title}"? This cannot be undone.`)) return;
    const previous = litwitsDocs;
    setLitwitsDocs((prev) => prev.filter((d) => d.id !== doc.id));
    if (selectedLitwitsDocId === doc.id) {
      setSelectedLitwitsDocId(null);
      setLitwitsView("grid");
    }
    try {
      const res = await apiFetch(
        `/api/litwits-docs?docId=${encodeURIComponent(doc.id)}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        setLitwitsDocs(previous);
        const data = await res.json().catch(() => ({}));
        alert(data?.error || "Failed to delete document");
      }
    } catch {
      setLitwitsDocs(previous);
      alert("Failed to delete document");
    }
  }
  async function toggleLitwitsDocAssignment(userEmail, docId, currentDocs) {
    const updated = currentDocs.includes(docId) ? currentDocs.filter((d) => d !== docId) : [...currentDocs, docId];
    const previous = users;
    setUsers(
      (prev) => prev.map((u) => u.email === userEmail ? { ...u, assignedLitwitsDocs: updated } : u)
    );
    setSavingUser(userEmail);
    try {
      const res = await apiFetch("/api/users", {
        method: "PUT",
        body: JSON.stringify({ email: userEmail, assignedLitwitsDocs: updated })
      });
      if (!res.ok) {
        setUsers(previous);
        alert("Failed to update document assignments");
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (data?.user) {
        const normalized = normalizeUser(data.user);
        setUsers((prev) => prev.map((u) => u.email === userEmail ? normalized : u));
      }
    } catch {
      setUsers(previous);
      alert("Failed to update document assignments");
    } finally {
      setSavingUser(null);
    }
  }
  async function fetchActivityLogs() {
    setActivityLoading(true);
    try {
      const params = new URLSearchParams();
      if (activityFilterUser) params.set("user", activityFilterUser);
      if (activityFilterDoc) params.set("docId", activityFilterDoc);
      if (activityFilterDate) params.set("date", activityFilterDate);
      const res = await apiFetch(`/api/litwits-doc-activity?${params.toString()}`);
      const data = await res.json();
      setActivityLogs(data.logs || []);
    } catch {
      setActivityLogs([]);
    } finally {
      setActivityLoading(false);
    }
  }
  async function fetchVersions(docId) {
    setVersionDocId(docId);
    setVersionsLoading(true);
    setVersionContent(null);
    setVersionViewTimestamp(null);
    try {
      const res = await apiFetch(`/api/litwits-doc-versions?docId=${encodeURIComponent(docId)}`);
      const data = await res.json();
      setVersions(data.versions || []);
    } catch {
      setVersions([]);
    } finally {
      setVersionsLoading(false);
    }
  }
  async function viewVersion(docId, timestamp) {
    try {
      const res = await apiFetch(`/api/litwits-doc-versions?docId=${encodeURIComponent(docId)}&version=${timestamp}`);
      const data = await res.json();
      if (data.version) {
        setVersionContent(data.version.content);
        setVersionViewTimestamp(timestamp);
      }
    } catch {
      alert("Failed to load version");
    }
  }
  async function restoreVersion(docId, timestamp) {
    if (!confirm("Restore this version? Current content will be overwritten.")) return;
    try {
      const res = await apiFetch("/api/litwits-doc-versions", {
        method: "POST",
        body: JSON.stringify({ docId, versionTimestamp: timestamp })
      });
      if (res.ok) {
        alert("Version restored successfully");
        fetchLitwitsDocs();
        fetchVersions(docId);
      }
    } catch {
      alert("Failed to restore version");
    }
  }
  async function apiFetchRetry(url, init, retries = 2) {
    let lastErr;
    for (let i = 0; i <= retries; i++) {
      try {
        const r = await apiFetch(url, init);
        if (r.ok || r.status < 500) return r;
        lastErr = new Error(`HTTP ${r.status}`);
      } catch (err) {
        lastErr = err;
      }
      await new Promise((res) => setTimeout(res, 250 * Math.pow(2, i)));
    }
    throw lastErr;
  }
  async function updateUserValidity(email, field, value) {
    setSavingUser(email);
    setSyncState("saving");
    setSyncStateMessage("Saving…");
    const previous = users;
    const target = users.find((u) => u.email === email);
    const expectedLastModified = target?.lastModified || 0;
    setUsers((prev) => prev.map((u) => u.email === email ? { ...u, [field]: value } : u));
    try {
      const res = await apiFetchRetry("/api/users", {
        method: "PUT",
        body: JSON.stringify({ email, [field]: value, expectedLastModified })
      });
      if (!res.ok) {
        setUsers(previous);
        setSyncState("error");
        setSyncStateMessage(res.status === 409 ? "Conflict — refresh to see latest" : "Save failed");
        if (res.status === 409) await fetchUsers({ silent: true });
        else alert("Failed to update");
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (data?.user) {
        const normalized = normalizeUser(data.user);
        setUsers((prev) => prev.map((u) => u.email === email ? normalized : u));
      }
      setSyncState("saved");
      setSyncStateMessage("Saved");
    } catch {
      setUsers(previous);
      setSyncState("error");
      setSyncStateMessage("Save failed");
      alert("Failed to update");
    } finally {
      setSavingUser(null);
    }
  }
  async function toggleUserStatus(email, currentStatus) {
    const newStatus = currentStatus === "active" ? "inactive" : "active";
    await updateUserValidity(email, "status", newStatus);
  }
  const UPLOAD_DOC_TYPES = litwitsDocs.map((d) => ({ id: d.id, title: d.title }));
  function handleUploadFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext !== "docx" && ext !== "pdf") {
      setUploadStatus("Only .docx and .pdf files are supported.");
      setUploadFile(null);
      return;
    }
    setUploadFile(file);
    setUploadStatus("");
    setUploadPreview("");
  }
  async function handleUploadParse() {
    if (!uploadFile || !uploadDocType) {
      setUploadStatus("Please select a file and a document type.");
      return;
    }
    setUploadParsing(true);
    setUploadStatus("Parsing document...");
    setUploadPreview("");
    try {
      const ext = uploadFile.name.split(".").pop()?.toLowerCase();
      const arrayBuffer = await uploadFile.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(arrayBuffer).reduce((data2, byte) => data2 + String.fromCharCode(byte), "")
      );
      const res = await apiFetch("/api/parse-document", {
        method: "POST",
        body: JSON.stringify({ fileData: base64, fileType: ext })
      });
      const data = await res.json();
      if (!res.ok) {
        setUploadStatus(`Error: ${data.error || "Failed to parse"}`);
        return;
      }
      setUploadPreview(data.html);
      setUploadStatus('Document parsed successfully. Review preview below and click "Upload to Document" to save.');
    } catch {
      setUploadStatus("Failed to parse document. Please try again.");
    } finally {
      setUploadParsing(false);
    }
  }
  async function handleUploadSave() {
    if (!uploadPreview || !uploadDocType) return;
    setUploadStatus("Saving document...");
    try {
      const docDef = UPLOAD_DOC_TYPES.find((d) => d.id === uploadDocType);
      const res = await apiFetch("/api/litwits-docs", {
        method: "PUT",
        body: JSON.stringify({
          docId: uploadDocType,
          title: docDef?.title || uploadDocType,
          content: uploadPreview
        })
      });
      if (res.ok) {
        setUploadStatus("Document uploaded and saved successfully!");
        setUploadFile(null);
        setUploadPreview("");
        setUploadDocType("");
        if (litwitsDocs.length > 0) fetchLitwitsDocs();
      } else {
        const data = await res.json();
        setUploadStatus(`Error: ${data.error || "Failed to save"}`);
      }
    } catch {
      setUploadStatus("Failed to save document. Please try again.");
    }
  }
  function handleExportUsers() {
    const exportData = users.map((u) => ({
      Name: u.name,
      Email: u.email,
      Phone: u.phone || "",
      Role: u.role,
      "Assigned Mentor(s)": (u.assignedMentors || []).join(", "),
      "Documents Shared": (u.assignedLitwitsDocs || []).join(", "),
      "Validity Start Date": u.validityStart || "",
      "Validity End Date": u.validityEnd || "",
      "Package": u.packagePlan && u.packagePlan !== "numeric" ? u.packagePlan === "signature" ? "Signature" : "Platinum" : u.packageSessions ?? 0,
      "Package Sessions": u.packageSessions ?? 0,
      "Session Type": u.sessionType || "",
      "Attended Sessions": u.attendedSessions ?? 0,
      Status: u.status || "active"
    }));
    const ws = XLSX.utils.json_to_sheet(exportData);
    const colWidths = Object.keys(exportData[0] || {}).map((key2) => ({
      wch: Math.max(key2.length, ...exportData.map((row) => String(row[key2] || "").length)) + 2
    }));
    ws["!cols"] = colWidths;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Users");
    XLSX.writeFile(wb, `litwits-users-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.xlsx`);
  }
  const selectedStudentDoc = useMemo(
    () => studentDocs.find((d) => d.id === selectedStudentDocId) ?? null,
    [studentDocs, selectedStudentDocId]
  );
  const selectedMentorDoc = useMemo(
    () => mentorDocs.find((d) => d.id === selectedMentorDocId) ?? null,
    [mentorDocs, selectedMentorDocId]
  );
  const selectedLitwitsDoc = useMemo(
    () => litwitsDocs.find((d) => d.id === selectedLitwitsDocId) ?? null,
    [litwitsDocs, selectedLitwitsDocId]
  );
  function onStudentTabsUpdate(docId, tabs, activeTabId) {
    setStudentDocs((prev) => prev.map((d) => d.id === docId ? { ...d, tabs, activeTabId } : d));
  }
  function onStudentTabAdd(docId) {
    setStudentDocs(
      (prev) => prev.map((d) => {
        if (d.id !== docId) return d;
        const currentTabs = d.tabs && d.tabs.length > 0 ? d.tabs : [{ id: "main", title: "Main", content: d.content || "" }];
        const title = window.prompt("New tab name:", `Tab ${currentTabs.length + 1}`);
        if (!title) return d;
        const newTab = { id: `tab-${Date.now()}`, title, content: "" };
        return { ...d, tabs: [...currentTabs, newTab], activeTabId: newTab.id };
      })
    );
  }
  function onStudentTabRename(docId, tabId, newTitle) {
    setStudentDocs(
      (prev) => prev.map(
        (d) => d.id === docId && d.tabs ? { ...d, tabs: d.tabs.map((t) => t.id === tabId ? { ...t, title: newTitle } : t) } : d
      )
    );
  }
  function onStudentTabDelete(docId, tabId) {
    setStudentDocs(
      (prev) => prev.map((d) => {
        if (d.id !== docId || !d.tabs) return d;
        const remaining = d.tabs.filter((t) => t.id !== tabId);
        const newActive = d.activeTabId === tabId ? remaining[0]?.id ?? null : d.activeTabId;
        return { ...d, tabs: remaining, activeTabId: newActive };
      })
    );
  }
  function onMentorTabsUpdate(docId, tabs, activeTabId) {
    setMentorDocs((prev) => prev.map((d) => d.id === docId ? { ...d, tabs, activeTabId } : d));
  }
  function onMentorTabAdd(docId) {
    setMentorDocs(
      (prev) => prev.map((d) => {
        if (d.id !== docId) return d;
        const currentTabs = d.tabs && d.tabs.length > 0 ? d.tabs : [{ id: "main", title: "Main", content: d.content || "" }];
        const title = window.prompt("New tab name:", `Tab ${currentTabs.length + 1}`);
        if (!title) return d;
        const newTab = { id: `tab-${Date.now()}`, title, content: "" };
        return { ...d, tabs: [...currentTabs, newTab], activeTabId: newTab.id };
      })
    );
  }
  function onMentorTabRename(docId, tabId, newTitle) {
    setMentorDocs(
      (prev) => prev.map(
        (d) => d.id === docId && d.tabs ? { ...d, tabs: d.tabs.map((t) => t.id === tabId ? { ...t, title: newTitle } : t) } : d
      )
    );
  }
  function onMentorTabDelete(docId, tabId) {
    setMentorDocs(
      (prev) => prev.map((d) => {
        if (d.id !== docId || !d.tabs) return d;
        const remaining = d.tabs.filter((t) => t.id !== tabId);
        const newActive = d.activeTabId === tabId ? remaining[0]?.id ?? null : d.activeTabId;
        return { ...d, tabs: remaining, activeTabId: newActive };
      })
    );
  }
  function onStudentTabReorder(docId, reorderedTabs) {
    setStudentDocs((prev) => prev.map((d) => d.id === docId ? { ...d, tabs: reorderedTabs } : d));
    if (selectedStudent) {
      saveTabOrder(`doc:${selectedStudent.email}:${docId}`, reorderedTabs.map((t) => t.id));
    }
  }
  function onMentorTabReorder(docId, reorderedTabs) {
    setMentorDocs((prev) => prev.map((d) => d.id === docId ? { ...d, tabs: reorderedTabs } : d));
    if (selectedMentor) {
      saveTabOrder(`mentor:${selectedMentor.email}:${docId}`, reorderedTabs.map((t) => t.id));
    }
  }
  function onLitwitsTabReorder(docId, reorderedTabs) {
    setLitwitsDocs((prev) => prev.map((d) => d.id === docId ? { ...d, tabs: reorderedTabs } : d));
    saveTabOrder(`litwits:${docId}`, reorderedTabs.map((t) => t.id));
  }
  const studentDocActiveContent = selectedStudentDoc ? selectedStudentDoc.tabs && selectedStudentDoc.activeTabId ? selectedStudentDoc.tabs.find((t) => t.id === selectedStudentDoc.activeTabId)?.content ?? selectedStudentDoc.content : selectedStudentDoc.content : "";
  const studentDocEditorKey = selectedStudentDoc && selectedStudent ? `${selectedStudent.email}-${selectedStudentDoc.id}` : "none";
  const mentorDocActiveContent = selectedMentorDoc ? selectedMentorDoc.tabs && selectedMentorDoc.activeTabId ? selectedMentorDoc.tabs.find((t) => t.id === selectedMentorDoc.activeTabId)?.content ?? selectedMentorDoc.content : selectedMentorDoc.content : "";
  const mentorDocEditorKey = selectedMentorDoc && selectedMentor ? `mentor-${selectedMentor.email}-${selectedMentorDoc.id}` : "none";
  const activeLitwitsContent = selectedLitwitsDoc ? selectedLitwitsDoc.tabs && selectedLitwitsDoc.activeTabId ? selectedLitwitsDoc.tabs.find((t) => t.id === selectedLitwitsDoc.activeTabId)?.content ?? selectedLitwitsDoc.content : selectedLitwitsDoc.content : "";
  const litwitsEditorKey = selectedLitwitsDoc ? `${selectedLitwitsDoc.id}` : "none";
  const LITWITS_CATEGORY_ORDER = [
    "Other Documents",
    "WSC Documents"
  ];
  const groupedLitwitsDocs = (() => {
    const map = {};
    for (const doc of litwitsDocs) {
      const cat = doc.category || "Other Documents";
      if (!map[cat]) map[cat] = [];
      map[cat].push(doc);
    }
    const ordered = [];
    for (const cat of LITWITS_CATEGORY_ORDER) {
      ordered.push([cat, map[cat] || []]);
    }
    for (const cat of Object.keys(map)) {
      if (!LITWITS_CATEGORY_ORDER.includes(cat)) ordered.push([cat, map[cat]]);
    }
    return ordered;
  })();
  const isAdmin = currentUser?.role === "admin";
  return /* @__PURE__ */ jsxs("div", { className: "h-screen bg-gray-50 flex flex-col overflow-hidden", children: [
    /* @__PURE__ */ jsxs("header", { className: "bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between flex-none z-20", children: [
      /* @__PURE__ */ jsx(Wordmark, {}),
      /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-4", children: [
        /* @__PURE__ */ jsx("span", { className: "text-sm text-gray-500 hidden sm:block", children: currentUser?.name }),
        /* @__PURE__ */ jsx(
          "button",
          {
            onClick: handleLogout,
            className: "text-xs text-gray-500 hover:text-[#A52A2A] transition-colors uppercase tracking-wide",
            children: "Logout"
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "bg-white border-b border-gray-200 px-6 flex gap-0 overflow-x-auto flex-none z-10", children: [
      /* @__PURE__ */ jsx(TabBtn, { active: tab === "students", onClick: () => safeSetTab("students"), children: "Students" }),
      /* @__PURE__ */ jsx(TabBtn, { active: tab === "mentor-docs", onClick: () => safeSetTab("mentor-docs"), children: "Mentor Documents" }),
      /* @__PURE__ */ jsx(TabBtn, { active: tab === "litwits-docs", onClick: () => safeSetTab("litwits-docs"), children: "LITWITS Documents" }),
      /* @__PURE__ */ jsx(TabBtn, { active: tab === "users", onClick: () => {
        safeSetTab("users");
        fetchLitwitsDocs();
      }, children: "Manage Users" }),
      /* @__PURE__ */ jsx(TabBtn, { active: tab === "create", onClick: () => {
        safeSetTab("create");
        fetchLitwitsDocs();
      }, children: "Create User" }),
      /* @__PURE__ */ jsx(TabBtn, { active: tab === "bulk", onClick: () => {
        safeSetTab("bulk");
        fetchLitwitsDocs();
      }, children: "Bulk User Upload" }),
      /* @__PURE__ */ jsx(TabBtn, { active: tab === "renewals", onClick: () => safeSetTab("renewals"), children: "Renewals" }),
      /* @__PURE__ */ jsx(TabBtn, { active: tab === "activity-logs", onClick: () => {
        safeSetTab("activity-logs");
        fetchActivityLogs();
        fetchLitwitsDocs();
      }, children: "Activity Logs" }),
      /* @__PURE__ */ jsx(TabBtn, { active: tab === "arsr", onClick: () => safeSetTab("arsr"), children: "AR & SR" }),
      /* @__PURE__ */ jsx(TabBtn, { active: false, onClick: () => navigate({ to: "/sales" }), children: "Sales" })
    ] }),
    tab === "arsr" && /* @__PURE__ */ jsx(ARSRModule, { currentUser, onUploadComplete: () => fetchUsers({ silent: true }) }),
    tab === "students" && /* @__PURE__ */ jsxs("main", { className: "flex-1 min-h-0 flex flex-col", children: [
      studentsView === "grid" && /* @__PURE__ */ jsx("div", { className: "flex-1 min-h-0 overflow-auto p-6", children: /* @__PURE__ */ jsxs("div", { className: "max-w-7xl mx-auto w-full", children: [
        /* @__PURE__ */ jsx("h1", { className: "text-2xl font-semibold text-gray-800 mb-6", style: { fontFamily: '"Playfair Display", serif' }, children: "Students" }),
        loading ? /* @__PURE__ */ jsx("p", { className: "text-sm text-gray-400", children: "Loading..." }) : students.length === 0 ? /* @__PURE__ */ jsx("p", { className: "text-sm text-gray-400", children: "No students found." }) : /* @__PURE__ */ jsx("div", { className: "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4", children: students.map((s) => /* @__PURE__ */ jsx(
          PersonCard,
          {
            name: s.name,
            role: s.role,
            onClick: () => loadStudentDocs(s)
          },
          s.email
        )) })
      ] }) }),
      studentsView === "studentDocs" && selectedStudent && /* @__PURE__ */ jsx("div", { className: "flex-1 min-h-0 overflow-auto p-6", children: /* @__PURE__ */ jsxs("div", { className: "max-w-6xl mx-auto w-full", children: [
        /* @__PURE__ */ jsx("div", { className: "flex items-center gap-3 mb-6", children: /* @__PURE__ */ jsx(
          "button",
          {
            onClick: () => {
              setStudentsView("grid");
              setSelectedStudent(null);
              setSelectedStudentDocId(null);
            },
            className: "text-xs text-gray-500 hover:text-[#A52A2A] transition-colors uppercase tracking-wide",
            children: "← Back to Students"
          }
        ) }),
        /* @__PURE__ */ jsx("h1", { className: "text-2xl font-semibold text-gray-800 mb-2", style: { fontFamily: '"Playfair Display", serif' }, children: selectedStudent.name }),
        /* @__PURE__ */ jsx("p", { className: "text-sm text-gray-500 mb-6", children: "Documents" }),
        docsLoading ? /* @__PURE__ */ jsx("p", { className: "text-sm text-gray-400", children: "Loading..." }) : /* @__PURE__ */ jsx("div", { className: "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4", children: studentDocs.map((doc) => /* @__PURE__ */ jsx(
          DocCard,
          {
            title: doc.title,
            icon: DOC_ICONS[doc.id],
            onClick: () => {
              setSelectedStudentDocId(doc.id);
              setStudentsView("editor");
            }
          },
          doc.id
        )) })
      ] }) }),
      studentsView === "editor" && selectedStudent && selectedStudentDoc && currentUser && /* @__PURE__ */ jsxs("div", { className: "flex-1 min-h-0 flex flex-col", children: [
        /* @__PURE__ */ jsxs("div", { className: "bg-white border-b border-gray-200 px-6 py-2 flex items-center gap-3 flex-none z-10", children: [
          /* @__PURE__ */ jsxs(
            "button",
            {
              onClick: () => setStudentsView("studentDocs"),
              className: "text-xs text-gray-500 hover:text-[#A52A2A] uppercase tracking-wide",
              children: [
                "← Back to ",
                selectedStudent.name,
                "'s Documents"
              ]
            }
          ),
          /* @__PURE__ */ jsx("span", { className: "text-xs text-gray-300", children: "|" }),
          /* @__PURE__ */ jsxs("span", { className: "text-xs text-gray-500", children: [
            "Editing ",
            selectedStudent.name,
            " - ",
            selectedStudentDoc.title
          ] })
        ] }),
        /* @__PURE__ */ jsx(
          DocumentTabsBar,
          {
            tabs: selectedStudentDoc.tabs || null,
            activeTabId: selectedStudentDoc.activeTabId || null,
            canEdit: true,
            onSwitch: (tabId) => {
              setStudentDocs(
                (prev) => prev.map(
                  (d) => d.id === selectedStudentDoc.id ? { ...d, activeTabId: tabId } : d
                )
              );
            },
            onAdd: () => onStudentTabAdd(selectedStudentDoc.id),
            onRename: (tabId, newTitle) => onStudentTabRename(selectedStudentDoc.id, tabId, newTitle),
            onDelete: (tabId) => onStudentTabDelete(selectedStudentDoc.id, tabId),
            onReorder: (reorderedTabs) => onStudentTabReorder(selectedStudentDoc.id, reorderedTabs)
          }
        ),
        /* @__PURE__ */ jsx("div", { className: "flex-1 min-h-0 bg-white", children: /* @__PURE__ */ jsx(
          Editor,
          {
            docId: selectedStudentDoc.id,
            userEmail: selectedStudent.email,
            initialTitle: selectedStudentDoc.title,
            initialContent: studentDocActiveContent,
            userRole: "admin",
            currentUserEmail: currentUser.email,
            currentUserName: currentUser.name,
            tabs: selectedStudentDoc.tabs || null,
            activeTabId: selectedStudentDoc.activeTabId || null,
            onTabsUpdate: (tabs, activeTabId) => onStudentTabsUpdate(selectedStudentDoc.id, tabs, activeTabId)
          },
          studentDocEditorKey
        ) })
      ] })
    ] }),
    tab === "mentor-docs" && /* @__PURE__ */ jsxs("main", { className: "flex-1 min-h-0 flex flex-col", children: [
      mentorDocsView === "grid" && /* @__PURE__ */ jsx("div", { className: "flex-1 min-h-0 overflow-auto p-6", children: /* @__PURE__ */ jsxs("div", { className: "max-w-7xl mx-auto w-full", children: [
        /* @__PURE__ */ jsx("h1", { className: "text-2xl font-semibold text-gray-800 mb-6", style: { fontFamily: '"Playfair Display", serif' }, children: "Mentor Documents" }),
        mentorsListLoading ? /* @__PURE__ */ jsx("p", { className: "text-sm text-gray-400", children: "Loading..." }) : mentorsList.length === 0 ? /* @__PURE__ */ jsx("p", { className: "text-sm text-gray-400", children: "No mentors found." }) : /* @__PURE__ */ jsx("div", { className: "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4", children: mentorsList.map((m) => /* @__PURE__ */ jsx(
          PersonCard,
          {
            name: m.name,
            role: "mentor",
            onClick: () => loadMentorDocs(m)
          },
          m.email
        )) })
      ] }) }),
      mentorDocsView === "mentorDocs" && selectedMentor && /* @__PURE__ */ jsx("div", { className: "flex-1 min-h-0 overflow-auto p-6", children: /* @__PURE__ */ jsxs("div", { className: "max-w-6xl mx-auto w-full", children: [
        /* @__PURE__ */ jsx("div", { className: "flex items-center gap-3 mb-6", children: /* @__PURE__ */ jsx(
          "button",
          {
            onClick: () => {
              setMentorDocsView("grid");
              setSelectedMentor(null);
              setSelectedMentorDocId(null);
            },
            className: "text-xs text-gray-500 hover:text-[#A52A2A] transition-colors uppercase tracking-wide",
            children: "← Back to Mentors"
          }
        ) }),
        /* @__PURE__ */ jsx("h1", { className: "text-2xl font-semibold text-gray-800 mb-2", style: { fontFamily: '"Playfair Display", serif' }, children: selectedMentor.name }),
        /* @__PURE__ */ jsx("p", { className: "text-sm text-gray-500 mb-6", children: "Mentor Documents" }),
        mentorDocsLoading ? /* @__PURE__ */ jsx("p", { className: "text-sm text-gray-400", children: "Loading..." }) : /* @__PURE__ */ jsx("div", { className: "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4", children: mentorDocs.map((doc) => /* @__PURE__ */ jsx(
          DocCard,
          {
            title: doc.title,
            onClick: () => {
              setSelectedMentorDocId(doc.id);
              setMentorDocsView("editor");
            }
          },
          doc.id
        )) })
      ] }) }),
      mentorDocsView === "editor" && selectedMentor && selectedMentorDoc && currentUser && /* @__PURE__ */ jsxs("div", { className: "flex-1 min-h-0 flex flex-col", children: [
        /* @__PURE__ */ jsxs("div", { className: "bg-white border-b border-gray-200 px-6 py-2 flex items-center gap-3 flex-none z-10", children: [
          /* @__PURE__ */ jsxs(
            "button",
            {
              onClick: () => setMentorDocsView("mentorDocs"),
              className: "text-xs text-gray-500 hover:text-[#A52A2A] uppercase tracking-wide",
              children: [
                "← Back to ",
                selectedMentor.name,
                "'s Documents"
              ]
            }
          ),
          /* @__PURE__ */ jsx("span", { className: "text-xs text-gray-300", children: "|" }),
          /* @__PURE__ */ jsxs("span", { className: "text-xs text-gray-500", children: [
            "Editing ",
            selectedMentor.name,
            " - ",
            selectedMentorDoc.title
          ] })
        ] }),
        /* @__PURE__ */ jsx(
          DocumentTabsBar,
          {
            tabs: selectedMentorDoc.tabs || null,
            activeTabId: selectedMentorDoc.activeTabId || null,
            canEdit: true,
            onSwitch: (tabId) => {
              setMentorDocs(
                (prev) => prev.map(
                  (d) => d.id === selectedMentorDoc.id ? { ...d, activeTabId: tabId } : d
                )
              );
            },
            onAdd: () => onMentorTabAdd(selectedMentorDoc.id),
            onRename: (tabId, newTitle) => onMentorTabRename(selectedMentorDoc.id, tabId, newTitle),
            onDelete: (tabId) => onMentorTabDelete(selectedMentorDoc.id, tabId),
            onReorder: (reorderedTabs) => onMentorTabReorder(selectedMentorDoc.id, reorderedTabs)
          }
        ),
        /* @__PURE__ */ jsx("div", { className: "flex-1 min-h-0 bg-white", children: /* @__PURE__ */ jsx(
          Editor,
          {
            docId: selectedMentorDoc.id,
            userEmail: selectedMentor.email,
            initialTitle: selectedMentorDoc.title,
            initialContent: mentorDocActiveContent,
            userRole: "admin",
            currentUserEmail: currentUser.email,
            currentUserName: currentUser.name,
            apiPath: "/api/mentor-documents",
            disableExport: true,
            tabs: selectedMentorDoc.tabs || null,
            activeTabId: selectedMentorDoc.activeTabId || null,
            onTabsUpdate: (tabs, activeTabId) => onMentorTabsUpdate(selectedMentorDoc.id, tabs, activeTabId)
          },
          mentorDocEditorKey
        ) })
      ] })
    ] }),
    tab === "litwits-docs" && /* @__PURE__ */ jsxs("main", { className: "flex-1 min-h-0 flex flex-col", children: [
      litwitsView === "grid" && /* @__PURE__ */ jsx("div", { className: "flex-1 min-h-0 overflow-auto p-6", children: /* @__PURE__ */ jsxs("div", { className: "max-w-6xl mx-auto w-full", children: [
        /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between mb-6", children: [
          /* @__PURE__ */ jsx("h1", { className: "text-2xl font-semibold text-gray-800", style: { fontFamily: '"Playfair Display", serif' }, children: "LITWITS Documents" }),
          /* @__PURE__ */ jsx(
            "button",
            {
              onClick: initAllLitwitsDocs,
              className: "text-xs text-[#A52A2A] hover:underline",
              title: "Initialize all default LITWITS documents",
              children: "Init All"
            }
          )
        ] }),
        litwitsLoading && litwitsDocs.length === 0 ? /* @__PURE__ */ jsx("p", { className: "text-sm text-gray-400", children: "Loading..." }) : /* @__PURE__ */ jsx("div", { className: "space-y-6", children: groupedLitwitsDocs.map(([category, catDocs]) => {
          const isManagedCategory = category === "Other Documents" || category === "WSC Documents";
          return /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between mb-3", children: [
              /* @__PURE__ */ jsx("h2", { className: "text-xs font-semibold text-gray-500 uppercase tracking-wide", children: category }),
              isAdmin && isManagedCategory && /* @__PURE__ */ jsx(
                "button",
                {
                  type: "button",
                  onClick: () => createLitwitsDoc(category),
                  className: "text-xs text-[#A52A2A] hover:underline font-medium",
                  children: "+ Create New Document"
                }
              )
            ] }),
            catDocs.length === 0 ? /* @__PURE__ */ jsx("p", { className: "text-xs text-gray-400 italic", children: "No documents in this section yet." }) : /* @__PURE__ */ jsx("div", { className: "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4", children: catDocs.map((doc) => /* @__PURE__ */ jsx(
              DocCard,
              {
                title: doc.title,
                onClick: () => {
                  setSelectedLitwitsDocId(doc.id);
                  setLitwitsView("editor");
                },
                onDelete: isAdmin ? () => deleteLitwitsDoc(doc) : void 0
              },
              doc.id
            )) })
          ] }, category);
        }) })
      ] }) }),
      litwitsView === "editor" && selectedLitwitsDoc && currentUser && /* @__PURE__ */ jsxs("div", { className: "flex-1 min-h-0 flex flex-col", children: [
        /* @__PURE__ */ jsxs("div", { className: "bg-white border-b border-gray-200 px-6 py-2 flex items-center gap-3 flex-none z-10", children: [
          /* @__PURE__ */ jsx(
            "button",
            {
              onClick: () => setLitwitsView("grid"),
              className: "text-xs text-gray-500 hover:text-[#A52A2A] uppercase tracking-wide",
              children: "← Back to Documents"
            }
          ),
          /* @__PURE__ */ jsx("span", { className: "text-xs text-gray-300", children: "|" }),
          /* @__PURE__ */ jsx("span", { className: "text-xs text-gray-500", children: selectedLitwitsDoc.title })
        ] }),
        /* @__PURE__ */ jsx(
          DocumentTabsBar,
          {
            tabs: selectedLitwitsDoc.tabs || null,
            activeTabId: selectedLitwitsDoc.activeTabId || null,
            canEdit: true,
            onSwitch: (tabId) => {
              setLitwitsDocs(
                (prev) => prev.map(
                  (d) => d.id === selectedLitwitsDoc.id ? { ...d, activeTabId: tabId } : d
                )
              );
            },
            onAdd: () => {
              const title = window.prompt("New tab name:", "New Tab");
              if (!title) return;
              setLitwitsDocs(
                (prev) => prev.map((d) => {
                  if (d.id !== selectedLitwitsDoc.id) return d;
                  const currentTabs = d.tabs && d.tabs.length > 0 ? d.tabs : [{ id: "main", title: "Main", content: d.content || "" }];
                  const newTab = { id: `tab-${Date.now()}`, title, content: "" };
                  return { ...d, tabs: [...currentTabs, newTab], activeTabId: newTab.id };
                })
              );
            },
            onRename: (tabId, newTitle) => {
              setLitwitsDocs(
                (prev) => prev.map(
                  (d) => d.id === selectedLitwitsDoc.id && d.tabs ? { ...d, tabs: d.tabs.map((t) => t.id === tabId ? { ...t, title: newTitle } : t) } : d
                )
              );
            },
            onDelete: (tabId) => {
              setLitwitsDocs(
                (prev) => prev.map((d) => {
                  if (d.id !== selectedLitwitsDoc.id || !d.tabs) return d;
                  const remaining = d.tabs.filter((t) => t.id !== tabId);
                  const newActive = d.activeTabId === tabId ? remaining[0]?.id ?? null : d.activeTabId;
                  return { ...d, tabs: remaining, activeTabId: newActive };
                })
              );
            },
            onReorder: (reorderedTabs) => onLitwitsTabReorder(selectedLitwitsDoc.id, reorderedTabs)
          }
        ),
        /* @__PURE__ */ jsx("div", { className: "flex-1 min-h-0 bg-white", children: /* @__PURE__ */ jsx(
          Editor,
          {
            docId: selectedLitwitsDoc.id,
            userEmail: currentUser.email,
            initialTitle: selectedLitwitsDoc.title,
            initialContent: activeLitwitsContent,
            userRole: "admin",
            currentUserEmail: currentUser.email,
            currentUserName: currentUser.name,
            apiPath: "/api/litwits-doc-sync",
            disableExport: true,
            disableComments: true,
            disableSuggestions: true,
            activityLogPath: "/api/litwits-doc-activity",
            tabs: selectedLitwitsDoc.tabs || null,
            activeTabId: selectedLitwitsDoc.activeTabId || null,
            onTabsUpdate: (tabs, activeTabId) => {
              setLitwitsDocs(
                (prev) => prev.map(
                  (d) => d.id === selectedLitwitsDoc.id ? { ...d, tabs, activeTabId } : d
                )
              );
            }
          },
          litwitsEditorKey
        ) })
      ] })
    ] }),
    (tab === "users" || tab === "create" || tab === "bulk" || tab === "renewals" || tab === "activity-logs") && /* @__PURE__ */ jsxs("main", { className: "flex-1 min-h-0 overflow-auto p-6 w-full", children: [
      error && /* @__PURE__ */ jsx("div", { className: "mb-4 p-3 bg-red-50 text-red-700 text-sm rounded border border-red-200", children: error }),
      tab === "users" && /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between mb-4", children: [
          /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3", children: [
            /* @__PURE__ */ jsx(
              "h2",
              {
                className: "text-xl font-semibold text-gray-800",
                style: { fontFamily: '"Playfair Display", serif' },
                children: "All Users"
              }
            ),
            /* @__PURE__ */ jsx(SyncStatusPill, { state: syncState, message: syncStateMessage })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3", children: [
            /* @__PURE__ */ jsx(
              "button",
              {
                onClick: handleExportUsers,
                disabled: users.length === 0,
                className: "text-xs bg-green-700 text-white px-4 py-2 rounded hover:bg-green-800 transition-colors disabled:opacity-50 uppercase tracking-wide font-medium",
                children: "Export Users (.xlsx)"
              }
            ),
            /* @__PURE__ */ jsx(
              "button",
              {
                onClick: handleSyncAssignments,
                disabled: syncing,
                className: "text-xs bg-[#A52A2A] text-white px-4 py-2 rounded hover:bg-[#8B1A1A] transition-colors disabled:opacity-50 uppercase tracking-wide font-medium",
                children: syncing ? "Syncing…" : "Sync All Students to All Mentors"
              }
            ),
            /* @__PURE__ */ jsx(
              "button",
              {
                onClick: () => fetchUsers(),
                className: "text-xs text-[#A52A2A] hover:underline",
                children: "Refresh"
              }
            )
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap items-end gap-3 mb-4 p-3 bg-gray-50 border border-gray-200 rounded", children: [
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("label", { className: "block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1", children: "Mentor" }),
            /* @__PURE__ */ jsxs(
              "select",
              {
                value: filterMentor,
                onChange: (e) => setFilterMentor(e.target.value),
                className: "border border-gray-300 rounded px-2 py-1.5 text-xs outline-none focus:border-[#A52A2A] min-w-[160px]",
                children: [
                  /* @__PURE__ */ jsx("option", { value: "", children: "All mentors" }),
                  mentors.map((m) => /* @__PURE__ */ jsx("option", { value: m.email, children: m.name }, m.email))
                ]
              }
            )
          ] }),
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("label", { className: "block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1", children: "Session Type" }),
            /* @__PURE__ */ jsxs(
              "select",
              {
                value: filterSessionType,
                onChange: (e) => setFilterSessionType(e.target.value),
                className: "border border-gray-300 rounded px-2 py-1.5 text-xs outline-none focus:border-[#A52A2A]",
                children: [
                  /* @__PURE__ */ jsx("option", { value: "", children: "All types" }),
                  /* @__PURE__ */ jsx("option", { value: "Individual", children: "Individual" }),
                  /* @__PURE__ */ jsx("option", { value: "Group", children: "Group" }),
                  /* @__PURE__ */ jsx("option", { value: "Renewals", children: "Renewals" })
                ]
              }
            )
          ] }),
          /* @__PURE__ */ jsxs("label", { className: "flex items-center gap-2 text-xs text-gray-700 mb-1", children: [
            /* @__PURE__ */ jsx(
              "input",
              {
                type: "checkbox",
                checked: filterExpiringOnly,
                onChange: (e) => setFilterExpiringOnly(e.target.checked),
                className: "accent-[#A52A2A]"
              }
            ),
            /* @__PURE__ */ jsx("span", { children: "Expiring in < 7 days" })
          ] }),
          (filterMentor || filterSessionType || filterExpiringOnly) && /* @__PURE__ */ jsx(
            "button",
            {
              onClick: () => {
                setFilterMentor("");
                setFilterSessionType("");
                setFilterExpiringOnly(false);
              },
              className: "text-[11px] text-[#A52A2A] hover:underline ml-auto",
              children: "Clear filters"
            }
          )
        ] }),
        syncResult && /* @__PURE__ */ jsx(
          "div",
          {
            className: `mb-4 p-3 text-sm rounded border ${syncResult.startsWith("Error") ? "bg-red-50 text-red-700 border-red-200" : "bg-green-50 text-green-700 border-green-200"}`,
            children: syncResult
          }
        ),
        loading ? /* @__PURE__ */ jsx("p", { className: "text-gray-400 text-sm", children: "Loading…" }) : /* @__PURE__ */ jsx("div", { className: "overflow-x-auto bg-white rounded-lg border border-gray-200 shadow-sm", children: /* @__PURE__ */ jsxs("table", { className: "min-w-full text-sm", children: [
          /* @__PURE__ */ jsx("thead", { children: /* @__PURE__ */ jsx("tr", { className: "bg-gray-50 border-b border-gray-200", children: ["Name", "Email", "Phone", "Role", "Sessions", "Assigned Mentors", "Documents Shared", "Validity Start", "Validity End", "Status", "Password", "Docs", "Actions"].map(
            (h, idx) => /* @__PURE__ */ jsx(
              "th",
              {
                className: `text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap ${idx === 0 ? "sticky left-0 z-10 bg-gray-50 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]" : ""}`,
                children: h
              },
              h
            )
          ) }) }),
          /* @__PURE__ */ jsxs("tbody", { className: "divide-y divide-gray-100", children: [
            filteredUsers.map((u) => /* @__PURE__ */ jsxs("tr", { className: "hover:bg-gray-50 group", children: [
              /* @__PURE__ */ jsx("td", { className: "px-4 py-3 sticky left-0 z-10 bg-white group-hover:bg-gray-50 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]", children: editingCell?.email === u.email && editingCell.field === "name" ? /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-1", children: [
                /* @__PURE__ */ jsx(
                  "input",
                  {
                    type: "text",
                    value: editValue,
                    onChange: (e) => setEditValue(e.target.value),
                    onKeyDown: (e) => {
                      if (e.key === "Enter") saveInlineEdit(u.email, "name", editValue);
                      if (e.key === "Escape") setEditingCell(null);
                    },
                    autoFocus: true,
                    className: "border border-[#A52A2A] rounded px-2 py-1 text-sm outline-none w-32"
                  }
                ),
                /* @__PURE__ */ jsx(
                  "button",
                  {
                    onClick: () => saveInlineEdit(u.email, "name", editValue),
                    className: "text-xs bg-[#A52A2A] text-white px-2 py-1 rounded hover:bg-[#8B1A1A]",
                    children: "Save"
                  }
                ),
                /* @__PURE__ */ jsx(
                  "button",
                  {
                    onClick: () => setEditingCell(null),
                    className: "text-xs text-gray-400 hover:text-gray-600",
                    children: "Cancel"
                  }
                )
              ] }) : /* @__PURE__ */ jsx(
                "span",
                {
                  className: "font-medium text-gray-800 cursor-pointer hover:bg-yellow-50 px-1 py-0.5 rounded",
                  onClick: () => startEdit(u.email, "name", u.name),
                  title: "Click to edit",
                  children: u.name
                }
              ) }),
              /* @__PURE__ */ jsx("td", { className: "px-4 py-3", children: editingCell?.email === u.email && editingCell.field === "email" ? /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-1", children: [
                /* @__PURE__ */ jsx(
                  "input",
                  {
                    type: "email",
                    value: editValue,
                    onChange: (e) => setEditValue(e.target.value),
                    onKeyDown: (e) => {
                      if (e.key === "Enter") saveInlineEdit(u.email, "email", editValue);
                      if (e.key === "Escape") setEditingCell(null);
                    },
                    autoFocus: true,
                    className: "border border-[#A52A2A] rounded px-2 py-1 text-sm outline-none w-44"
                  }
                ),
                /* @__PURE__ */ jsx(
                  "button",
                  {
                    onClick: () => saveInlineEdit(u.email, "email", editValue),
                    className: "text-xs bg-[#A52A2A] text-white px-2 py-1 rounded hover:bg-[#8B1A1A]",
                    children: "Save"
                  }
                ),
                /* @__PURE__ */ jsx(
                  "button",
                  {
                    onClick: () => setEditingCell(null),
                    className: "text-xs text-gray-400 hover:text-gray-600",
                    children: "Cancel"
                  }
                )
              ] }) : /* @__PURE__ */ jsx(
                "span",
                {
                  className: "text-gray-600 cursor-pointer hover:bg-yellow-50 px-1 py-0.5 rounded",
                  onClick: () => startEdit(u.email, "email", u.email),
                  title: "Click to edit",
                  children: u.email
                }
              ) }),
              /* @__PURE__ */ jsx("td", { className: "px-4 py-3", children: editingCell?.email === u.email && editingCell.field === "phone" ? /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-1", children: [
                /* @__PURE__ */ jsx(
                  "input",
                  {
                    type: "tel",
                    value: editValue,
                    onChange: (e) => setEditValue(e.target.value),
                    onKeyDown: (e) => {
                      if (e.key === "Enter") saveInlineEdit(u.email, "phone", editValue);
                      if (e.key === "Escape") setEditingCell(null);
                    },
                    autoFocus: true,
                    className: "border border-[#A52A2A] rounded px-2 py-1 text-sm outline-none w-28"
                  }
                ),
                /* @__PURE__ */ jsx(
                  "button",
                  {
                    onClick: () => saveInlineEdit(u.email, "phone", editValue),
                    className: "text-xs bg-[#A52A2A] text-white px-2 py-1 rounded hover:bg-[#8B1A1A]",
                    children: "Save"
                  }
                ),
                /* @__PURE__ */ jsx(
                  "button",
                  {
                    onClick: () => setEditingCell(null),
                    className: "text-xs text-gray-400 hover:text-gray-600",
                    children: "Cancel"
                  }
                )
              ] }) : /* @__PURE__ */ jsx(
                "span",
                {
                  className: "text-gray-600 cursor-pointer hover:bg-yellow-50 px-1 py-0.5 rounded",
                  onClick: () => startEdit(u.email, "phone", u.phone || ""),
                  title: "Click to edit",
                  children: u.phone || "—"
                }
              ) }),
              /* @__PURE__ */ jsx("td", { className: "px-4 py-3", children: editingCell?.email === u.email && editingCell.field === "role" ? /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-1", children: [
                /* @__PURE__ */ jsx(
                  "select",
                  {
                    value: editValue,
                    onChange: (e) => setEditValue(e.target.value),
                    autoFocus: true,
                    className: "border border-[#A52A2A] rounded px-2 py-1 text-sm outline-none",
                    children: ROLES.map((r) => /* @__PURE__ */ jsx("option", { value: r, children: r.charAt(0).toUpperCase() + r.slice(1) }, r))
                  }
                ),
                /* @__PURE__ */ jsx(
                  "button",
                  {
                    onClick: () => saveInlineEdit(u.email, "role", editValue),
                    className: "text-xs bg-[#A52A2A] text-white px-2 py-1 rounded hover:bg-[#8B1A1A]",
                    children: "Save"
                  }
                ),
                /* @__PURE__ */ jsx(
                  "button",
                  {
                    onClick: () => setEditingCell(null),
                    className: "text-xs text-gray-400 hover:text-gray-600",
                    children: "Cancel"
                  }
                )
              ] }) : /* @__PURE__ */ jsx(
                "span",
                {
                  className: "cursor-pointer",
                  onClick: () => startEdit(u.email, "role", u.role),
                  title: "Click to edit",
                  children: /* @__PURE__ */ jsx(
                    "span",
                    {
                      className: `inline-block px-2 py-0.5 rounded text-xs font-medium ${u.role === "admin" ? "bg-red-100 text-red-700" : u.role === "mentor" ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700"}`,
                      children: u.role
                    }
                  )
                }
              ) }),
              /* @__PURE__ */ jsx("td", { className: "px-4 py-3 text-gray-700 whitespace-nowrap", children: u.role === "student" ? /* @__PURE__ */ jsxs("span", { className: "font-mono text-xs flex items-center gap-1", children: [
                editingCell?.email === u.email && editingCell.field === "attendedSessions" ? /* @__PURE__ */ jsxs(Fragment, { children: [
                  /* @__PURE__ */ jsx(
                    "input",
                    {
                      type: "number",
                      min: 0,
                      value: editValue,
                      onChange: (e) => setEditValue(e.target.value),
                      onKeyDown: (e) => {
                        if (e.key === "Enter")
                          saveAttendedEdit(u, editValue);
                        if (e.key === "Escape") setEditingCell(null);
                      },
                      autoFocus: true,
                      className: "border border-[#A52A2A] rounded px-1 py-0.5 text-xs outline-none w-14 font-mono"
                    }
                  ),
                  /* @__PURE__ */ jsxs("span", { children: [
                    "/ ",
                    u.packageSessions ?? 0
                  ] }),
                  /* @__PURE__ */ jsx(
                    "button",
                    {
                      onClick: () => saveAttendedEdit(u, editValue),
                      className: "text-[10px] bg-[#A52A2A] text-white px-1.5 py-0.5 rounded hover:bg-[#8B1A1A]",
                      children: "Save"
                    }
                  ),
                  /* @__PURE__ */ jsx(
                    "button",
                    {
                      onClick: () => setEditingCell(null),
                      className: "text-[10px] text-gray-400 hover:text-gray-600",
                      children: "Cancel"
                    }
                  )
                ] }) : /* @__PURE__ */ jsxs(
                  "span",
                  {
                    className: "cursor-pointer hover:bg-yellow-50 px-1 py-0.5 rounded",
                    onClick: () => startEdit(
                      u.email,
                      "attendedSessions",
                      String(u.attendedSessions ?? 0)
                    ),
                    title: `Click to edit. SR Count: ${u.srCount ?? 0}, Manual Adjustment: ${u.manualAdjustment ?? 0}`,
                    children: [
                      u.attendedSessions ?? 0,
                      " / ",
                      u.packageSessions ?? 0
                    ]
                  }
                ),
                (u.manualAdjustment ?? 0) !== 0 ? /* @__PURE__ */ jsxs(
                  "span",
                  {
                    className: "text-[9px] text-amber-600 uppercase font-semibold",
                    title: `Manual adjustment of ${u.manualAdjustment} on top of SR count ${u.srCount ?? 0}`,
                    children: [
                      "adj ",
                      (u.manualAdjustment ?? 0) > 0 ? "+" : "",
                      u.manualAdjustment
                    ]
                  }
                ) : null,
                u.packagePlan && u.packagePlan !== "numeric" ? /* @__PURE__ */ jsx("span", { className: "text-[10px] text-purple-600 uppercase font-semibold", children: u.packagePlan === "signature" ? "Signature" : "Platinum" }) : null,
                u.sessionType ? /* @__PURE__ */ jsx("span", { className: "text-[10px] text-gray-400 uppercase", children: u.sessionType }) : null,
                u.needsRenewal ? /* @__PURE__ */ jsx("span", { className: "inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-orange-100 text-orange-700", children: "Renewal" }) : null
              ] }) : /* @__PURE__ */ jsx("span", { className: "text-gray-300", children: "—" }) }),
              /* @__PURE__ */ jsx("td", { className: "px-4 py-3", children: u.role === "student" ? /* @__PURE__ */ jsxs("div", { className: "relative", children: [
                /* @__PURE__ */ jsx(
                  "button",
                  {
                    onClick: () => setMentorDropdownOpen(mentorDropdownOpen === u.email ? null : u.email),
                    className: "text-left text-xs border border-gray-300 rounded px-2 py-1.5 w-48 truncate hover:border-[#A52A2A] transition-colors bg-white",
                    title: "Click to manage assigned mentors",
                    children: u.assignedMentors.length > 0 ? `${u.assignedMentors.length} mentor${u.assignedMentors.length > 1 ? "s" : ""} assigned` : "No mentors assigned"
                  }
                ),
                mentorDropdownOpen === u.email && /* @__PURE__ */ jsxs("div", { className: "absolute z-20 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg w-64 max-h-52 overflow-y-auto", children: [
                  /* @__PURE__ */ jsx("div", { className: "p-2 border-b border-gray-100", children: /* @__PURE__ */ jsx("span", { className: "text-xs font-semibold text-gray-500 uppercase tracking-wide", children: "Select Mentors" }) }),
                  mentors.length === 0 ? /* @__PURE__ */ jsx("p", { className: "px-3 py-2 text-xs text-gray-400", children: "No mentors available" }) : mentors.map((m) => /* @__PURE__ */ jsxs(
                    "label",
                    {
                      className: "flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer text-sm",
                      children: [
                        /* @__PURE__ */ jsx(
                          "input",
                          {
                            type: "checkbox",
                            checked: u.assignedMentors.includes(m.email),
                            onChange: () => toggleMentor(u.email, m.email, u.assignedMentors),
                            className: "accent-[#A52A2A]"
                          }
                        ),
                        /* @__PURE__ */ jsx("span", { className: "text-gray-700", children: m.name }),
                        /* @__PURE__ */ jsx("span", { className: "text-gray-400 text-xs ml-auto truncate max-w-[120px]", children: m.email })
                      ]
                    },
                    m.email
                  )),
                  /* @__PURE__ */ jsx("div", { className: "p-2 border-t border-gray-100", children: /* @__PURE__ */ jsx(
                    "button",
                    {
                      onClick: () => setMentorDropdownOpen(null),
                      className: "text-xs text-[#A52A2A] hover:underline w-full text-center",
                      children: "Done"
                    }
                  ) })
                ] })
              ] }) : /* @__PURE__ */ jsx("span", { className: "text-gray-400 text-xs", children: "—" }) }),
              /* @__PURE__ */ jsx("td", { className: "px-4 py-3", children: /* @__PURE__ */ jsxs("div", { className: "relative", children: [
                /* @__PURE__ */ jsx(
                  "button",
                  {
                    onClick: () => setLitwitsDocDropdownOpen(litwitsDocDropdownOpen === u.email ? null : u.email),
                    className: "text-left text-xs border border-gray-300 rounded px-2 py-1.5 w-44 truncate hover:border-[#A52A2A] transition-colors bg-white",
                    title: "Click to manage assigned LITWITS documents",
                    children: (u.assignedLitwitsDocs || []).length > 0 ? `${u.assignedLitwitsDocs.length} doc${u.assignedLitwitsDocs.length > 1 ? "s" : ""} assigned` : "No docs assigned"
                  }
                ),
                litwitsDocDropdownOpen === u.email && /* @__PURE__ */ jsxs("div", { className: "absolute z-20 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg w-64 max-h-52 overflow-y-auto", children: [
                  /* @__PURE__ */ jsx("div", { className: "p-2 border-b border-gray-100", children: /* @__PURE__ */ jsx("span", { className: "text-xs font-semibold text-gray-500 uppercase tracking-wide", children: "Select Documents" }) }),
                  litwitsDocs.map((doc) => /* @__PURE__ */ jsxs(
                    "label",
                    {
                      className: "flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer text-sm",
                      children: [
                        /* @__PURE__ */ jsx(
                          "input",
                          {
                            type: "checkbox",
                            checked: (u.assignedLitwitsDocs || []).includes(doc.id),
                            onChange: () => toggleLitwitsDocAssignment(u.email, doc.id, u.assignedLitwitsDocs || []),
                            className: "accent-[#A52A2A]"
                          }
                        ),
                        /* @__PURE__ */ jsx("span", { className: "text-gray-700", children: doc.title })
                      ]
                    },
                    doc.id
                  )),
                  /* @__PURE__ */ jsx("div", { className: "p-2 border-t border-gray-100", children: /* @__PURE__ */ jsx(
                    "button",
                    {
                      onClick: () => setLitwitsDocDropdownOpen(null),
                      className: "text-xs text-[#A52A2A] hover:underline w-full text-center",
                      children: "Done"
                    }
                  ) })
                ] })
              ] }) }),
              /* @__PURE__ */ jsx("td", { className: "px-4 py-3", children: /* @__PURE__ */ jsx(
                "input",
                {
                  type: "date",
                  value: u.validityStart || "",
                  onChange: (e) => updateUserValidity(u.email, "validityStart", e.target.value),
                  className: "border border-gray-300 rounded px-2 py-1 text-xs outline-none focus:border-[#A52A2A] w-32"
                }
              ) }),
              /* @__PURE__ */ jsx("td", { className: "px-4 py-3", children: /* @__PURE__ */ jsxs("div", { className: "flex flex-col gap-1", children: [
                /* @__PURE__ */ jsx(
                  "input",
                  {
                    type: "date",
                    value: u.validityEnd || "",
                    onChange: (e) => updateUserValidity(u.email, "validityEnd", e.target.value),
                    className: "border border-gray-300 rounded px-2 py-1 text-xs outline-none focus:border-[#A52A2A] w-32"
                  }
                ),
                u.role === "student" && /* @__PURE__ */ jsx(
                  ValidityBadge,
                  {
                    status: u.validityStatus,
                    daysUntilExpiry: u.daysUntilExpiry
                  }
                )
              ] }) }),
              /* @__PURE__ */ jsx("td", { className: "px-4 py-3", children: /* @__PURE__ */ jsx(
                "button",
                {
                  onClick: () => toggleUserStatus(u.email, u.status || "active"),
                  disabled: savingUser === u.email,
                  className: `inline-block px-2 py-0.5 rounded text-xs font-medium cursor-pointer ${(u.status || "active") === "active" ? "bg-green-100 text-green-700 hover:bg-green-200" : "bg-red-100 text-red-700 hover:bg-red-200"} transition-colors`,
                  children: (u.status || "active").charAt(0).toUpperCase() + (u.status || "active").slice(1)
                }
              ) }),
              /* @__PURE__ */ jsx("td", { className: "px-4 py-3", children: editingCell?.email === u.email && editingCell.field === "password" ? /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-1", children: [
                /* @__PURE__ */ jsx(
                  "input",
                  {
                    type: "text",
                    value: editValue,
                    onChange: (e) => setEditValue(e.target.value),
                    onKeyDown: (e) => {
                      if (e.key === "Enter") saveInlineEdit(u.email, "password", editValue);
                      if (e.key === "Escape") setEditingCell(null);
                    },
                    autoFocus: true,
                    className: "border border-[#A52A2A] rounded px-2 py-1 text-sm outline-none font-mono w-28"
                  }
                ),
                /* @__PURE__ */ jsx(
                  "button",
                  {
                    onClick: () => saveInlineEdit(u.email, "password", editValue),
                    className: "text-xs bg-[#A52A2A] text-white px-2 py-1 rounded hover:bg-[#8B1A1A]",
                    children: "Save"
                  }
                ),
                /* @__PURE__ */ jsx(
                  "button",
                  {
                    onClick: () => setEditingCell(null),
                    className: "text-xs text-gray-400 hover:text-gray-600",
                    children: "Cancel"
                  }
                )
              ] }) : /* @__PURE__ */ jsx(
                "span",
                {
                  className: "text-gray-600 font-mono text-xs cursor-pointer hover:bg-yellow-50 px-1 py-0.5 rounded",
                  onClick: () => startEdit(u.email, "password", u.password),
                  title: "Click to edit",
                  children: u.password
                }
              ) }),
              /* @__PURE__ */ jsx("td", { className: "px-4 py-3 text-center text-gray-600", children: u.role === "student" ? "4" : "—" }),
              /* @__PURE__ */ jsx("td", { className: "px-4 py-3", children: /* @__PURE__ */ jsx(
                "button",
                {
                  onClick: () => handleDelete(u.email),
                  disabled: savingUser === u.email,
                  className: "text-xs text-red-500 hover:underline disabled:opacity-50",
                  children: "Delete"
                }
              ) })
            ] }, u.email)),
            filteredUsers.length === 0 && /* @__PURE__ */ jsx("tr", { children: /* @__PURE__ */ jsx("td", { colSpan: 13, className: "px-4 py-8 text-center text-gray-400 text-sm", children: users.length === 0 ? "No users found. Create one using the Create User tab." : "No users match the current filters." }) })
          ] })
        ] }) })
      ] }),
      tab === "create" && /* @__PURE__ */ jsxs("div", { className: "max-w-lg", children: [
        /* @__PURE__ */ jsx(
          "h2",
          {
            className: "text-xl font-semibold text-gray-800 mb-6",
            style: { fontFamily: '"Playfair Display", serif' },
            children: "Create New User"
          }
        ),
        /* @__PURE__ */ jsxs("form", { onSubmit: handleCreate, className: "bg-white rounded-lg border border-gray-200 p-6 space-y-4", children: [
          [
            { label: "Full Name", key: "name", type: "text", required: true },
            { label: "Email Address", key: "email", type: "email", required: true },
            { label: "Password", key: "password", type: "text", required: true },
            { label: "Phone", key: "phone", type: "tel", required: false }
          ].map(({ label, key: key2, type, required }) => /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("label", { className: "block text-xs font-medium text-gray-600 mb-1 uppercase tracking-wide", children: label }),
            /* @__PURE__ */ jsx(
              "input",
              {
                type,
                required,
                value: form[key2],
                onChange: (e) => setForm({ ...form, [key2]: e.target.value }),
                className: "w-full border border-gray-300 rounded px-3 py-2 text-sm outline-none focus:border-[#A52A2A] transition-colors"
              }
            )
          ] }, key2)),
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("label", { className: "block text-xs font-medium text-gray-600 mb-1 uppercase tracking-wide", children: "Role" }),
            /* @__PURE__ */ jsx(
              "select",
              {
                value: form.role,
                onChange: (e) => setForm({ ...form, role: e.target.value }),
                className: "w-full border border-gray-300 rounded px-3 py-2 text-sm outline-none focus:border-[#A52A2A]",
                children: ROLES.map((r) => /* @__PURE__ */ jsx("option", { value: r, children: r.charAt(0).toUpperCase() + r.slice(1) }, r))
              }
            )
          ] }),
          formError && /* @__PURE__ */ jsx("p", { className: "text-xs text-red-600", children: formError }),
          formSuccess && /* @__PURE__ */ jsx("p", { className: "text-xs text-green-600", children: formSuccess }),
          form.role === "student" && /* @__PURE__ */ jsx("p", { className: "text-xs text-gray-500 bg-blue-50 px-3 py-2 rounded border border-blue-100", children: "All mentors will be automatically assigned to this student." }),
          form.role === "student" && /* @__PURE__ */ jsxs("div", { className: "space-y-3", children: [
            /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-3 gap-3", children: [
              /* @__PURE__ */ jsxs("div", { children: [
                /* @__PURE__ */ jsx("label", { className: "block text-xs font-medium text-gray-600 mb-1 uppercase tracking-wide", children: "Package" }),
                /* @__PURE__ */ jsxs(
                  "select",
                  {
                    value: form.packagePlan,
                    onChange: (e) => {
                      const plan = e.target.value;
                      setForm((prev) => {
                        const sessions = parseInt(prev.packageSessions || "0", 10) || 0;
                        const start = prev.validityStart || todayISO2();
                        return {
                          ...prev,
                          packagePlan: plan,
                          validityStart: prev.validityStart || start,
                          validityEnd: computeValidityEnd2(start, plan, sessions)
                        };
                      });
                    },
                    className: "w-full border border-gray-300 rounded px-3 py-2 text-sm outline-none focus:border-[#A52A2A]",
                    children: [
                      /* @__PURE__ */ jsx("option", { value: "numeric", children: "Numeric (per-session)" }),
                      /* @__PURE__ */ jsx("option", { value: "signature", children: "Signature (6 months)" }),
                      /* @__PURE__ */ jsx("option", { value: "platinum", children: "Platinum (12 months)" })
                    ]
                  }
                )
              ] }),
              /* @__PURE__ */ jsxs("div", { children: [
                /* @__PURE__ */ jsx("label", { className: "block text-xs font-medium text-gray-600 mb-1 uppercase tracking-wide", children: "Package of Sessions" }),
                /* @__PURE__ */ jsx(
                  "input",
                  {
                    type: "number",
                    min: 0,
                    disabled: form.packagePlan !== "numeric",
                    value: form.packageSessions,
                    onChange: (e) => {
                      const v = e.target.value;
                      setForm((prev) => {
                        const sessions = parseInt(v || "0", 10) || 0;
                        const start = prev.validityStart || todayISO2();
                        return {
                          ...prev,
                          packageSessions: v,
                          validityStart: prev.validityStart || start,
                          validityEnd: computeValidityEnd2(start, prev.packagePlan, sessions)
                        };
                      });
                    },
                    placeholder: form.packagePlan === "numeric" ? "e.g. 12" : "n/a",
                    className: "w-full border border-gray-300 rounded px-3 py-2 text-sm outline-none focus:border-[#A52A2A] transition-colors disabled:bg-gray-50 disabled:text-gray-400"
                  }
                )
              ] }),
              /* @__PURE__ */ jsxs("div", { children: [
                /* @__PURE__ */ jsx("label", { className: "block text-xs font-medium text-gray-600 mb-1 uppercase tracking-wide", children: "Session Type" }),
                /* @__PURE__ */ jsx(
                  "select",
                  {
                    value: form.sessionType,
                    onChange: (e) => setForm({ ...form, sessionType: e.target.value }),
                    className: "w-full border border-gray-300 rounded px-3 py-2 text-sm outline-none focus:border-[#A52A2A]",
                    children: ["Individual", "Group", "Renewals"].map((t) => /* @__PURE__ */ jsx("option", { value: t, children: t }, t))
                  }
                )
              ] })
            ] }),
            /* @__PURE__ */ jsxs("p", { className: "text-[11px] text-gray-500 bg-amber-50 border border-amber-100 rounded px-3 py-2", children: [
              "Validity end is auto-calculated:",
              " ",
              /* @__PURE__ */ jsx("b", { children: form.packagePlan === "signature" ? "6 months" : form.packagePlan === "platinum" ? "12 months" : `${parseInt(form.packageSessions || "0", 10) || 0} sessions × 7 days` }),
              " ",
              "from the start date. Both dates remain editable below."
            ] })
          ] }),
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("label", { className: "block text-xs font-medium text-gray-600 mb-2 uppercase tracking-wide", children: "Assign LITWITS Documents" }),
            /* @__PURE__ */ jsx("div", { className: "bg-gray-50 rounded border border-gray-200 p-3 space-y-1 max-h-48 overflow-y-auto", children: litwitsDocs.map((doc) => /* @__PURE__ */ jsxs("label", { className: "flex items-center gap-2 cursor-pointer text-sm py-1", children: [
              /* @__PURE__ */ jsx(
                "input",
                {
                  type: "checkbox",
                  checked: form.assignedLitwitsDocs.includes(doc.id),
                  onChange: () => {
                    const updated = form.assignedLitwitsDocs.includes(doc.id) ? form.assignedLitwitsDocs.filter((d) => d !== doc.id) : [...form.assignedLitwitsDocs, doc.id];
                    setForm({ ...form, assignedLitwitsDocs: updated });
                  },
                  className: "accent-[#A52A2A]"
                }
              ),
              /* @__PURE__ */ jsx("span", { className: "text-gray-700", children: doc.title })
            ] }, doc.id)) })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-2 gap-3", children: [
            /* @__PURE__ */ jsxs("div", { children: [
              /* @__PURE__ */ jsx("label", { className: "block text-xs font-medium text-gray-600 mb-1 uppercase tracking-wide", children: "Validity Start" }),
              /* @__PURE__ */ jsx(
                "input",
                {
                  type: "date",
                  value: form.validityStart,
                  onChange: (e) => {
                    const start = e.target.value;
                    setForm((prev) => ({
                      ...prev,
                      validityStart: start,
                      validityEnd: prev.role === "student" ? computeValidityEnd2(
                        start,
                        prev.packagePlan,
                        parseInt(prev.packageSessions || "0", 10) || 0
                      ) : prev.validityEnd
                    }));
                  },
                  className: "w-full border border-gray-300 rounded px-3 py-2 text-sm outline-none focus:border-[#A52A2A] transition-colors"
                }
              )
            ] }),
            /* @__PURE__ */ jsxs("div", { children: [
              /* @__PURE__ */ jsx("label", { className: "block text-xs font-medium text-gray-600 mb-1 uppercase tracking-wide", children: "Validity End" }),
              /* @__PURE__ */ jsx(
                "input",
                {
                  type: "date",
                  value: form.validityEnd,
                  onChange: (e) => setForm({ ...form, validityEnd: e.target.value }),
                  className: "w-full border border-gray-300 rounded px-3 py-2 text-sm outline-none focus:border-[#A52A2A] transition-colors"
                }
              )
            ] })
          ] }),
          /* @__PURE__ */ jsx(
            "button",
            {
              type: "submit",
              className: "w-full bg-[#A52A2A] text-white py-2.5 text-xs tracking-widest uppercase font-medium hover:bg-[#8B1A1A] transition-colors rounded",
              children: "Create User"
            }
          )
        ] })
      ] }),
      tab === "bulk" && /* @__PURE__ */ jsxs("div", { className: "max-w-4xl space-y-10", children: [
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx(
            "h2",
            {
              className: "text-2xl font-semibold text-gray-800",
              style: { fontFamily: '"Playfair Display", serif' },
              children: "Bulk User Upload"
            }
          ),
          /* @__PURE__ */ jsx("p", { className: "text-sm text-gray-500 mt-1", children: "Manage user imports, document uploads, and version history from one place." })
        ] }),
        /* @__PURE__ */ jsxs("section", { children: [
          /* @__PURE__ */ jsx(
            "h3",
            {
              className: "text-lg font-semibold text-gray-800 mb-2",
              style: { fontFamily: '"Playfair Display", serif' },
              children: "Section 1 · Bulk User Upload"
            }
          ),
          /* @__PURE__ */ jsx("p", { className: "text-sm text-gray-500 mb-4", children: "Upload an Excel (.xlsx, .xls) or CSV file with the following columns:" }),
          /* @__PURE__ */ jsxs("div", { className: "text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded p-3 mb-4 leading-relaxed", children: [
            /* @__PURE__ */ jsx("code", { className: "font-mono", children: "Name, Email, Phone, Role, Assigned Mentors, Documents Shared, Package, Package of Sessions, Session Type, Validity Start, Validity End, Status, Password" }),
            /* @__PURE__ */ jsxs("ul", { className: "mt-2 ml-4 list-disc text-[11px] text-gray-500 space-y-0.5", children: [
              /* @__PURE__ */ jsxs("li", { children: [
                /* @__PURE__ */ jsx("b", { children: "Assigned Mentors" }),
                " and ",
                /* @__PURE__ */ jsx("b", { children: "Documents Shared" }),
                " may contain comma- or semicolon-separated values."
              ] }),
              /* @__PURE__ */ jsxs("li", { children: [
                "Mentors are auto-assigned to students ",
                /* @__PURE__ */ jsx("i", { children: "only" }),
                " when the Assigned Mentors column is empty."
              ] }),
              /* @__PURE__ */ jsxs("li", { children: [
                /* @__PURE__ */ jsx("b", { children: "Package" }),
                " may be a number, ",
                /* @__PURE__ */ jsx("code", { children: "Signature" }),
                " (6 months) or ",
                /* @__PURE__ */ jsx("code", { children: "Platinum" }),
                " (12 months). Validity end is auto-calculated when blank."
              ] }),
              /* @__PURE__ */ jsxs("li", { children: [
                /* @__PURE__ */ jsx("b", { children: "Validity Start / End" }),
                " accept date strings (YYYY-MM-DD) or Excel date cells."
              ] }),
              /* @__PURE__ */ jsxs("li", { children: [
                /* @__PURE__ */ jsx("b", { children: "Status" }),
                " defaults to ",
                /* @__PURE__ */ jsx("code", { children: "active" }),
                " when omitted; ",
                /* @__PURE__ */ jsx("b", { children: "Role" }),
                " defaults to ",
                /* @__PURE__ */ jsx("code", { children: "student" }),
                "."
              ] })
            ] })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "bg-white rounded-lg border border-gray-200 p-6 space-y-4", children: [
            /* @__PURE__ */ jsxs("div", { children: [
              /* @__PURE__ */ jsx("label", { className: "block text-xs font-medium text-gray-600 mb-2 uppercase tracking-wide", children: "Select File" }),
              /* @__PURE__ */ jsx(
                "input",
                {
                  type: "file",
                  accept: ".xlsx,.xls,.csv",
                  onChange: handleBulkFile,
                  className: "block w-full text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-xs file:font-medium file:bg-[#A52A2A] file:text-white hover:file:bg-[#8B1A1A] file:cursor-pointer"
                }
              )
            ] }),
            bulkStatus && /* @__PURE__ */ jsx("p", { className: "text-sm text-gray-600 bg-gray-50 px-3 py-2 rounded border border-gray-200", children: bulkStatus }),
            bulkRows.length > 0 && /* @__PURE__ */ jsxs(Fragment, { children: [
              /* @__PURE__ */ jsx("div", { className: "overflow-x-auto border border-gray-200 rounded max-h-64", children: /* @__PURE__ */ jsxs("table", { className: "min-w-full text-xs", children: [
                /* @__PURE__ */ jsx("thead", { className: "bg-gray-50 border-b border-gray-200", children: /* @__PURE__ */ jsx("tr", { children: Object.keys(bulkRows[0]).map((k) => /* @__PURE__ */ jsx("th", { className: "px-3 py-2 text-left font-semibold text-gray-500 whitespace-nowrap", children: k }, k)) }) }),
                /* @__PURE__ */ jsx("tbody", { className: "divide-y divide-gray-100", children: bulkRows.slice(0, 20).map((row, i) => /* @__PURE__ */ jsx("tr", { children: Object.values(row).map((v, j) => /* @__PURE__ */ jsx("td", { className: "px-3 py-2 text-gray-700 whitespace-nowrap", children: String(v) }, j)) }, i)) })
              ] }) }),
              /* @__PURE__ */ jsxs(
                "button",
                {
                  onClick: handleBulkImport,
                  className: "bg-[#A52A2A] text-white px-6 py-2.5 text-xs tracking-widest uppercase font-medium hover:bg-[#8B1A1A] transition-colors rounded",
                  children: [
                    "Import ",
                    bulkRows.length,
                    " Users"
                  ]
                }
              )
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsxs("section", { children: [
          /* @__PURE__ */ jsx(
            "h3",
            {
              className: "text-lg font-semibold text-gray-800 mb-2",
              style: { fontFamily: '"Playfair Display", serif' },
              children: "Section 2 · AR Bulk Upload"
            }
          ),
          /* @__PURE__ */ jsx("p", { className: "text-sm text-gray-500 mb-4", children: "Upload an Excel file with the Attendance Report columns. Existing students are matched by Email and updated; new emails create a student record. Uploaded Attended is converted to a manual adjustment so SR data is never overwritten." }),
          /* @__PURE__ */ jsxs("div", { className: "text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded p-3 mb-4 leading-relaxed", children: [
            /* @__PURE__ */ jsx("code", { className: "font-mono", children: "Name, Email, School Board, Parent Name, GMB Review, Remarks, Enrolled Sessions, Attended Sessions, Session Type" }),
            /* @__PURE__ */ jsxs("ul", { className: "mt-2 ml-4 list-disc text-[11px] text-gray-500 space-y-0.5", children: [
              /* @__PURE__ */ jsxs("li", { children: [
                "Match is by ",
                /* @__PURE__ */ jsx("b", { children: "Email" }),
                " (case-insensitive). Existing → update; new → create."
              ] }),
              /* @__PURE__ */ jsxs("li", { children: [
                /* @__PURE__ */ jsx("b", { children: "Enrolled Sessions" }),
                " sets the student's package size."
              ] }),
              /* @__PURE__ */ jsxs("li", { children: [
                /* @__PURE__ */ jsx("b", { children: "Attended Sessions" }),
                " becomes ",
                /* @__PURE__ */ jsx("i", { children: "Manual Adjustment = Uploaded Attended − SR Count" }),
                "."
              ] }),
              /* @__PURE__ */ jsx("li", { children: "Attended > Enrolled is rejected for numeric packages (Signature/Platinum are unlimited)." }),
              /* @__PURE__ */ jsxs("li", { children: [
                /* @__PURE__ */ jsx("b", { children: "Session Type" }),
                " may be Group, Individual, or Renewals."
              ] })
            ] })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "bg-white rounded-lg border border-gray-200 p-6 space-y-4", children: [
            /* @__PURE__ */ jsxs("div", { children: [
              /* @__PURE__ */ jsx("label", { className: "block text-xs font-medium text-gray-600 mb-2 uppercase tracking-wide", children: "Select File" }),
              /* @__PURE__ */ jsx(
                "input",
                {
                  type: "file",
                  accept: ".xlsx,.xls,.csv",
                  onChange: handleArBulkFile,
                  className: "block w-full text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-xs file:font-medium file:bg-[#A52A2A] file:text-white hover:file:bg-[#8B1A1A] file:cursor-pointer"
                }
              )
            ] }),
            arBulkStatus && /* @__PURE__ */ jsx("p", { className: "text-sm text-gray-600 bg-gray-50 px-3 py-2 rounded border border-gray-200", children: arBulkStatus }),
            arBulkRows.length > 0 && /* @__PURE__ */ jsxs(Fragment, { children: [
              /* @__PURE__ */ jsx("div", { className: "overflow-x-auto border border-gray-200 rounded max-h-64", children: /* @__PURE__ */ jsxs("table", { className: "min-w-full text-xs", children: [
                /* @__PURE__ */ jsx("thead", { className: "bg-gray-50 border-b border-gray-200", children: /* @__PURE__ */ jsx("tr", { children: Object.keys(arBulkRows[0]).map((k) => /* @__PURE__ */ jsx("th", { className: "px-3 py-2 text-left font-semibold text-gray-500 whitespace-nowrap", children: k }, k)) }) }),
                /* @__PURE__ */ jsx("tbody", { className: "divide-y divide-gray-100", children: arBulkRows.slice(0, 20).map((row, i) => /* @__PURE__ */ jsx("tr", { children: Object.values(row).map((v, j) => /* @__PURE__ */ jsx("td", { className: "px-3 py-2 text-gray-700 whitespace-nowrap", children: String(v) }, j)) }, i)) })
              ] }) }),
              /* @__PURE__ */ jsxs(
                "button",
                {
                  onClick: handleArBulkImport,
                  className: "bg-[#A52A2A] text-white px-6 py-2.5 text-xs tracking-widest uppercase font-medium hover:bg-[#8B1A1A] transition-colors rounded",
                  children: [
                    "Import ",
                    arBulkRows.length,
                    " AR Rows"
                  ]
                }
              )
            ] }),
            arBulkErrors.length > 0 && /* @__PURE__ */ jsxs("div", { className: "border border-amber-200 bg-amber-50 rounded p-3", children: [
              /* @__PURE__ */ jsxs("h4", { className: "text-xs font-semibold text-amber-700 uppercase tracking-wide mb-2", children: [
                "Errors Panel (",
                arBulkErrors.length,
                ")"
              ] }),
              /* @__PURE__ */ jsx("ul", { className: "text-xs space-y-1 max-h-48 overflow-auto", children: arBulkErrors.map((e, i) => /* @__PURE__ */ jsxs("li", { className: "flex gap-2", children: [
                /* @__PURE__ */ jsx("span", { className: "font-medium text-amber-800 min-w-[120px]", children: e.name }),
                /* @__PURE__ */ jsx("span", { className: "text-amber-700", children: e.issue }),
                /* @__PURE__ */ jsx("span", { className: "text-gray-500 ml-auto", children: e.action })
              ] }, i)) })
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsxs("section", { children: [
          /* @__PURE__ */ jsx(
            "h3",
            {
              className: "text-lg font-semibold text-gray-800 mb-2",
              style: { fontFamily: '"Playfair Display", serif' },
              children: "Section 3 · SR Bulk Upload"
            }
          ),
          /* @__PURE__ */ jsx("p", { className: "text-sm text-gray-500 mb-4", children: "Upload an Excel file with Session Report rows. Each valid row counts as one attended session. Sessions under 5 minutes are skipped, and duplicates (same student × same date) are removed automatically." }),
          /* @__PURE__ */ jsxs("div", { className: "text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded p-3 mb-4 leading-relaxed", children: [
            /* @__PURE__ */ jsx("code", { className: "font-mono", children: "Date, Student Name, Duration, Mentor, Topic" }),
            /* @__PURE__ */ jsxs("ul", { className: "mt-2 ml-4 list-disc text-[11px] text-gray-500 space-y-0.5", children: [
              /* @__PURE__ */ jsx("li", { children: "Date may be an Excel date or YYYY-MM-DD string." }),
              /* @__PURE__ */ jsx("li", { children: "Duration is in minutes; rows under 5 are dropped." }),
              /* @__PURE__ */ jsx("li", { children: 'Names are matched against Manage Users (case-insensitive). Unmatched → "Name (Discovery Student)".' }),
              /* @__PURE__ */ jsx("li", { children: "Each valid row contributes one session date — feeds the SR Count used by both AR and Manage Users." })
            ] })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "bg-white rounded-lg border border-gray-200 p-6 space-y-4", children: [
            /* @__PURE__ */ jsxs("div", { children: [
              /* @__PURE__ */ jsx("label", { className: "block text-xs font-medium text-gray-600 mb-2 uppercase tracking-wide", children: "Select File" }),
              /* @__PURE__ */ jsx(
                "input",
                {
                  type: "file",
                  accept: ".xlsx,.xls,.csv",
                  onChange: handleSrBulkFile,
                  className: "block w-full text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-xs file:font-medium file:bg-[#A52A2A] file:text-white hover:file:bg-[#8B1A1A] file:cursor-pointer"
                }
              )
            ] }),
            srBulkStatus && /* @__PURE__ */ jsx("p", { className: "text-sm text-gray-600 bg-gray-50 px-3 py-2 rounded border border-gray-200", children: srBulkStatus }),
            srBulkRows.length > 0 && /* @__PURE__ */ jsxs(Fragment, { children: [
              /* @__PURE__ */ jsx("div", { className: "overflow-x-auto border border-gray-200 rounded max-h-64", children: /* @__PURE__ */ jsxs("table", { className: "min-w-full text-xs", children: [
                /* @__PURE__ */ jsx("thead", { className: "bg-gray-50 border-b border-gray-200", children: /* @__PURE__ */ jsx("tr", { children: Object.keys(srBulkRows[0]).map((k) => /* @__PURE__ */ jsx("th", { className: "px-3 py-2 text-left font-semibold text-gray-500 whitespace-nowrap", children: k }, k)) }) }),
                /* @__PURE__ */ jsx("tbody", { className: "divide-y divide-gray-100", children: srBulkRows.slice(0, 20).map((row, i) => /* @__PURE__ */ jsx("tr", { children: Object.values(row).map((v, j) => /* @__PURE__ */ jsx("td", { className: "px-3 py-2 text-gray-700 whitespace-nowrap", children: String(v) }, j)) }, i)) })
              ] }) }),
              /* @__PURE__ */ jsxs(
                "button",
                {
                  onClick: handleSrBulkImport,
                  className: "bg-[#A52A2A] text-white px-6 py-2.5 text-xs tracking-widest uppercase font-medium hover:bg-[#8B1A1A] transition-colors rounded",
                  children: [
                    "Import ",
                    srBulkRows.length,
                    " SR Rows"
                  ]
                }
              )
            ] }),
            srBulkErrors.length > 0 && /* @__PURE__ */ jsxs("div", { className: "border border-amber-200 bg-amber-50 rounded p-3", children: [
              /* @__PURE__ */ jsxs("h4", { className: "text-xs font-semibold text-amber-700 uppercase tracking-wide mb-2", children: [
                "Errors Panel (",
                srBulkErrors.length,
                ")"
              ] }),
              /* @__PURE__ */ jsx("ul", { className: "text-xs space-y-1 max-h-48 overflow-auto", children: srBulkErrors.map((e, i) => /* @__PURE__ */ jsxs("li", { className: "flex gap-2", children: [
                /* @__PURE__ */ jsx("span", { className: "font-medium text-amber-800 min-w-[160px]", children: e.name }),
                /* @__PURE__ */ jsx("span", { className: "text-amber-700", children: e.issue }),
                /* @__PURE__ */ jsx("span", { className: "text-gray-500 ml-auto", children: e.action })
              ] }, i)) })
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsxs("section", { children: [
          /* @__PURE__ */ jsx(
            "h3",
            {
              className: "text-lg font-semibold text-gray-800 mb-2",
              style: { fontFamily: '"Playfair Display", serif' },
              children: "Section 4 · Upload Document"
            }
          ),
          /* @__PURE__ */ jsx("p", { className: "text-sm text-gray-500 mb-4", children: "Upload a DOCX or PDF file to import content into a LITWITS document. The document will be parsed, formatting preserved, and mapped to the selected document type." }),
          /* @__PURE__ */ jsxs("div", { className: "bg-white rounded-lg border border-gray-200 p-6 space-y-5", children: [
            /* @__PURE__ */ jsxs("div", { children: [
              /* @__PURE__ */ jsx("label", { className: "block text-xs font-medium text-gray-600 mb-1 uppercase tracking-wide", children: "Document Type" }),
              /* @__PURE__ */ jsxs(
                "select",
                {
                  value: uploadDocType,
                  onChange: (e) => setUploadDocType(e.target.value),
                  className: "w-full border border-gray-300 rounded px-3 py-2 text-sm outline-none focus:border-[#A52A2A] transition-colors",
                  children: [
                    /* @__PURE__ */ jsx("option", { value: "", children: "Select document type..." }),
                    UPLOAD_DOC_TYPES.map((doc) => /* @__PURE__ */ jsx("option", { value: doc.id, children: doc.title }, doc.id))
                  ]
                }
              )
            ] }),
            /* @__PURE__ */ jsxs("div", { children: [
              /* @__PURE__ */ jsx("label", { className: "block text-xs font-medium text-gray-600 mb-1 uppercase tracking-wide", children: "Select File (.docx or .pdf)" }),
              /* @__PURE__ */ jsx(
                "input",
                {
                  type: "file",
                  accept: ".docx,.pdf",
                  onChange: handleUploadFileChange,
                  className: "block w-full text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-xs file:font-medium file:bg-[#A52A2A] file:text-white hover:file:bg-[#8B1A1A] file:cursor-pointer"
                }
              ),
              uploadFile && /* @__PURE__ */ jsxs("p", { className: "text-xs text-gray-500 mt-1", children: [
                "Selected: ",
                uploadFile.name,
                " (",
                (uploadFile.size / 1024).toFixed(1),
                " KB)"
              ] })
            ] }),
            uploadDocType && /* @__PURE__ */ jsxs("p", { className: "text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded border border-amber-200", children: [
              'If content already exists for "',
              UPLOAD_DOC_TYPES.find((d) => d.id === uploadDocType)?.title,
              '", it will be replaced. Previous versions are saved in Version History.'
            ] }),
            /* @__PURE__ */ jsx(
              "button",
              {
                onClick: handleUploadParse,
                disabled: !uploadFile || !uploadDocType || uploadParsing,
                className: "bg-[#A52A2A] text-white px-6 py-2.5 text-xs tracking-widest uppercase font-medium hover:bg-[#8B1A1A] transition-colors rounded disabled:opacity-50",
                children: uploadParsing ? "Parsing..." : "Parse Document"
              }
            ),
            uploadStatus && /* @__PURE__ */ jsx("p", { className: `text-sm px-3 py-2 rounded border ${uploadStatus.startsWith("Error") || uploadStatus.startsWith("Failed") || uploadStatus === "Only .docx and .pdf files are supported." ? "bg-red-50 text-red-700 border-red-200" : uploadStatus.includes("successfully") ? "bg-green-50 text-green-700 border-green-200" : "bg-blue-50 text-blue-700 border-blue-200"}`, children: uploadStatus }),
            uploadPreview && /* @__PURE__ */ jsxs("div", { children: [
              /* @__PURE__ */ jsx("h4", { className: "text-sm font-semibold text-gray-700 mb-2", children: "Preview" }),
              /* @__PURE__ */ jsx(
                "div",
                {
                  className: "border border-gray-200 rounded p-4 max-h-96 overflow-y-auto prose prose-sm max-w-none bg-gray-50",
                  dangerouslySetInnerHTML: { __html: uploadPreview }
                }
              ),
              /* @__PURE__ */ jsx(
                "button",
                {
                  onClick: handleUploadSave,
                  className: "mt-4 bg-[#A52A2A] text-white px-6 py-2.5 text-xs tracking-widest uppercase font-medium hover:bg-[#8B1A1A] transition-colors rounded",
                  children: "Upload to Document"
                }
              )
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsxs("section", { children: [
          /* @__PURE__ */ jsx(
            "h3",
            {
              className: "text-lg font-semibold text-gray-800 mb-2",
              style: { fontFamily: '"Playfair Display", serif' },
              children: "Section 5 · Document Version History"
            }
          ),
          /* @__PURE__ */ jsx("p", { className: "text-sm text-gray-500 mb-4", children: "Browse, preview, and restore previous versions of any LITWITS document." }),
          /* @__PURE__ */ jsxs("div", { className: "bg-white rounded-lg border border-gray-200 p-6 space-y-4", children: [
            /* @__PURE__ */ jsx("div", { className: "flex items-end gap-3", children: /* @__PURE__ */ jsxs("div", { children: [
              /* @__PURE__ */ jsx("label", { className: "block text-xs text-gray-500 mb-1", children: "Select Document" }),
              /* @__PURE__ */ jsxs(
                "select",
                {
                  value: versionDocId,
                  onChange: (e) => {
                    if (e.target.value) fetchVersions(e.target.value);
                  },
                  className: "border border-gray-300 rounded px-3 py-1.5 text-sm outline-none focus:border-[#A52A2A] min-w-[240px]",
                  children: [
                    /* @__PURE__ */ jsx("option", { value: "", children: "Choose a document..." }),
                    litwitsDocs.map((doc) => /* @__PURE__ */ jsx("option", { value: doc.id, children: doc.title }, doc.id))
                  ]
                }
              )
            ] }) }),
            versionsLoading ? /* @__PURE__ */ jsx("p", { className: "text-gray-400 text-sm", children: "Loading versions..." }) : versionDocId ? /* @__PURE__ */ jsxs("div", { className: "flex gap-6", children: [
              /* @__PURE__ */ jsx("div", { className: "w-72 shrink-0", children: /* @__PURE__ */ jsxs("div", { className: "bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden", children: [
                /* @__PURE__ */ jsx("div", { className: "bg-gray-50 px-4 py-2 border-b border-gray-200", children: /* @__PURE__ */ jsxs("h4", { className: "text-xs font-semibold text-gray-500 uppercase tracking-wide", children: [
                  "Versions (",
                  versions.length,
                  ")"
                ] }) }),
                /* @__PURE__ */ jsxs("div", { className: "max-h-96 overflow-y-auto divide-y divide-gray-100", children: [
                  versions.map((v) => /* @__PURE__ */ jsxs(
                    "div",
                    {
                      className: `px-4 py-3 cursor-pointer hover:bg-gray-50 ${versionViewTimestamp === v.timestamp ? "bg-blue-50 border-l-2 border-[#A52A2A]" : ""}`,
                      onClick: () => viewVersion(versionDocId, v.timestamp),
                      children: [
                        /* @__PURE__ */ jsx("div", { className: "text-xs text-gray-800 font-medium", children: v.editedBy }),
                        /* @__PURE__ */ jsx("div", { className: "text-[10px] text-gray-400 mt-0.5", children: new Date(v.timestamp).toLocaleString() }),
                        /* @__PURE__ */ jsx(
                          "button",
                          {
                            onClick: (e) => {
                              e.stopPropagation();
                              restoreVersion(versionDocId, v.timestamp);
                            },
                            className: "text-[10px] text-[#A52A2A] hover:underline mt-1 block",
                            children: "Restore this version"
                          }
                        )
                      ]
                    },
                    v.timestamp
                  )),
                  versions.length === 0 && /* @__PURE__ */ jsx("div", { className: "px-4 py-8 text-center text-gray-400 text-xs", children: "No versions found for this document." })
                ] })
              ] }) }),
              versionContent !== null && /* @__PURE__ */ jsxs("div", { className: "flex-1 bg-white rounded-lg border border-gray-200 p-6 overflow-y-auto max-h-[500px]", children: [
                /* @__PURE__ */ jsxs("h4", { className: "text-sm font-semibold text-gray-700 mb-3", children: [
                  "Version Preview — ",
                  versionViewTimestamp && new Date(versionViewTimestamp).toLocaleString()
                ] }),
                /* @__PURE__ */ jsx(
                  "div",
                  {
                    className: "prose prose-sm max-w-none",
                    dangerouslySetInnerHTML: { __html: versionContent }
                  }
                )
              ] })
            ] }) : /* @__PURE__ */ jsx("p", { className: "text-gray-400 text-sm", children: "Select a document to view its version history." })
          ] })
        ] })
      ] }),
      tab === "renewals" && /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between mb-4", children: [
          /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3", children: [
            /* @__PURE__ */ jsx(
              "h2",
              {
                className: "text-xl font-semibold text-gray-800",
                style: { fontFamily: '"Playfair Display", serif' },
                children: "Renewals"
              }
            ),
            /* @__PURE__ */ jsx(SyncStatusPill, { state: syncState, message: syncStateMessage })
          ] }),
          /* @__PURE__ */ jsx(
            "button",
            {
              onClick: () => fetchUsers(),
              className: "text-xs text-[#A52A2A] hover:underline",
              children: "Refresh"
            }
          )
        ] }),
        /* @__PURE__ */ jsxs("p", { className: "text-xs text-gray-500 mb-4", children: [
          "Students appear here once their validity has expired or (for Individual / numeric packages) their attended count has caught up to the package size. Group packages renew on either condition. Click ",
          /* @__PURE__ */ jsx("b", { children: "Re-add" }),
          " to start a new set — the next start date is auto-set."
        ] }),
        renewalUsers.length === 0 ? /* @__PURE__ */ jsx("div", { className: "bg-white border border-gray-200 rounded p-6 text-sm text-gray-400 text-center", children: "No students need renewal right now." }) : /* @__PURE__ */ jsx("div", { className: "overflow-x-auto bg-white rounded-lg border border-gray-200 shadow-sm", children: /* @__PURE__ */ jsxs("table", { className: "min-w-full text-sm", children: [
          /* @__PURE__ */ jsx("thead", { children: /* @__PURE__ */ jsx("tr", { className: "bg-gray-50 border-b border-gray-200", children: ["Name", "Session Type", "Sessions", "Validity End", "Status", "Next Set Starts", "Action"].map((h) => /* @__PURE__ */ jsx("th", { className: "text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap", children: h }, h)) }) }),
          /* @__PURE__ */ jsx("tbody", { className: "divide-y divide-gray-100", children: renewalUsers.map((u) => {
            const baseEnd = u.validityEnd || todayISO2();
            const today = todayISO2();
            const nextStart = baseEnd > today ? addDaysISO2(baseEnd, 1) : today;
            return /* @__PURE__ */ jsxs("tr", { className: "hover:bg-gray-50", children: [
              /* @__PURE__ */ jsx("td", { className: "px-4 py-3 font-medium text-gray-800", children: u.name }),
              /* @__PURE__ */ jsx("td", { className: "px-4 py-3 text-xs text-gray-600", children: u.sessionType || "—" }),
              /* @__PURE__ */ jsxs("td", { className: "px-4 py-3 font-mono text-xs", children: [
                u.attendedSessions ?? 0,
                " / ",
                u.packageSessions ?? 0,
                u.packagePlan && u.packagePlan !== "numeric" ? /* @__PURE__ */ jsx("span", { className: "ml-2 text-[10px] text-purple-600 uppercase font-semibold", children: u.packagePlan }) : null
              ] }),
              /* @__PURE__ */ jsxs("td", { className: "px-4 py-3 text-xs text-gray-600", children: [
                u.validityEnd || "—",
                /* @__PURE__ */ jsx("div", { className: "mt-1", children: /* @__PURE__ */ jsx(
                  ValidityBadge,
                  {
                    status: u.validityStatus,
                    daysUntilExpiry: u.daysUntilExpiry
                  }
                ) })
              ] }),
              /* @__PURE__ */ jsx("td", { className: "px-4 py-3", children: /* @__PURE__ */ jsx("span", { className: `inline-block px-2 py-0.5 rounded text-xs font-medium ${(u.status || "active") === "active" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`, children: u.status || "active" }) }),
              /* @__PURE__ */ jsx("td", { className: "px-4 py-3 text-xs text-gray-700", children: /* @__PURE__ */ jsxs("span", { className: "font-mono", children: [
                "NEW SET : ",
                nextStart
              ] }) }),
              /* @__PURE__ */ jsx("td", { className: "px-4 py-3", children: /* @__PURE__ */ jsx(
                "button",
                {
                  onClick: () => handleReAdd(u),
                  disabled: savingUser === u.email,
                  className: "text-xs bg-[#A52A2A] text-white px-3 py-1.5 rounded hover:bg-[#8B1A1A] transition-colors disabled:opacity-50",
                  children: "Re-add"
                }
              ) })
            ] }, u.email);
          }) })
        ] }) })
      ] }),
      tab === "activity-logs" && /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx(
          "h2",
          {
            className: "text-xl font-semibold text-gray-800 mb-4",
            style: { fontFamily: '"Playfair Display", serif' },
            children: "Document Activity Logs"
          }
        ),
        /* @__PURE__ */ jsxs("div", { className: "flex items-end gap-3 mb-4 flex-wrap", children: [
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("label", { className: "block text-xs text-gray-500 mb-1", children: "Filter by User" }),
            /* @__PURE__ */ jsx(
              "input",
              {
                type: "text",
                value: activityFilterUser,
                onChange: (e) => setActivityFilterUser(e.target.value),
                placeholder: "user@email.com",
                className: "border border-gray-300 rounded px-3 py-1.5 text-sm outline-none focus:border-[#A52A2A] w-48"
              }
            )
          ] }),
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("label", { className: "block text-xs text-gray-500 mb-1", children: "Filter by Document" }),
            /* @__PURE__ */ jsxs(
              "select",
              {
                value: activityFilterDoc,
                onChange: (e) => setActivityFilterDoc(e.target.value),
                className: "border border-gray-300 rounded px-3 py-1.5 text-sm outline-none focus:border-[#A52A2A]",
                children: [
                  /* @__PURE__ */ jsx("option", { value: "", children: "All Documents" }),
                  litwitsDocs.map((doc) => /* @__PURE__ */ jsx("option", { value: doc.id, children: doc.title }, doc.id))
                ]
              }
            )
          ] }),
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("label", { className: "block text-xs text-gray-500 mb-1", children: "Filter by Date" }),
            /* @__PURE__ */ jsx(
              "input",
              {
                type: "date",
                value: activityFilterDate,
                onChange: (e) => setActivityFilterDate(e.target.value),
                className: "border border-gray-300 rounded px-3 py-1.5 text-sm outline-none focus:border-[#A52A2A]"
              }
            )
          ] }),
          /* @__PURE__ */ jsx(
            "button",
            {
              onClick: fetchActivityLogs,
              className: "bg-[#A52A2A] text-white px-4 py-1.5 rounded text-xs uppercase tracking-wide hover:bg-[#8B1A1A] transition-colors",
              children: "Search"
            }
          ),
          /* @__PURE__ */ jsx(
            "button",
            {
              onClick: () => {
                setActivityFilterUser("");
                setActivityFilterDoc("");
                setActivityFilterDate("");
                fetchActivityLogs();
              },
              className: "text-xs text-gray-500 hover:text-[#A52A2A]",
              children: "Clear Filters"
            }
          )
        ] }),
        activityLoading ? /* @__PURE__ */ jsx("p", { className: "text-gray-400 text-sm", children: "Loading..." }) : /* @__PURE__ */ jsx("div", { className: "overflow-x-auto bg-white rounded-lg border border-gray-200 shadow-sm", children: /* @__PURE__ */ jsxs("table", { className: "min-w-full text-sm", children: [
          /* @__PURE__ */ jsx("thead", { children: /* @__PURE__ */ jsx("tr", { className: "bg-gray-50 border-b border-gray-200", children: ["User", "Role", "Document", "Action", "Duration", "Timestamp"].map((h) => /* @__PURE__ */ jsx("th", { className: "text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap", children: h }, h)) }) }),
          /* @__PURE__ */ jsxs("tbody", { className: "divide-y divide-gray-100", children: [
            activityLogs.map((log, i) => /* @__PURE__ */ jsxs("tr", { className: "hover:bg-gray-50", children: [
              /* @__PURE__ */ jsx("td", { className: "px-4 py-3 text-gray-800", children: log.userName }),
              /* @__PURE__ */ jsx("td", { className: "px-4 py-3", children: /* @__PURE__ */ jsx("span", { className: `inline-block px-2 py-0.5 rounded text-xs font-medium ${log.userRole === "admin" ? "bg-red-100 text-red-700" : log.userRole === "mentor" ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700"}`, children: log.userRole }) }),
              /* @__PURE__ */ jsx("td", { className: "px-4 py-3 text-gray-600", children: log.documentId }),
              /* @__PURE__ */ jsx("td", { className: "px-4 py-3", children: /* @__PURE__ */ jsx("span", { className: `inline-block px-2 py-0.5 rounded text-xs ${log.action === "edited" ? "bg-yellow-100 text-yellow-700" : log.action === "opened" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-700"}`, children: log.action }) }),
              /* @__PURE__ */ jsx("td", { className: "px-4 py-3 text-gray-600", children: log.duration > 0 ? `${Math.round(log.duration / 60)}m ${log.duration % 60}s` : "-" }),
              /* @__PURE__ */ jsx("td", { className: "px-4 py-3 text-gray-500 text-xs", children: new Date(log.timestamp).toLocaleString() })
            ] }, i)),
            activityLogs.length === 0 && /* @__PURE__ */ jsx("tr", { children: /* @__PURE__ */ jsx("td", { colSpan: 6, className: "px-4 py-8 text-center text-gray-400 text-sm", children: "No activity logs found." }) })
          ] })
        ] }) })
      ] })
    ] })
  ] });
}
const $$splitComponentImporter$1 = () => import("./index-dNGsRyvf.js");
const Route$j = createFileRoute("/")({
  component: lazyRouteComponent($$splitComponentImporter$1, "component")
});
const $$splitComponentImporter = () => import("./_slug-C5qyTnGQ.js");
const Route$i = createFileRoute("/blog/$slug")({
  component: lazyRouteComponent($$splitComponentImporter, "component")
});
function getAuthSecret() {
  return process.env.AUTH_SECRET || process.env.VITE_AUTH_SECRET || "litwits-dev-auth-secret-change-me";
}
function getSupabase() {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY || "";
  if (!url || !serviceKey) return null;
  return { url, serviceKey };
}
function requireSupabase() {
  const c = getSupabase();
  if (!c) {
    throw new Error(
      "Database not configured: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env"
    );
  }
  return c;
}
const B64 = {
  enc: (s) => Buffer.from(s, "utf8").toString("base64url"),
  dec: (s) => Buffer.from(s, "base64url").toString("utf8")
};
function signSession(payload, ttlSec = 60 * 60 * 24 * 30) {
  const body = {
    ...payload,
    exp: Math.floor(Date.now() / 1e3) + ttlSec
  };
  const data = B64.enc(JSON.stringify(body));
  const sig = createHmac("sha256", getAuthSecret()).update(data).digest("base64url");
  return `${data}.${sig}`;
}
function verifySession(token) {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [data, sig] = parts;
  const expected = createHmac("sha256", getAuthSecret()).update(data).digest();
  let sigBuf;
  try {
    sigBuf = Buffer.from(sig, "base64url");
  } catch {
    return null;
  }
  if (sigBuf.length !== expected.length || !timingSafeEqual(sigBuf, expected)) return null;
  try {
    const payload = JSON.parse(B64.dec(data));
    if (payload.exp < Math.floor(Date.now() / 1e3)) return null;
    return payload;
  } catch {
    return null;
  }
}
function getBearerSession(request) {
  const h = request.headers.get("Authorization");
  if (!h?.startsWith("Bearer ")) return null;
  return verifySession(h.slice(7).trim());
}
const JSON_HEADERS = {
  "Content-Type": "application/json",
  Accept: "application/json"
};
async function sbFetch(config, path, init = {}) {
  const url = `${config.url}/rest/v1/${path.replace(/^\//, "")}`;
  const headers = new Headers(init.headers);
  headers.set("apikey", config.serviceKey);
  headers.set("Authorization", `Bearer ${config.serviceKey}`);
  if (!headers.has("Accept")) headers.set("Accept", "application/json");
  return fetch(url, { ...init, headers });
}
async function kvGet(config, bucket, key2) {
  const q = `crm_kv?bucket=eq.${encodeURIComponent(bucket)}&key=eq.${encodeURIComponent(key2)}&select=value&limit=1`;
  const res = await sbFetch(config, q);
  if (!res.ok) return null;
  const rows = await res.json();
  return rows[0]?.value ?? null;
}
async function kvSet(config, bucket, key2, value) {
  const res = await sbFetch(config, "crm_kv?on_conflict=bucket,key", {
    method: "POST",
    headers: {
      ...JSON_HEADERS,
      Prefer: "resolution=merge-duplicates,return=minimal"
    },
    body: JSON.stringify({
      bucket,
      key: key2,
      value,
      updated_at: (/* @__PURE__ */ new Date()).toISOString()
    })
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`kvSet failed: ${res.status} ${t}`);
  }
}
async function kvDelete(config, bucket, key2) {
  const path = `crm_kv?bucket=eq.${encodeURIComponent(bucket)}&key=eq.${encodeURIComponent(key2)}`;
  const res = await sbFetch(config, path, { method: "DELETE" });
  if (!res.ok && res.status !== 406) {
    const t = await res.text();
    throw new Error(`kvDelete failed: ${res.status} ${t}`);
  }
}
async function kvListBucket(config, bucket) {
  const path = `crm_kv?bucket=eq.${encodeURIComponent(bucket)}&select=key,value`;
  const res = await sbFetch(config, path);
  if (!res.ok) return [];
  return await res.json();
}
const USER_BUCKET = "user";
function todayISO() {
  const d = /* @__PURE__ */ new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function enrichUser(u) {
  const end = String(u.validityEnd || "");
  const start = String(u.validityStart || "");
  let validityStatus = "unset";
  let daysUntilExpiry = null;
  let needsRenewal = false;
  if (u.role === "student" && /^\d{4}-\d{2}-\d{2}$/.test(end)) {
    const t = /* @__PURE__ */ new Date(`${end}T23:59:59`);
    const now = /* @__PURE__ */ new Date();
    const diffDays = Math.ceil((t.getTime() - now.getTime()) / (1e3 * 60 * 60 * 24));
    daysUntilExpiry = diffDays;
    if (diffDays < 0) {
      validityStatus = "expired";
      needsRenewal = true;
    } else if (diffDays <= 14) {
      validityStatus = "expiring";
      needsRenewal = diffDays <= 7;
    } else {
      validityStatus = "ok";
    }
  } else if (start || end) {
    validityStatus = "ok";
  }
  return {
    ...u,
    assignedMentors: Array.isArray(u.assignedMentors) ? u.assignedMentors : [],
    assignedLitwitsDocs: Array.isArray(u.assignedLitwitsDocs) ? u.assignedLitwitsDocs : [],
    validityStart: u.validityStart || "",
    validityEnd: u.validityEnd || "",
    status: u.status || "active",
    packageSessions: typeof u.packageSessions === "number" ? u.packageSessions : 0,
    sessionType: u.sessionType || "",
    packagePlan: u.packagePlan || "numeric",
    attendedSessions: typeof u.attendedSessions === "number" ? u.attendedSessions : 0,
    srCount: typeof u.srCount === "number" ? u.srCount : 0,
    manualAdjustment: typeof u.manualAdjustment === "number" ? u.manualAdjustment : 0,
    validityStatus,
    daysUntilExpiry,
    needsRenewal,
    lastModified: typeof u.lastModified === "number" ? u.lastModified : 0
  };
}
async function listUsers(config) {
  const rows = await kvListBucket(config, USER_BUCKET);
  const users = rows.map(
    (r) => enrichUser({ ...r.value, email: r.key })
  );
  return users.sort(
    (a, b) => String(a.name || a.email).localeCompare(String(b.name || b.email))
  );
}
async function getUserByEmail(config, email) {
  const raw = await kvGet(config, USER_BUCKET, email.toLowerCase());
  if (!raw) return null;
  return enrichUser({ ...raw, email: email.toLowerCase() });
}
async function saveUser(config, email, data) {
  const key2 = email.toLowerCase();
  const next = enrichUser({
    ...data,
    email: key2,
    lastModified: Date.now()
  });
  const { email: _e, ...rest } = next;
  await kvSet(config, USER_BUCKET, key2, rest);
  return next;
}
function checkStudentValidity(u) {
  if (u.role !== "student") return { ok: true };
  const end = String(u.validityEnd || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(end)) return { ok: true };
  const t = /* @__PURE__ */ new Date(`${end}T23:59:59`);
  if (t.getTime() < Date.now()) return { expired: true, end };
  return { ok: true };
}
function addDaysISO(iso, days) {
  const [y, m, d] = iso.split("-").map((s) => parseInt(s, 10));
  if (!y || !m || !d) return "";
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}
function addMonthsISO(iso, months) {
  const [y, m, d] = iso.split("-").map((s) => parseInt(s, 10));
  if (!y || !m || !d) return "";
  const dt = new Date(y, m - 1, d);
  dt.setMonth(dt.getMonth() + months);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}
function computeValidityEnd(start, plan, sessions) {
  if (!start) return "";
  if (plan === "signature") return addMonthsISO(start, 6);
  if (plan === "platinum") return addMonthsISO(start, 12);
  const n = Math.max(0, Math.floor(sessions || 0));
  if (n <= 0) return "";
  return addDaysISO(start, n * 7);
}
function json(data, status = 200) {
  return Response.json(data, { status });
}
function requireStaff(session) {
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin" && session.role !== "mentor") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}
const Route$h = createFileRoute("/api/users")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = getBearerSession(request);
        const deny = requireStaff(session);
        if (deny) return deny;
        try {
          const config = requireSupabase();
          const users = await listUsers(config);
          return json({ users });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "error";
          if (msg.includes("not configured")) return json({ error: msg }, 503);
          console.error(e);
          return json({ error: "Failed" }, 500);
        }
      },
      POST: async ({ request }) => {
        const session = getBearerSession(request);
        if (!session || session.role !== "admin") {
          return json({ error: "Forbidden" }, 403);
        }
        let body;
        try {
          body = await request.json();
        } catch {
          return json({ error: "Invalid JSON" }, 400);
        }
        const email = String(body.email || "").trim().toLowerCase();
        if (!email) return json({ error: "Email required" }, 400);
        if (!String(body.password || "").trim()) {
          return json({ error: "Password required" }, 400);
        }
        try {
          const config = requireSupabase();
          if (await getUserByEmail(config, email)) {
            return json({ error: "User already exists" }, 409);
          }
          const role = String(body.role || "student");
          const sessions = parseInt(String(body.packageSessions || "0"), 10) || 0;
          const plan = body.packagePlan || "numeric";
          const validityStart = role === "student" ? String(body.validityStart || todayISO()) : String(body.validityStart || "");
          const validityEnd = role === "student" && !body.validityEnd ? computeValidityEnd(validityStart, plan, sessions) : String(body.validityEnd || "");
          const u = enrichUser({
            name: String(body.name || ""),
            email,
            password: String(body.password || ""),
            role,
            phone: String(body.phone || ""),
            assignedMentors: Array.isArray(body.assignedMentors) ? body.assignedMentors : [],
            assignedLitwitsDocs: Array.isArray(body.assignedLitwitsDocs) ? body.assignedLitwitsDocs : [],
            validityStart,
            validityEnd,
            status: String(body.status || "active"),
            packageSessions: sessions,
            sessionType: String(body.sessionType || ""),
            packagePlan: plan,
            attendedSessions: 0,
            srCount: typeof body.srCount === "number" ? body.srCount : 0,
            manualAdjustment: 0,
            lastModified: 0
          });
          const saved = await saveUser(config, email, u);
          return json({ user: saved });
        } catch (e) {
          console.error(e);
          return json({ error: "Failed" }, 500);
        }
      },
      PUT: async ({ request }) => {
        const session = getBearerSession(request);
        if (!session || session.role !== "admin") return json({ error: "Forbidden" }, 403);
        let body;
        try {
          body = await request.json();
        } catch {
          return json({ error: "Invalid JSON" }, 400);
        }
        const email = String(body.email || "").trim().toLowerCase();
        if (!email) return json({ error: "Email required" }, 400);
        try {
          const config = requireSupabase();
          const existing = await getUserByEmail(config, email);
          if (!existing) return json({ error: "Not found" }, 404);
          const expected = body.expectedLastModified;
          if (expected !== void 0 && Number(existing.lastModified || 0) !== Number(expected)) {
            return json({ error: "Conflict" }, 409);
          }
          const merged = {
            ...existing,
            ...body.name !== void 0 ? { name: String(body.name) } : {},
            ...body.password !== void 0 ? { password: String(body.password) } : {},
            ...body.role !== void 0 ? { role: String(body.role) } : {},
            ...body.phone !== void 0 ? { phone: String(body.phone) } : {},
            ...body.assignedMentors !== void 0 ? { assignedMentors: body.assignedMentors } : {},
            ...body.assignedLitwitsDocs !== void 0 ? { assignedLitwitsDocs: body.assignedLitwitsDocs } : {},
            ...body.validityStart !== void 0 ? { validityStart: String(body.validityStart) } : {},
            ...body.validityEnd !== void 0 ? { validityEnd: String(body.validityEnd) } : {},
            ...body.status !== void 0 ? { status: String(body.status) } : {},
            ...body.packageSessions !== void 0 ? { packageSessions: Number(body.packageSessions) || 0 } : {},
            ...body.sessionType !== void 0 ? { sessionType: String(body.sessionType) } : {},
            ...body.packagePlan !== void 0 ? { packagePlan: String(body.packagePlan) } : {},
            ...body.attendedSessions !== void 0 ? { attendedSessions: Number(body.attendedSessions) || 0 } : {},
            ...body.srCount !== void 0 ? { srCount: Number(body.srCount) || 0 } : {},
            ...body.manualAdjustment !== void 0 ? { manualAdjustment: Number(body.manualAdjustment) || 0 } : {}
          };
          if (body.attendedSessions !== void 0) {
            merged.manualAdjustment = (Number(body.attendedSessions) || 0) - (merged.srCount ?? 0);
          }
          const saved = await saveUser(config, email, merged);
          return json({ user: saved });
        } catch (e) {
          console.error(e);
          return json({ error: "Failed" }, 500);
        }
      },
      DELETE: async ({ request }) => {
        const session = getBearerSession(request);
        if (!session || session.role !== "admin") return json({ error: "Forbidden" }, 403);
        const url = new URL(request.url);
        const email = String(url.searchParams.get("email") || "").trim().toLowerCase();
        if (!email) return json({ error: "email required" }, 400);
        try {
          const config = requireSupabase();
          await kvDelete(config, "user", email);
          return new Response(null, { status: 204 });
        } catch (e) {
          console.error(e);
          return json({ error: "Failed" }, 500);
        }
      }
    }
  }
});
const BUCKET$6 = "tab_order";
const Route$g = createFileRoute("/api/tab-order")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!getBearerSession(request)) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        const url = new URL(request.url);
        const documentKey = String(url.searchParams.get("documentKey") || "");
        if (!documentKey) return Response.json({ error: "documentKey required" }, { status: 400 });
        try {
          const config = requireSupabase();
          const row = await kvGet(config, BUCKET$6, documentKey);
          return Response.json({ tabOrder: row?.tabOrder ?? null });
        } catch (e) {
          console.error(e);
          return Response.json({ error: "Failed" }, { status: 500 });
        }
      },
      POST: async ({ request }) => {
        if (!getBearerSession(request)) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        let body;
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }
        const documentKey = String(body.documentKey || "");
        const tabOrder = Array.isArray(body.tabOrder) ? body.tabOrder.map(String) : [];
        if (!documentKey) return Response.json({ error: "documentKey required" }, { status: 400 });
        try {
          const config = requireSupabase();
          await kvSet(config, BUCKET$6, documentKey, { tabOrder });
          return Response.json({ ok: true });
        } catch (e) {
          console.error(e);
          return Response.json({ error: "Failed" }, { status: 500 });
        }
      }
    }
  }
});
const Route$f = createFileRoute("/api/sync-assignments")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const session = getBearerSession(request);
        if (!session || session.role !== "admin") {
          return Response.json({ error: "Forbidden" }, { status: 403 });
        }
        try {
          const config = requireSupabase();
          const users = await listUsers(config);
          const mentors = users.filter((u) => u.role === "mentor").map((u) => u.email);
          const students = users.filter((u) => u.role === "student");
          let n = 0;
          for (const s of students) {
            const u = s;
            const merged = {
              ...u,
              assignedMentors: [...mentors]
            };
            await saveUser(config, u.email, merged);
            n++;
          }
          return Response.json({
            studentsUpdated: n,
            totalStudents: students.length,
            totalMentors: mentors.length
          });
        } catch (e) {
          console.error(e);
          return Response.json({ error: "Failed" }, { status: 500 });
        }
      }
    }
  }
});
const BUCKET$5 = "doc_suggestions";
function key$1(email, docId) {
  return `${email.toLowerCase()}:${String(docId)}`;
}
const Route$e = createFileRoute("/api/suggestions")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!getBearerSession(request)) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        const url = new URL(request.url);
        const email = String(url.searchParams.get("email") || "").toLowerCase();
        const docId = String(url.searchParams.get("docId") || "");
        if (!email || !docId) return Response.json({ error: "bad request" }, { status: 400 });
        try {
          const config = requireSupabase();
          const data = await kvGet(
            config,
            BUCKET$5,
            key$1(email, docId)
          );
          return Response.json({ suggestions: data?.suggestions || [] });
        } catch (e) {
          console.error(e);
          return Response.json({ error: "Failed" }, { status: 500 });
        }
      },
      POST: async ({ request }) => {
        const session = getBearerSession(request);
        if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
        let body;
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }
        const email = String(body.email || "").toLowerCase();
        const docId = String(body.docId ?? "");
        if (!email || !docId) return Response.json({ error: "bad request" }, { status: 400 });
        try {
          const config = requireSupabase();
          const k = key$1(email, docId);
          const cur = await kvGet(
            config,
            BUCKET$5,
            k
          ) || { suggestions: [] };
          const suggestion = {
            id: `s-${Date.now()}`,
            from: Number(body.from) || 0,
            to: Number(body.to) || 0,
            originalText: String(body.originalText || ""),
            suggestedText: String(body.suggestedText || ""),
            authorName: session.name,
            authorEmail: session.email,
            role: session.role,
            timestamp: Date.now(),
            status: "pending"
          };
          cur.suggestions.push(suggestion);
          await kvSet(config, BUCKET$5, k, cur);
          return Response.json({ suggestion });
        } catch (e) {
          console.error(e);
          return Response.json({ error: "Failed" }, { status: 500 });
        }
      },
      PUT: async ({ request }) => {
        if (!getBearerSession(request)) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        let body;
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }
        const email = String(body.email || "").toLowerCase();
        const docId = String(body.docId ?? "");
        const suggestionId = String(body.suggestionId || "");
        const status = String(body.status || "");
        if (!email || !docId || !suggestionId) {
          return Response.json({ error: "bad request" }, { status: 400 });
        }
        try {
          const config = requireSupabase();
          const k = key$1(email, docId);
          const cur = await kvGet(
            config,
            BUCKET$5,
            k
          );
          if (!cur) return Response.json({ error: "Not found" }, { status: 404 });
          const s = cur.suggestions.find((x) => x.id === suggestionId);
          if (!s) return Response.json({ error: "Not found" }, { status: 404 });
          if (status) s.status = status;
          await kvSet(config, BUCKET$5, k, cur);
          return Response.json({ ok: true });
        } catch (e) {
          console.error(e);
          return Response.json({ error: "Failed" }, { status: 500 });
        }
      }
    }
  }
});
const Route$d = createFileRoute("/api/parse-document")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const session = getBearerSession(request);
        if (!session || session.role !== "admin") {
          return Response.json({ error: "Forbidden" }, { status: 403 });
        }
        let body;
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }
        const b64 = body.fileData;
        const fileType = String(body.fileType || "").toLowerCase();
        if (!b64 || fileType !== "docx" && fileType !== "pdf") {
          return Response.json({ error: "Unsupported or missing file" }, { status: 400 });
        }
        try {
          const buf = Buffer.from(b64, "base64");
          if (fileType === "docx") {
            const mammoth = await import("mammoth");
            const { value: html } = await mammoth.convertToHtml({ buffer: buf });
            return Response.json({ html: html || "<p></p>" });
          }
          const { PDFParse } = await import("pdf-parse");
          const parser = new PDFParse({ data: buf });
          try {
            const result = await parser.getText();
            const text = result.text || "";
            const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
            const html = `<p>${escaped.replace(/\n+/g, "<br/>")}</p>`;
            return Response.json({ html });
          } finally {
            await parser.destroy();
          }
        } catch (e) {
          console.error(e);
          return Response.json({ error: "Failed to parse" }, { status: 500 });
        }
      }
    }
  }
});
const BUCKET$4 = "mentor_docs";
async function load(config, email) {
  const row = await kvGet(config, BUCKET$4, email.toLowerCase());
  if (!row) return { documents: [], versions: {} };
  if (!Array.isArray(row.documents)) return { documents: [], versions: row.versions || {} };
  return {
    documents: row.documents,
    versions: row.versions && typeof row.versions === "object" ? row.versions : {}
  };
}
async function save(config, email, store) {
  await kvSet(config, BUCKET$4, email.toLowerCase(), store);
}
const Route$c = createFileRoute("/api/mentor-documents")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = getBearerSession(request);
        if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const url = new URL(request.url);
        if (url.searchParams.get("listMentors") === "1") {
          if (session.role !== "admin") {
            return Response.json({ error: "Forbidden" }, { status: 403 });
          }
          try {
            const config = requireSupabase();
            const users = await listUsers(config);
            const mentors = users.filter((u) => u.role === "mentor").map((u) => ({ name: String(u.name || ""), email: u.email }));
            return Response.json({ mentors });
          } catch (e) {
            console.error(e);
            return Response.json({ error: "Failed" }, { status: 500 });
          }
        }
        const email = String(url.searchParams.get("email") || "").trim().toLowerCase();
        if (!email) return Response.json({ error: "email required" }, { status: 400 });
        if (session.role === "mentor" && session.email.toLowerCase() !== email) {
          return Response.json({ error: "Forbidden" }, { status: 403 });
        }
        if (session.role === "student") {
          return Response.json({ error: "Forbidden" }, { status: 403 });
        }
        try {
          const config = requireSupabase();
          const store = await load(config, email);
          return Response.json({ documents: store.documents });
        } catch (e) {
          console.error(e);
          return Response.json({ error: "Failed" }, { status: 500 });
        }
      },
      PUT: async ({ request }) => {
        const session = getBearerSession(request);
        if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
        let body;
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }
        const email = String(body.email || "").toLowerCase();
        const docId = parseInt(String(body.docId ?? ""), 10);
        if (!email || !docId) return Response.json({ error: "bad request" }, { status: 400 });
        if (session.role !== "mentor" || session.email.toLowerCase() !== email) {
          return Response.json({ error: "Forbidden" }, { status: 403 });
        }
        try {
          const config = requireSupabase();
          const store = await load(config, email);
          let idx = store.documents.findIndex((d) => d.id === docId);
          if (idx === -1) {
            store.documents.push({
              id: docId,
              title: String(body.title || "Untitled"),
              content: String(body.content || ""),
              tabs: body.tabs,
              activeTabId: body.activeTabId
            });
            idx = store.documents.length - 1;
          }
          const prev = store.documents[idx];
          const nextVer = (store.versions[String(docId)] ?? 0) + 1;
          store.documents[idx] = {
            ...prev,
            title: body.title !== void 0 ? String(body.title) : prev.title,
            content: body.content !== void 0 ? String(body.content) : prev.content,
            tabs: body.tabs !== void 0 ? body.tabs : prev.tabs,
            activeTabId: body.activeTabId !== void 0 ? body.activeTabId : prev.activeTabId
          };
          store.versions[String(docId)] = nextVer;
          await save(config, email, store);
          return Response.json({ version: nextVer });
        } catch (e) {
          console.error(e);
          return Response.json({ error: "Failed" }, { status: 500 });
        }
      }
    }
  }
});
const DOC_BUCKET$2 = "litwits_doc";
const VER_BUCKET$2 = "litwits_ver";
function sessionOk(s) {
  return Boolean(s);
}
async function listLitwitsDocs(config) {
  const rows = await kvListBucket(config, DOC_BUCKET$2);
  return rows.map((r) => r.value);
}
async function appendVersion(config, docId, doc, editor) {
  const key2 = docId;
  const cur = await kvGet(config, VER_BUCKET$2, key2) || { versions: [], byTs: {} };
  const ts = Date.now();
  cur.versions.push({
    timestamp: ts,
    editedBy: editor.name,
    editedByEmail: editor.email,
    title: String(doc.title || "")
  });
  cur.byTs[String(ts)] = {
    content: String(doc.content || ""),
    title: String(doc.title || ""),
    tabs: doc.tabs,
    activeTabId: doc.activeTabId
  };
  await kvSet(config, VER_BUCKET$2, key2, cur);
}
const Route$b = createFileRoute("/api/litwits-docs")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!sessionOk(getBearerSession(request))) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        try {
          const config = requireSupabase();
          const documents = await listLitwitsDocs(config);
          return Response.json({ documents });
        } catch (e) {
          console.error(e);
          return Response.json({ error: "Failed" }, { status: 500 });
        }
      },
      POST: async ({ request }) => {
        const session = getBearerSession(request);
        if (!session || session.role !== "admin") {
          return Response.json({ error: "Forbidden" }, { status: 403 });
        }
        let body;
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }
        const id = String(body.docId || body.id || `custom-${Date.now()}`);
        try {
          const config = requireSupabase();
          const doc = {
            id,
            title: String(body.title || "Untitled"),
            category: String(body.category || "Other Documents"),
            content: String(body.content || ""),
            tabs: body.tabs,
            activeTabId: body.activeTabId,
            lastEditedBy: session.name,
            lastEditedAt: Date.now(),
            __sync: 0
          };
          await kvSet(config, DOC_BUCKET$2, id, doc);
          await appendVersion(config, id, doc, { name: session.name, email: session.email });
          return Response.json({ document: doc });
        } catch (e) {
          console.error(e);
          return Response.json({ error: "Failed" }, { status: 500 });
        }
      },
      PUT: async ({ request }) => {
        const session = getBearerSession(request);
        if (!session || session.role !== "admin") {
          return Response.json({ error: "Forbidden" }, { status: 403 });
        }
        let body;
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }
        const docId = String(body.docId || "");
        if (!docId) return Response.json({ error: "docId required" }, { status: 400 });
        try {
          const config = requireSupabase();
          const prev = await kvGet(config, DOC_BUCKET$2, docId);
          const doc = {
            ...prev || { id: docId },
            id: docId,
            title: body.title !== void 0 ? String(body.title) : String(prev?.title || ""),
            category: body.category !== void 0 ? String(body.category) : String(prev?.category || "Other Documents"),
            content: body.content !== void 0 ? String(body.content) : String(prev?.content || ""),
            tabs: body.tabs !== void 0 ? body.tabs : prev?.tabs,
            activeTabId: body.activeTabId !== void 0 ? body.activeTabId : prev?.activeTabId,
            lastEditedBy: session.name,
            lastEditedAt: Date.now()
          };
          await kvSet(config, DOC_BUCKET$2, docId, doc);
          await appendVersion(config, docId, doc, { name: session.name, email: session.email });
          return Response.json({ ok: true });
        } catch (e) {
          console.error(e);
          return Response.json({ error: "Failed" }, { status: 500 });
        }
      },
      DELETE: async ({ request }) => {
        const session = getBearerSession(request);
        if (!session || session.role !== "admin") {
          return Response.json({ error: "Forbidden" }, { status: 403 });
        }
        const url = new URL(request.url);
        const docId = String(url.searchParams.get("docId") || "");
        if (!docId) return Response.json({ error: "docId required" }, { status: 400 });
        try {
          const config = requireSupabase();
          await kvDelete(config, DOC_BUCKET$2, docId);
          await kvDelete(config, VER_BUCKET$2, docId);
          return new Response(null, { status: 204 });
        } catch (e) {
          console.error(e);
          return Response.json({ error: "Failed" }, { status: 500 });
        }
      }
    }
  }
});
const VER_BUCKET$1 = "litwits_ver";
const DOC_BUCKET$1 = "litwits_doc";
const Route$a = createFileRoute("/api/litwits-doc-versions")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!getBearerSession(request)) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        const url = new URL(request.url);
        const docId = String(url.searchParams.get("docId") || "");
        const versionTs = url.searchParams.get("version");
        if (!docId) return Response.json({ error: "docId required" }, { status: 400 });
        try {
          const config = requireSupabase();
          const data = await kvGet(config, VER_BUCKET$1, docId);
          if (versionTs) {
            const snap = data?.byTs?.[versionTs];
            if (!snap) return Response.json({ error: "Not found" }, { status: 404 });
            return Response.json({
              version: { content: snap.content || "", title: snap.title, ...snap }
            });
          }
          return Response.json({ versions: data?.versions || [] });
        } catch (e) {
          console.error(e);
          return Response.json({ error: "Failed" }, { status: 500 });
        }
      },
      POST: async ({ request }) => {
        const session = getBearerSession(request);
        if (!session || session.role !== "admin") {
          return Response.json({ error: "Forbidden" }, { status: 403 });
        }
        let body;
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }
        const docId = String(body.docId || "");
        const ts = String(body.versionTimestamp ?? "");
        if (!docId || !ts) return Response.json({ error: "bad request" }, { status: 400 });
        try {
          const config = requireSupabase();
          const snapStore = await kvGet(config, VER_BUCKET$1, docId);
          const snap = snapStore?.byTs?.[ts];
          if (!snap) return Response.json({ error: "Not found" }, { status: 404 });
          const prev = await kvGet(config, DOC_BUCKET$1, docId) || {
            id: docId
          };
          const nextVer = (typeof prev.__sync === "number" ? prev.__sync : 0) + 1;
          const doc = {
            ...prev,
            id: docId,
            content: String(snap.content || ""),
            title: snap.title !== void 0 ? String(snap.title) : String(prev.title || ""),
            tabs: snap.tabs !== void 0 ? snap.tabs : prev.tabs,
            activeTabId: snap.activeTabId !== void 0 ? snap.activeTabId : prev.activeTabId,
            lastEditedBy: session.name,
            lastEditedAt: Date.now(),
            __sync: nextVer
          };
          await kvSet(config, DOC_BUCKET$1, docId, doc);
          return Response.json({ ok: true });
        } catch (e) {
          console.error(e);
          return Response.json({ error: "Failed" }, { status: 500 });
        }
      }
    }
  }
});
const DOC_BUCKET = "litwits_doc";
const VER_BUCKET = "litwits_ver";
async function bumpVersion(config, docId, doc, editor) {
  const cur = await kvGet(config, VER_BUCKET, docId) || { versions: [], byTs: {} };
  const ts = Date.now();
  cur.versions.push({
    timestamp: ts,
    editedBy: editor.name,
    editedByEmail: editor.email,
    title: String(doc.title || "")
  });
  cur.byTs[String(ts)] = {
    content: String(doc.content || ""),
    title: String(doc.title || ""),
    tabs: doc.tabs,
    activeTabId: doc.activeTabId
  };
  await kvSet(config, VER_BUCKET, docId, cur);
}
const Route$9 = createFileRoute("/api/litwits-doc-sync")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!getBearerSession(request)) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        const url = new URL(request.url);
        const docId = String(url.searchParams.get("docId") || "");
        const since = parseInt(String(url.searchParams.get("since") || "0"), 10) || 0;
        if (!docId) return Response.json({ error: "docId required" }, { status: 400 });
        try {
          const config = requireSupabase();
          const doc = await kvGet(config, DOC_BUCKET, docId);
          const ver = typeof doc?.__sync === "number" ? doc.__sync : 0;
          if (!doc) return Response.json({ changed: false, version: since });
          if (since >= ver) return Response.json({ changed: false, version: ver });
          const { __sync, ...clean } = doc;
          return Response.json({
            changed: true,
            version: ver,
            title: clean.title,
            content: clean.content,
            tabs: clean.tabs,
            activeTabId: clean.activeTabId,
            editedBy: clean.lastEditedBy || ""
          });
        } catch (e) {
          console.error(e);
          return Response.json({ error: "Failed" }, { status: 500 });
        }
      },
      POST: async ({ request }) => {
        const session = getBearerSession(request);
        if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
        let body;
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }
        const docId = String(body.docId || "");
        if (!docId) return Response.json({ error: "docId required" }, { status: 400 });
        if (session.role === "mentor" || session.role === "student" || session.role === "admin") ;
        try {
          const config = requireSupabase();
          const prev = await kvGet(config, DOC_BUCKET, docId);
          const nextVer = (typeof prev?.__sync === "number" ? prev.__sync : 0) + 1;
          const doc = {
            ...prev || { id: docId },
            id: docId,
            title: body.title !== void 0 ? String(body.title) : String(prev?.title || ""),
            category: String(prev?.category || "Other Documents"),
            content: body.content !== void 0 ? String(body.content) : String(prev?.content || ""),
            tabs: body.tabs !== void 0 ? body.tabs : prev?.tabs,
            activeTabId: body.activeTabId !== void 0 ? body.activeTabId : prev?.activeTabId,
            lastEditedBy: session.name,
            lastEditedAt: Date.now(),
            __sync: nextVer
          };
          await kvSet(config, DOC_BUCKET, docId, doc);
          await bumpVersion(config, docId, doc, { name: session.name, email: session.email });
          return Response.json({ version: nextVer });
        } catch (e) {
          console.error(e);
          return Response.json({ error: "Failed" }, { status: 500 });
        }
      }
    }
  }
});
const BUCKET$3 = "lit_spark";
const KEY = "activity_logs";
const Route$8 = createFileRoute("/api/litwits-doc-activity")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = getBearerSession(request);
        if (!session || session.role !== "admin") {
          return Response.json({ error: "Forbidden" }, { status: 403 });
        }
        const url = new URL(request.url);
        const user = url.searchParams.get("user");
        const docId = url.searchParams.get("docId");
        const date = url.searchParams.get("date");
        try {
          const config = requireSupabase();
          const data = await kvGet(config, BUCKET$3, KEY);
          let logs = data?.logs || [];
          if (user) logs = logs.filter((l) => String(l.userEmail || "") === user);
          if (docId) logs = logs.filter((l) => String(l.documentId || "") === docId);
          if (date) {
            const day = new Date(date).setHours(0, 0, 0, 0);
            const next = day + 864e5;
            logs = logs.filter((l) => {
              const ts = Number(l.timestamp) || 0;
              return ts >= day && ts < next;
            });
          }
          return Response.json({ logs });
        } catch (e) {
          console.error(e);
          return Response.json({ error: "Failed" }, { status: 500 });
        }
      },
      POST: async ({ request }) => {
        const session = getBearerSession(request);
        if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
        let body;
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }
        const docId = String(body.docId ?? "");
        const action = String(body.action || "");
        const duration = typeof body.duration === "number" ? body.duration : void 0;
        if (!docId) return Response.json({ error: "docId required" }, { status: 400 });
        try {
          const config = requireSupabase();
          const cur = await kvGet(config, BUCKET$3, KEY) || { logs: [] };
          cur.logs.push({
            userName: session.name,
            userEmail: session.email,
            userRole: session.role,
            documentId: docId,
            action,
            timestamp: Date.now(),
            duration: duration ?? 0
          });
          if (cur.logs.length > 5e3) cur.logs = cur.logs.slice(-4e3);
          await kvSet(config, BUCKET$3, KEY, cur);
          return Response.json({ ok: true });
        } catch (e) {
          console.error(e);
          return Response.json({ error: "Failed" }, { status: 500 });
        }
      }
    }
  }
});
function normSource(s) {
  const x = String(s || "");
  if (x === "Instagram") return "Instagram";
  if (x === "Facebook") return "Facebook";
  return "WhatsApp";
}
function normStatus(s) {
  const allowed = [
    "New Query",
    "Contacted",
    "Interested",
    "Converted",
    "Closed",
    "Not Responded"
  ];
  return allowed.includes(s) ? s : "New Query";
}
function rowToLead(row) {
  const created = row.created_at ? new Date(String(row.created_at)).getTime() : Date.now();
  return {
    id: String(row.id ?? ""),
    name: String(row.name || row.phone || "Lead"),
    phone: String(row.phone || ""),
    source: normSource(String(row.source || "WhatsApp")),
    lastMessage: String(row.message || ""),
    status: normStatus(String(row.status || "New Query")),
    createdAt: Number.isFinite(created) ? created : Date.now()
  };
}
const Route$7 = createFileRoute("/api/leads")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = getBearerSession(request);
        if (!session || session.role !== "admin") {
          return Response.json({ error: "Forbidden" }, { status: 403 });
        }
        try {
          const config = requireSupabase();
          const res = await sbFetch(
            config,
            "leads?select=*&order=created_at.desc.nullslast",
            { method: "GET" }
          );
          if (!res.ok) {
            const t = await res.text();
            console.warn("leads GET", res.status, t);
            return Response.json({ leads: [] });
          }
          const rows = await res.json();
          return Response.json({ leads: rows.map(rowToLead) });
        } catch (e) {
          console.error(e);
          return Response.json({ leads: [] });
        }
      },
      PATCH: async ({ request }) => {
        const session = getBearerSession(request);
        if (!session || session.role !== "admin") {
          return Response.json({ error: "Forbidden" }, { status: 403 });
        }
        let body;
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }
        const id = String(body.id || "");
        const status = body.status ? normStatus(body.status) : null;
        if (!id || !status) return Response.json({ error: "bad request" }, { status: 400 });
        try {
          const config = requireSupabase();
          const res = await sbFetch(config, `leads?id=eq.${encodeURIComponent(id)}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
            body: JSON.stringify({ status })
          });
          if (!res.ok) {
            const t = await res.text();
            return Response.json({ error: t || "update failed" }, { status: 502 });
          }
          return Response.json({ ok: true });
        } catch (e) {
          console.error(e);
          return Response.json({ error: "Failed" }, { status: 500 });
        }
      }
    }
  }
});
const Route$6 = createFileRoute("/api/google-sheets-fetch")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!getBearerSession(request)) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        new URL(request.url).searchParams.get("refresh");
        return Response.json({ ok: true });
      }
    }
  }
});
const BUCKET$2 = "student_docs";
async function loadStudentDocStore(config, email) {
  const row = await kvGet(config, BUCKET$2, email.toLowerCase());
  if (!row) return { documents: [], versions: {} };
  if (!Array.isArray(row.documents)) return { documents: [], versions: row.versions || {} };
  return {
    documents: row.documents,
    versions: row.versions && typeof row.versions === "object" ? row.versions : {}
  };
}
async function saveStudentDocStore(config, email, store) {
  await kvSet(config, BUCKET$2, email.toLowerCase(), store);
}
function canAccessStudentDocs$1(session, email) {
  if (session.role === "admin" || session.role === "mentor") return true;
  return session.email.toLowerCase() === email.toLowerCase();
}
function stripInternals$1(doc) {
  const { _sync, ...rest } = doc;
  return rest;
}
const Route$5 = createFileRoute("/api/documents")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = getBearerSession(request);
        if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const url = new URL(request.url);
        const email = String(url.searchParams.get("email") || "").trim().toLowerCase();
        if (!email) return Response.json({ error: "email required" }, { status: 400 });
        if (!canAccessStudentDocs$1(session, email)) {
          return Response.json({ error: "Forbidden" }, { status: 403 });
        }
        try {
          const config = requireSupabase();
          const store = await loadStudentDocStore(config, email);
          const documents = store.documents.map((d) => stripInternals$1(d));
          return Response.json({ documents });
        } catch (e) {
          console.error(e);
          return Response.json({ error: "Failed" }, { status: 500 });
        }
      }
    }
  }
});
function canAccessStudentDocs(session, email) {
  if (session.role === "admin" || session.role === "mentor") return true;
  return session.email.toLowerCase() === email.toLowerCase();
}
function stripInternals(doc) {
  const { _sync, ...rest } = doc;
  return rest;
}
const Route$4 = createFileRoute("/api/doc-sync")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = getBearerSession(request);
        if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const url = new URL(request.url);
        const email = String(url.searchParams.get("email") || "").toLowerCase();
        const docId = parseInt(String(url.searchParams.get("docId") || ""), 10);
        const since = parseInt(String(url.searchParams.get("since") || "0"), 10) || 0;
        if (!email || !docId) {
          return Response.json({ error: "bad request" }, { status: 400 });
        }
        if (!canAccessStudentDocs(session, email)) {
          return Response.json({ error: "Forbidden" }, { status: 403 });
        }
        try {
          const config = requireSupabase();
          const store = await loadStudentDocStore(config, email);
          const v = store.versions[String(docId)] ?? 0;
          const doc = store.documents.find((d) => d.id === docId);
          if (!doc) {
            return Response.json({ changed: false, version: v });
          }
          if (since >= v) {
            return Response.json({ changed: false, version: v });
          }
          const clean = stripInternals(doc);
          return Response.json({
            changed: true,
            version: v,
            title: clean.title,
            content: clean.content,
            tabs: clean.tabs,
            activeTabId: clean.activeTabId,
            editedBy: ""
          });
        } catch (e) {
          console.error(e);
          return Response.json({ error: "Failed" }, { status: 500 });
        }
      },
      POST: async ({ request }) => {
        const session = getBearerSession(request);
        if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
        let body;
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }
        const email = String(body.email || "").toLowerCase();
        const rawId = parseInt(String(body.docId ?? ""), 10);
        if (!email) return Response.json({ error: "email required" }, { status: 400 });
        if (!canAccessStudentDocs(session, email)) {
          return Response.json({ error: "Forbidden" }, { status: 403 });
        }
        try {
          const config = requireSupabase();
          const store = await loadStudentDocStore(config, email);
          let docId = rawId;
          let idx = store.documents.findIndex((d) => d.id === docId);
          if (idx === -1) {
            const nextId = store.documents.length > 0 ? Math.max(...store.documents.map((d) => Number(d.id) || 0)) + 1 : 1;
            docId = Number.isFinite(rawId) && rawId > 0 ? rawId : nextId;
            if (store.documents.some((d) => d.id === docId)) {
              idx = store.documents.findIndex((d) => d.id === docId);
            } else {
              store.documents.push({
                id: docId,
                title: String(body.title || "Untitled"),
                content: String(body.content || ""),
                tabs: body.tabs,
                activeTabId: body.activeTabId
              });
              idx = store.documents.length - 1;
            }
          }
          if (idx === -1 || idx >= store.documents.length) {
            return Response.json({ error: "Not found" }, { status: 404 });
          }
          const prev = store.documents[idx];
          const nextVer = (store.versions[String(docId)] ?? 0) + 1;
          store.documents[idx] = {
            ...prev,
            title: body.title !== void 0 ? String(body.title) : prev.title,
            content: body.content !== void 0 ? String(body.content) : prev.content,
            tabs: body.tabs !== void 0 ? body.tabs : prev.tabs,
            activeTabId: body.activeTabId !== void 0 ? body.activeTabId : prev.activeTabId
          };
          store.versions[String(docId)] = nextVer;
          await saveStudentDocStore(config, email, store);
          return Response.json({ version: nextVer });
        } catch (e) {
          console.error(e);
          return Response.json({ error: "Failed" }, { status: 500 });
        }
      }
    }
  }
});
const BUCKET$1 = "doc_comments";
function key(email, docId) {
  return `${email.toLowerCase()}:${String(docId)}`;
}
const Route$3 = createFileRoute("/api/comments")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!getBearerSession(request)) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        const url = new URL(request.url);
        const email = String(url.searchParams.get("email") || "").toLowerCase();
        const docId = String(url.searchParams.get("docId") || "");
        if (!email || !docId) return Response.json({ error: "bad request" }, { status: 400 });
        try {
          const config = requireSupabase();
          const data = await kvGet(
            config,
            BUCKET$1,
            key(email, docId)
          );
          return Response.json({ comments: data?.comments || [] });
        } catch (e) {
          console.error(e);
          return Response.json({ error: "Failed" }, { status: 500 });
        }
      },
      POST: async ({ request }) => {
        const session = getBearerSession(request);
        if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
        let body;
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }
        const email = String(body.email || "").toLowerCase();
        const docId = String(body.docId ?? "");
        const parentId = body.parentId ? String(body.parentId) : null;
        if (!email || !docId) return Response.json({ error: "bad request" }, { status: 400 });
        try {
          const config = requireSupabase();
          const k = key(email, docId);
          const cur = await kvGet(config, BUCKET$1, k) || {
            comments: []
          };
          if (parentId) {
            const reply = {
              id: `r-${Date.now()}`,
              text: String(body.text || ""),
              authorName: session.name,
              authorEmail: session.email,
              role: session.role,
              timestamp: Date.now()
            };
            const c = cur.comments.find((x) => x.id === parentId);
            if (!c) return Response.json({ error: "Not found" }, { status: 404 });
            const replies = Array.isArray(c.replies) ? [...c.replies] : [];
            replies.push(reply);
            c.replies = replies;
          } else {
            const comment = {
              id: `c-${Date.now()}`,
              selectedText: String(body.selectedText || ""),
              from: Number(body.from) || 0,
              to: Number(body.to) || 0,
              text: String(body.text || ""),
              authorName: session.name,
              authorEmail: session.email,
              role: session.role,
              timestamp: Date.now(),
              resolved: false,
              replies: []
            };
            cur.comments.push(comment);
            await kvSet(config, BUCKET$1, k, cur);
            return Response.json({ comment });
          }
          await kvSet(config, BUCKET$1, k, cur);
          return Response.json({ ok: true });
        } catch (e) {
          console.error(e);
          return Response.json({ error: "Failed" }, { status: 500 });
        }
      },
      PUT: async ({ request }) => {
        if (!getBearerSession(request)) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        let body;
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }
        const email = String(body.email || "").toLowerCase();
        const docId = String(body.docId ?? "");
        const commentId = String(body.commentId || "");
        if (!email || !docId || !commentId) {
          return Response.json({ error: "bad request" }, { status: 400 });
        }
        try {
          const config = requireSupabase();
          const k = key(email, docId);
          const cur = await kvGet(config, BUCKET$1, k);
          if (!cur) return Response.json({ error: "Not found" }, { status: 404 });
          const c = cur.comments.find((x) => x.id === commentId);
          if (!c) return Response.json({ error: "Not found" }, { status: 404 });
          if (body.replyId) {
            const replies = c.replies || [];
            const r = replies.find((x) => x.id === String(body.replyId));
            if (!r) return Response.json({ error: "Not found" }, { status: 404 });
            if (body.text !== void 0) r.text = String(body.text);
          } else {
            if (body.text !== void 0) c.text = String(body.text);
            if (body.resolved !== void 0) c.resolved = Boolean(body.resolved);
          }
          await kvSet(config, BUCKET$1, k, cur);
          return Response.json({ ok: true });
        } catch (e) {
          console.error(e);
          return Response.json({ error: "Failed" }, { status: 500 });
        }
      },
      DELETE: async ({ request }) => {
        if (!getBearerSession(request)) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        const url = new URL(request.url);
        const email = String(url.searchParams.get("email") || "").toLowerCase();
        const docId = String(url.searchParams.get("docId") || "");
        const commentId = String(url.searchParams.get("commentId") || "");
        const replyId = url.searchParams.get("replyId");
        if (!email || !docId || !commentId) {
          return Response.json({ error: "bad request" }, { status: 400 });
        }
        try {
          const config = requireSupabase();
          const k = key(email, docId);
          const cur = await kvGet(config, BUCKET$1, k);
          if (!cur) return Response.json({ error: "Not found" }, { status: 404 });
          const c = cur.comments.find((x) => x.id === commentId);
          if (!c) return Response.json({ error: "Not found" }, { status: 404 });
          if (replyId) {
            c.replies = (c.replies || []).filter((r) => r.id !== replyId);
          } else {
            cur.comments = cur.comments.filter((x) => x.id !== commentId);
          }
          await kvSet(config, BUCKET$1, k, cur);
          return new Response(null, { status: 204 });
        } catch (e) {
          console.error(e);
          return Response.json({ error: "Failed" }, { status: 500 });
        }
      }
    }
  }
});
const Route$2 = createFileRoute("/api/auth")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body;
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }
        const email = String(body.email || "").trim().toLowerCase();
        const password = String(body.password || "");
        if (!email || !password) {
          return Response.json({ error: "Email and password required" }, { status: 400 });
        }
        try {
          const config = requireSupabase();
          const user = await getUserByEmail(config, email);
          if (!user || user.password !== password) {
            return Response.json({ error: "Invalid credentials" }, { status: 401 });
          }
          const role = user.role;
          if (role !== "admin" && role !== "mentor" && role !== "student") {
            return Response.json({ error: "Invalid credentials" }, { status: 401 });
          }
          const v = checkStudentValidity(user);
          if ("expired" in v) {
            return Response.json({
              error: "validity_expired",
              endDate: v.end,
              renewalLink: "https://litwits.in/membership"
            });
          }
          const token = signSession({
            email: user.email,
            name: String(user.name || ""),
            role
          });
          return Response.json({
            token,
            user: { name: String(user.name || ""), email: user.email, role }
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Server error";
          if (msg.includes("not configured")) {
            return Response.json({ error: msg }, { status: 503 });
          }
          console.error(e);
          return Response.json({ error: "Server error" }, { status: 500 });
        }
      },
      DELETE: async () => new Response(null, { status: 204 })
    }
  }
});
const BUCKET = "arsr_wb";
function emptySheet(name, columns) {
  const id = `sheet_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  return {
    id,
    name,
    columns,
    rows: Array.from(
      { length: 30 },
      () => Object.fromEntries(columns.map((c) => [c, ""]))
    ),
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
}
function defaultWorkbook(section) {
  if (section === "sr") {
    const cols2 = ["Date", "Session", "Mentor", "Topic", "Attendance"];
    const sheet = emptySheet("Main", cols2);
    return {
      section: "sr",
      sheets: [sheet],
      activeSheetId: sheet.id,
      errors: [],
      studentSessions: {},
      studentUserMap: {},
      updatedAt: Date.now()
    };
  }
  const cols = [
    "Name",
    "Documents",
    "School Board",
    "GMB Review",
    "Remarks",
    "Parent Name",
    "NO. OF SESSION",
    "Validity"
  ];
  const sheets = ["Group", "Individual", "Renewals"].map((n) => emptySheet(n, cols));
  return {
    section: "ar",
    sheets,
    activeSheetId: sheets[0]?.id ?? null,
    errors: [],
    studentSessions: {},
    studentUserMap: {},
    updatedAt: Date.now()
  };
}
const Route$1 = createFileRoute("/api/arsr-sheets")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!getBearerSession(request)) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        const url = new URL(request.url);
        const section = url.searchParams.get("section") === "ar" ? "ar" : "sr";
        try {
          const config = requireSupabase();
          const data = await kvGet(config, BUCKET, section);
          const workbook = data ?? defaultWorkbook(section);
          return Response.json({ workbook });
        } catch (e) {
          console.error(e);
          return Response.json({ error: "Failed" }, { status: 500 });
        }
      },
      PUT: async ({ request }) => {
        if (!getBearerSession(request)) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        const url = new URL(request.url);
        const section = url.searchParams.get("section") === "ar" ? "ar" : "sr";
        let body;
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }
        try {
          const config = requireSupabase();
          await kvSet(config, BUCKET, section, body);
          return Response.json({ ok: true });
        } catch (e) {
          console.error(e);
          return Response.json({ error: "Failed" }, { status: 500 });
        }
      }
    }
  }
});
const Route = createFileRoute("/api/ar-enrich")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!getBearerSession(request)) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        await request.json().catch(() => ({}));
        return Response.json({ ok: true, touched: 0 });
      }
    }
  }
});
const StudentRoute = Route$r.update({
  id: "/student",
  path: "/student",
  getParentRoute: () => Route$s
});
const SalesRoute = Route$q.update({
  id: "/sales",
  path: "/sales",
  getParentRoute: () => Route$s
});
const ResumeRoute = Route$p.update({
  id: "/resume",
  path: "/resume",
  getParentRoute: () => Route$s
});
const ProjectsRoute = Route$o.update({
  id: "/projects",
  path: "/projects",
  getParentRoute: () => Route$s
});
const MentorRoute = Route$n.update({
  id: "/mentor",
  path: "/mentor",
  getParentRoute: () => Route$s
});
const LoginRoute = Route$m.update({
  id: "/login",
  path: "/login",
  getParentRoute: () => Route$s
});
const ContactRoute = Route$l.update({
  id: "/contact",
  path: "/contact",
  getParentRoute: () => Route$s
});
const AdminRoute = Route$k.update({
  id: "/admin",
  path: "/admin",
  getParentRoute: () => Route$s
});
const IndexRoute = Route$j.update({
  id: "/",
  path: "/",
  getParentRoute: () => Route$s
});
const BlogSlugRoute = Route$i.update({
  id: "/blog/$slug",
  path: "/blog/$slug",
  getParentRoute: () => Route$s
});
const ApiUsersRoute = Route$h.update({
  id: "/api/users",
  path: "/api/users",
  getParentRoute: () => Route$s
});
const ApiTabOrderRoute = Route$g.update({
  id: "/api/tab-order",
  path: "/api/tab-order",
  getParentRoute: () => Route$s
});
const ApiSyncAssignmentsRoute = Route$f.update({
  id: "/api/sync-assignments",
  path: "/api/sync-assignments",
  getParentRoute: () => Route$s
});
const ApiSuggestionsRoute = Route$e.update({
  id: "/api/suggestions",
  path: "/api/suggestions",
  getParentRoute: () => Route$s
});
const ApiParseDocumentRoute = Route$d.update({
  id: "/api/parse-document",
  path: "/api/parse-document",
  getParentRoute: () => Route$s
});
const ApiMentorDocumentsRoute = Route$c.update({
  id: "/api/mentor-documents",
  path: "/api/mentor-documents",
  getParentRoute: () => Route$s
});
const ApiLitwitsDocsRoute = Route$b.update({
  id: "/api/litwits-docs",
  path: "/api/litwits-docs",
  getParentRoute: () => Route$s
});
const ApiLitwitsDocVersionsRoute = Route$a.update({
  id: "/api/litwits-doc-versions",
  path: "/api/litwits-doc-versions",
  getParentRoute: () => Route$s
});
const ApiLitwitsDocSyncRoute = Route$9.update({
  id: "/api/litwits-doc-sync",
  path: "/api/litwits-doc-sync",
  getParentRoute: () => Route$s
});
const ApiLitwitsDocActivityRoute = Route$8.update({
  id: "/api/litwits-doc-activity",
  path: "/api/litwits-doc-activity",
  getParentRoute: () => Route$s
});
const ApiLeadsRoute = Route$7.update({
  id: "/api/leads",
  path: "/api/leads",
  getParentRoute: () => Route$s
});
const ApiGoogleSheetsFetchRoute = Route$6.update({
  id: "/api/google-sheets-fetch",
  path: "/api/google-sheets-fetch",
  getParentRoute: () => Route$s
});
const ApiDocumentsRoute = Route$5.update({
  id: "/api/documents",
  path: "/api/documents",
  getParentRoute: () => Route$s
});
const ApiDocSyncRoute = Route$4.update({
  id: "/api/doc-sync",
  path: "/api/doc-sync",
  getParentRoute: () => Route$s
});
const ApiCommentsRoute = Route$3.update({
  id: "/api/comments",
  path: "/api/comments",
  getParentRoute: () => Route$s
});
const ApiAuthRoute = Route$2.update({
  id: "/api/auth",
  path: "/api/auth",
  getParentRoute: () => Route$s
});
const ApiArsrSheetsRoute = Route$1.update({
  id: "/api/arsr-sheets",
  path: "/api/arsr-sheets",
  getParentRoute: () => Route$s
});
const ApiArEnrichRoute = Route.update({
  id: "/api/ar-enrich",
  path: "/api/ar-enrich",
  getParentRoute: () => Route$s
});
const rootRouteChildren = {
  IndexRoute,
  AdminRoute,
  ContactRoute,
  LoginRoute,
  MentorRoute,
  ProjectsRoute,
  ResumeRoute,
  SalesRoute,
  StudentRoute,
  ApiArEnrichRoute,
  ApiArsrSheetsRoute,
  ApiAuthRoute,
  ApiCommentsRoute,
  ApiDocSyncRoute,
  ApiDocumentsRoute,
  ApiGoogleSheetsFetchRoute,
  ApiLeadsRoute,
  ApiLitwitsDocActivityRoute,
  ApiLitwitsDocSyncRoute,
  ApiLitwitsDocVersionsRoute,
  ApiLitwitsDocsRoute,
  ApiMentorDocumentsRoute,
  ApiParseDocumentRoute,
  ApiSuggestionsRoute,
  ApiSyncAssignmentsRoute,
  ApiTabOrderRoute,
  ApiUsersRoute,
  BlogSlugRoute
};
const routeTree = Route$s._addFileChildren(rootRouteChildren)._addFileTypes();
const getRouter = () => {
  const router2 = createRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreloadStaleTime: 0
  });
  return router2;
};
const router = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  getRouter
}, Symbol.toStringTag, { value: "Module" }));
export {
  Route$i as R,
  apiFetch as a,
  setUser as b,
  clearAuth as c,
  getUser as g,
  router as r,
  setToken as s
};
