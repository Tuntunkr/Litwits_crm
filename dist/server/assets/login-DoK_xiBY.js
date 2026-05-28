import { jsx, jsxs } from "react/jsx-runtime";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { s as setToken, b as setUser } from "./router-j_nH2NkM.js";
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
function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [validityExpired, setValidityExpired] = useState(null);
  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setValidityExpired(null);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email: email.trim(),
          password
        })
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error === "validity_expired") {
          setValidityExpired({
            endDate: data.endDate || "N/A",
            renewalLink: data.renewalLink || "https://litwits.in/membership"
          });
          return;
        }
        setError(data.error || "Invalid credentials");
        return;
      }
      setToken(data.token);
      setUser(data.user);
      if (data.user.role === "admin") navigate({
        to: "/admin"
      });
      else if (data.user.role === "mentor") navigate({
        to: "/mentor"
      });
      else navigate({
        to: "/student"
      });
    } catch {
      setError("Unable to connect. Please try again.");
    } finally {
      setLoading(false);
    }
  }
  return /* @__PURE__ */ jsx("div", { className: "min-h-screen bg-white flex items-center justify-center px-4", children: /* @__PURE__ */ jsxs("div", { className: "w-full max-w-xs flex flex-col items-center", children: [
    /* @__PURE__ */ jsx("div", { className: "text-8xl font-bold text-[#A52A2A] leading-none mb-4 select-none", style: {
      fontFamily: '"Playfair Display", serif',
      letterSpacing: "-0.04em"
    }, children: "LW" }),
    /* @__PURE__ */ jsx("p", { className: "text-xs tracking-[0.35em] text-gray-400 uppercase mb-12", children: "THINK. DEBATE. WRITE." }),
    /* @__PURE__ */ jsxs("form", { onSubmit: handleSubmit, className: "w-full space-y-5", children: [
      /* @__PURE__ */ jsx("div", { children: /* @__PURE__ */ jsx("input", { type: "email", placeholder: "Email address", value: email, onChange: (e) => setEmail(e.target.value), required: true, autoComplete: "email", className: "w-full bg-transparent border-0 border-b border-gray-300 py-3 text-sm outline-none focus:border-[#A52A2A] transition-colors placeholder-gray-400" }) }),
      /* @__PURE__ */ jsx("div", { children: /* @__PURE__ */ jsx("input", { type: "password", placeholder: "Password", value: password, onChange: (e) => setPassword(e.target.value), required: true, autoComplete: "current-password", className: "w-full bg-transparent border-0 border-b border-gray-300 py-3 text-sm outline-none focus:border-[#A52A2A] transition-colors placeholder-gray-400" }) }),
      error && /* @__PURE__ */ jsx("p", { className: "text-xs text-red-600 text-center", children: error }),
      validityExpired && /* @__PURE__ */ jsxs("div", { className: "bg-red-50 border border-red-200 rounded-lg p-4 text-center space-y-2", children: [
        /* @__PURE__ */ jsxs("p", { className: "text-sm text-red-700 font-medium", children: [
          "Your validity is expired on ",
          validityExpired.endDate
        ] }),
        /* @__PURE__ */ jsx("p", { className: "text-xs text-red-600", children: "Kindly renewal your package by clicking the link below" }),
        /* @__PURE__ */ jsx("a", { href: validityExpired.renewalLink, target: "_blank", rel: "noopener noreferrer", className: "inline-block text-xs text-[#A52A2A] underline hover:text-[#8B1A1A] font-medium", children: validityExpired.renewalLink })
      ] }),
      /* @__PURE__ */ jsx("button", { type: "submit", disabled: loading, className: "w-full mt-4 bg-[#A52A2A] text-white py-3 text-xs tracking-[0.2em] uppercase font-medium hover:bg-[#8B1A1A] active:bg-[#7A1515] transition-colors disabled:opacity-50 disabled:cursor-not-allowed", children: loading ? "Signing in…" : "Login" })
    ] })
  ] }) });
}
export {
  LoginPage as component
};
