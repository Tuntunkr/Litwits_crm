import { jsx, jsxs } from "react/jsx-runtime";
import { useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { g as getUser, a as apiFetch, c as clearAuth } from "./router-j_nH2NkM.js";
import "@tiptap/react";
import "@tiptap/starter-kit";
import "@tiptap/extension-underline";
import "@tiptap/extension-text-style";
import "@tiptap/extension-font-family";
import "@tiptap/extension-color";
import "@tiptap/extension-highlight";
import "@tiptap/extension-text-align";
import "@tiptap/extension-task-list";
import "@tiptap/extension-task-item";
import "@tiptap/extension-table";
import "@tiptap/extension-table-row";
import "@tiptap/extension-table-cell";
import "@tiptap/extension-table-header";
import "@tiptap/extension-link";
import "@tiptap/extension-image";
import "@tiptap/extension-horizontal-rule";
import "@tiptap/extension-placeholder";
import "@tiptap/extension-character-count";
import "@tiptap/extension-subscript";
import "@tiptap/extension-superscript";
import "@tiptap/core";
import "xlsx";
import "node:crypto";
const PIPELINE_COLUMNS = ["New Query", "Contacted", "Interested", "Converted", "Closed"];
const SOURCE_BADGES = {
  WhatsApp: {
    label: "WhatsApp",
    classes: "bg-green-100 text-green-700"
  },
  Instagram: {
    label: "Instagram",
    classes: "bg-pink-100 text-pink-700"
  },
  Facebook: {
    label: "Facebook",
    classes: "bg-blue-100 text-blue-700"
  }
};
const STATUS_BADGES = {
  "New Query": "bg-amber-100 text-amber-700",
  Contacted: "bg-sky-100 text-sky-700",
  Interested: "bg-violet-100 text-violet-700",
  Converted: "bg-emerald-100 text-emerald-700",
  Closed: "bg-gray-100 text-gray-600",
  "Not Responded": "bg-rose-100 text-rose-700"
};
const SEED_LEADS = [{
  id: "lead-1",
  name: "Demo User",
  phone: "9999999999",
  source: "WhatsApp",
  lastMessage: "Hi, can I get more info on your courses?",
  status: "New Query",
  createdAt: Date.now() - 1e3 * 60 * 30
}, {
  id: "lead-2",
  name: "Aarav Mehta",
  phone: "9876543210",
  source: "Instagram",
  lastMessage: "Saw your reel — what are the timings?",
  status: "Contacted",
  createdAt: Date.now() - 1e3 * 60 * 60 * 4
}, {
  id: "lead-3",
  name: "Priya Shah",
  phone: "9123456780",
  source: "Facebook",
  lastMessage: "Interested in the writing workshop.",
  status: "Interested",
  createdAt: Date.now() - 1e3 * 60 * 60 * 26
}, {
  id: "lead-4",
  name: "Rohan Kapoor",
  phone: "9988776655",
  source: "WhatsApp",
  lastMessage: "Booked the slot — sending payment now.",
  status: "Converted",
  createdAt: Date.now() - 1e3 * 60 * 60 * 50
}, {
  id: "lead-5",
  name: "Sneha Iyer",
  phone: "9090909090",
  source: "Instagram",
  lastMessage: "Will get back next week.",
  status: "Closed",
  createdAt: Date.now() - 1e3 * 60 * 60 * 80
}, {
  id: "lead-6",
  name: "Kabir Singh",
  phone: "9012345678",
  source: "Facebook",
  lastMessage: "Sent two follow-ups — no reply.",
  status: "Not Responded",
  createdAt: Date.now() - 1e3 * 60 * 60 * 100
}];
function Wordmark() {
  return /* @__PURE__ */ jsx("span", { className: "text-2xl font-bold text-[#A52A2A] tracking-tight", style: {
    fontFamily: '"Playfair Display", serif'
  }, children: "LITWITS" });
}
function StatCard({
  label,
  value,
  accent
}) {
  return /* @__PURE__ */ jsxs("div", { className: "bg-white border border-gray-200 rounded-lg p-5 flex flex-col gap-2 shadow-sm", children: [
    /* @__PURE__ */ jsx("span", { className: "text-xs uppercase tracking-wide text-gray-400", children: label }),
    /* @__PURE__ */ jsx("span", { className: `text-3xl font-semibold ${accent}`, children: value })
  ] });
}
function SourceBadge({
  source
}) {
  const cfg = SOURCE_BADGES[source];
  return /* @__PURE__ */ jsx("span", { className: `inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full ${cfg.classes}`, children: cfg.label });
}
function StatusBadge({
  status
}) {
  return /* @__PURE__ */ jsx("span", { className: `inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full ${STATUS_BADGES[status]}`, children: status });
}
function formatTime(ts) {
  return new Date(ts).toLocaleString(void 0, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}
function SalesDashboard() {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState(null);
  const [leads, setLeads] = useState([]);
  const [leadsError, setLeadsError] = useState("");
  const [draggingId, setDraggingId] = useState(null);
  const [hoverColumn, setHoverColumn] = useState(null);
  useEffect(() => {
    const u = getUser();
    if (!u || u.role !== "admin") {
      navigate({
        to: "/login"
      });
      return;
    }
    setCurrentUser(u);
  }, []);
  useEffect(() => {
    if (!currentUser) return;
    let cancelled = false;
    (async () => {
      setLeadsError("");
      try {
        const res = await apiFetch("/api/leads");
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setLeads(SEED_LEADS);
          setLeadsError(typeof data.error === "string" ? data.error : "Using offline demo leads.");
          return;
        }
        const list = Array.isArray(data.leads) ? data.leads : [];
        setLeads(list.length ? list : SEED_LEADS);
      } catch {
        if (!cancelled) {
          setLeads(SEED_LEADS);
          setLeadsError("Could not reach leads API — showing demo data.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentUser]);
  const stats = useMemo(() => {
    const total = leads.length;
    const newQueries = leads.filter((l) => l.status === "New Query").length;
    const inProgress = leads.filter((l) => l.status === "Contacted" || l.status === "Interested").length;
    const converted = leads.filter((l) => l.status === "Converted").length;
    const notResponded = leads.filter((l) => l.status === "Not Responded").length;
    return {
      total,
      newQueries,
      inProgress,
      converted,
      notResponded
    };
  }, [leads]);
  const grouped = useMemo(() => {
    const map = {
      "New Query": [],
      Contacted: [],
      Interested: [],
      Converted: [],
      Closed: [],
      "Not Responded": []
    };
    for (const lead of leads) map[lead.status].push(lead);
    return map;
  }, [leads]);
  function moveLead(leadId, target) {
    setLeads((prev) => prev.map((l) => l.id === leadId ? {
      ...l,
      status: target
    } : l));
    void apiFetch("/api/leads", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        id: leadId,
        status: target
      })
    }).catch(() => {
    });
  }
  async function handleLogout() {
    await apiFetch("/api/auth", {
      method: "DELETE"
    }).catch(() => {
    });
    clearAuth();
    navigate({
      to: "/login"
    });
  }
  if (!currentUser) {
    return /* @__PURE__ */ jsx("div", { className: "h-screen flex items-center justify-center bg-gray-50 text-sm text-gray-400", children: "Loading..." });
  }
  return /* @__PURE__ */ jsxs("div", { className: "h-screen bg-gray-50 flex flex-col overflow-hidden", children: [
    /* @__PURE__ */ jsxs("header", { className: "bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between flex-none z-20", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-6", children: [
        /* @__PURE__ */ jsx(Wordmark, {}),
        /* @__PURE__ */ jsx("span", { className: "text-xs uppercase tracking-wide text-gray-400", children: "Sales CRM" })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-4", children: [
        /* @__PURE__ */ jsx("button", { onClick: () => navigate({
          to: "/admin"
        }), className: "text-xs text-gray-500 hover:text-[#A52A2A] transition-colors uppercase tracking-wide", children: "← Back to Admin" }),
        /* @__PURE__ */ jsx("span", { className: "text-sm text-gray-500 hidden sm:block", children: currentUser?.name }),
        /* @__PURE__ */ jsx("button", { onClick: handleLogout, className: "text-xs text-gray-500 hover:text-[#A52A2A] transition-colors uppercase tracking-wide", children: "Logout" })
      ] })
    ] }),
    /* @__PURE__ */ jsx("main", { className: "flex-1 min-h-0 overflow-auto", children: /* @__PURE__ */ jsxs("div", { className: "max-w-7xl mx-auto w-full p-6 flex flex-col gap-10", children: [
      /* @__PURE__ */ jsxs("section", { children: [
        /* @__PURE__ */ jsx("h1", { className: "text-2xl font-semibold text-gray-800 mb-1", style: {
          fontFamily: '"Playfair Display", serif'
        }, children: "Sales Dashboard" }),
        /* @__PURE__ */ jsx("p", { className: "text-sm text-gray-500 mb-5", children: "Snapshot of incoming leads across channels." }),
        leadsError && /* @__PURE__ */ jsx("p", { className: "text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-md px-3 py-2 mb-4", children: leadsError }),
        /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4", children: [
          /* @__PURE__ */ jsx(StatCard, { label: "Total Leads", value: stats.total, accent: "text-gray-800" }),
          /* @__PURE__ */ jsx(StatCard, { label: "New Queries", value: stats.newQueries, accent: "text-amber-600" }),
          /* @__PURE__ */ jsx(StatCard, { label: "In Progress", value: stats.inProgress, accent: "text-sky-600" }),
          /* @__PURE__ */ jsx(StatCard, { label: "Converted", value: stats.converted, accent: "text-emerald-600" }),
          /* @__PURE__ */ jsx(StatCard, { label: "Not Responded", value: stats.notResponded, accent: "text-rose-600" })
        ] })
      ] }),
      /* @__PURE__ */ jsxs("section", { children: [
        /* @__PURE__ */ jsxs("div", { className: "flex items-baseline justify-between mb-3", children: [
          /* @__PURE__ */ jsx("h2", { className: "text-xl font-semibold text-gray-800", style: {
            fontFamily: '"Playfair Display", serif'
          }, children: "Pipeline" }),
          /* @__PURE__ */ jsx("p", { className: "text-xs text-gray-400", children: "Drag cards between columns to update status." })
        ] }),
        /* @__PURE__ */ jsx("div", { className: "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4", children: PIPELINE_COLUMNS.map((col) => /* @__PURE__ */ jsxs("div", { onDragOver: (e) => {
          e.preventDefault();
          if (hoverColumn !== col) setHoverColumn(col);
        }, onDragLeave: () => {
          if (hoverColumn === col) setHoverColumn(null);
        }, onDrop: (e) => {
          e.preventDefault();
          const id = e.dataTransfer.getData("text/plain") || draggingId;
          if (id) moveLead(id, col);
          setDraggingId(null);
          setHoverColumn(null);
        }, className: `flex flex-col rounded-lg border bg-white min-h-[260px] transition-colors ${hoverColumn === col ? "border-[#A52A2A] bg-[#A52A2A]/5" : "border-gray-200"}`, children: [
          /* @__PURE__ */ jsxs("div", { className: "px-4 py-3 border-b border-gray-100 flex items-center justify-between", children: [
            /* @__PURE__ */ jsx("span", { className: "text-sm font-semibold text-gray-700", children: col }),
            /* @__PURE__ */ jsx("span", { className: "text-[11px] text-gray-400", children: grouped[col].length })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "flex-1 p-3 flex flex-col gap-2", children: [
            grouped[col].length === 0 && /* @__PURE__ */ jsx("p", { className: "text-[11px] text-gray-300 italic px-1", children: "No leads" }),
            grouped[col].map((lead) => /* @__PURE__ */ jsxs("div", { draggable: true, onDragStart: (e) => {
              e.dataTransfer.setData("text/plain", lead.id);
              e.dataTransfer.effectAllowed = "move";
              setDraggingId(lead.id);
            }, onDragEnd: () => {
              setDraggingId(null);
              setHoverColumn(null);
            }, className: `bg-white border rounded-md p-3 shadow-sm cursor-grab active:cursor-grabbing flex flex-col gap-1.5 ${draggingId === lead.id ? "opacity-60 border-[#A52A2A]" : "border-gray-200 hover:border-[#A52A2A]"}`, children: [
              /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between gap-2", children: [
                /* @__PURE__ */ jsx("span", { className: "text-sm font-semibold text-gray-800 truncate", children: lead.name }),
                /* @__PURE__ */ jsx(SourceBadge, { source: lead.source })
              ] }),
              /* @__PURE__ */ jsx("span", { className: "text-[11px] text-gray-500", children: lead.phone }),
              /* @__PURE__ */ jsx("p", { className: "text-xs text-gray-600 line-clamp-2", children: lead.lastMessage }),
              /* @__PURE__ */ jsx("div", { className: "pt-1", children: /* @__PURE__ */ jsx(StatusBadge, { status: lead.status }) })
            ] }, lead.id))
          ] })
        ] }, col)) })
      ] }),
      /* @__PURE__ */ jsxs("section", { children: [
        /* @__PURE__ */ jsx("h2", { className: "text-xl font-semibold text-gray-800 mb-3", style: {
          fontFamily: '"Playfair Display", serif'
        }, children: "Leads" }),
        /* @__PURE__ */ jsx("div", { className: "bg-white border border-gray-200 rounded-lg overflow-hidden", children: /* @__PURE__ */ jsx("div", { className: "overflow-x-auto", children: /* @__PURE__ */ jsxs("table", { className: "min-w-full text-sm", children: [
          /* @__PURE__ */ jsx("thead", { className: "bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500", children: /* @__PURE__ */ jsxs("tr", { children: [
            /* @__PURE__ */ jsx("th", { className: "px-4 py-3 font-medium", children: "Name" }),
            /* @__PURE__ */ jsx("th", { className: "px-4 py-3 font-medium", children: "Phone" }),
            /* @__PURE__ */ jsx("th", { className: "px-4 py-3 font-medium", children: "Source" }),
            /* @__PURE__ */ jsx("th", { className: "px-4 py-3 font-medium", children: "Status" }),
            /* @__PURE__ */ jsx("th", { className: "px-4 py-3 font-medium", children: "Created" })
          ] }) }),
          /* @__PURE__ */ jsxs("tbody", { className: "divide-y divide-gray-100", children: [
            leads.map((lead) => /* @__PURE__ */ jsxs("tr", { className: "hover:bg-gray-50", children: [
              /* @__PURE__ */ jsx("td", { className: "px-4 py-3 text-gray-800 font-medium", children: lead.name }),
              /* @__PURE__ */ jsx("td", { className: "px-4 py-3 text-gray-600", children: lead.phone }),
              /* @__PURE__ */ jsx("td", { className: "px-4 py-3", children: /* @__PURE__ */ jsx(SourceBadge, { source: lead.source }) }),
              /* @__PURE__ */ jsx("td", { className: "px-4 py-3", children: /* @__PURE__ */ jsx(StatusBadge, { status: lead.status }) }),
              /* @__PURE__ */ jsx("td", { className: "px-4 py-3 text-gray-500 text-xs", children: formatTime(lead.createdAt) })
            ] }, lead.id)),
            leads.length === 0 && /* @__PURE__ */ jsx("tr", { children: /* @__PURE__ */ jsx("td", { colSpan: 5, className: "px-4 py-6 text-center text-sm text-gray-400", children: "No leads yet." }) })
          ] })
        ] }) }) })
      ] }),
      /* @__PURE__ */ jsxs("section", { children: [
        /* @__PURE__ */ jsx("h2", { className: "text-xl font-semibold text-gray-800 mb-1", style: {
          fontFamily: '"Playfair Display", serif'
        }, children: "Connect Meta Platforms" }),
        /* @__PURE__ */ jsx("p", { className: "text-sm text-gray-500 mb-4", children: "Plug in your Meta channels to start pulling leads automatically. (UI placeholders — not yet connected.)" }),
        /* @__PURE__ */ jsx("div", { className: "grid grid-cols-1 sm:grid-cols-3 gap-4", children: [{
          key: "WhatsApp",
          label: "Connect WhatsApp",
          desc: "Capture leads from WhatsApp Business inbox.",
          dot: "bg-green-500"
        }, {
          key: "Instagram",
          label: "Connect Instagram",
          desc: "Sync DMs and story replies as leads.",
          dot: "bg-pink-500"
        }, {
          key: "Facebook",
          label: "Connect Facebook",
          desc: "Import Page messages and lead-form submissions.",
          dot: "bg-blue-500"
        }].map((p) => /* @__PURE__ */ jsxs("div", { className: "bg-white border border-gray-200 rounded-lg p-5 flex flex-col gap-3", children: [
          /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
            /* @__PURE__ */ jsx("span", { className: `inline-block w-2 h-2 rounded-full ${p.dot}` }),
            /* @__PURE__ */ jsx("span", { className: "text-sm font-semibold text-gray-800", children: p.key }),
            /* @__PURE__ */ jsx("span", { className: "ml-auto text-[11px] text-gray-400 uppercase tracking-wide", children: "Not connected" })
          ] }),
          /* @__PURE__ */ jsx("p", { className: "text-xs text-gray-500 flex-1", children: p.desc }),
          /* @__PURE__ */ jsx("button", { onClick: () => alert(`${p.label} — integration coming soon.`), className: "text-sm font-medium text-white bg-[#A52A2A] hover:bg-[#8a2222] transition-colors rounded-md px-4 py-2", children: p.label })
        ] }, p.key)) })
      ] })
    ] }) })
  ] });
}
export {
  SalesDashboard as component
};
