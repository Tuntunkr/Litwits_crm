import { jsx, jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { Mail, Send } from "lucide-react";
function Contact() {
  const [submitted, setSubmitted] = useState(false);
  if (submitted) {
    return /* @__PURE__ */ jsx("div", { className: "min-h-screen flex items-center justify-center", children: /* @__PURE__ */ jsxs("div", { className: "text-center max-w-md mx-auto px-4", children: [
      /* @__PURE__ */ jsx("div", { className: "w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4", children: /* @__PURE__ */ jsx(Mail, { className: "w-8 h-8 text-green-600" }) }),
      /* @__PURE__ */ jsx("h2", { className: "text-2xl font-bold text-gray-900 mb-2", children: "Message Sent!" }),
      /* @__PURE__ */ jsx("p", { className: "text-gray-600 mb-6", children: "Thanks for reaching out. I'll get back to you as soon as possible." }),
      /* @__PURE__ */ jsx("button", { onClick: () => setSubmitted(false), className: "px-6 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors", children: "Send Another Message" })
    ] }) });
  }
  return /* @__PURE__ */ jsx("div", { className: "min-h-screen", children: /* @__PURE__ */ jsxs("div", { className: "max-w-2xl mx-auto px-4 py-12", children: [
    /* @__PURE__ */ jsx("h1", { className: "text-4xl font-bold text-gray-900 mb-2", children: "Contact" }),
    /* @__PURE__ */ jsx("p", { className: "text-gray-600 mb-8", children: "Have a question or want to work together? Drop me a message." }),
    /* @__PURE__ */ jsxs("form", { name: "contact", method: "POST", "data-netlify": "true", "netlify-honeypot": "bot-field", onSubmit: (e) => {
      e.preventDefault();
      const form = e.currentTarget;
      const formData = new FormData(form);
      fetch("/contact.html", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams(formData).toString()
      }).then(() => setSubmitted(true));
    }, className: "space-y-6", children: [
      /* @__PURE__ */ jsx("input", { type: "hidden", name: "form-name", value: "contact" }),
      /* @__PURE__ */ jsx("p", { hidden: true, children: /* @__PURE__ */ jsxs("label", { children: [
        "Don't fill this out: ",
        /* @__PURE__ */ jsx("input", { name: "bot-field" })
      ] }) }),
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("label", { htmlFor: "name", className: "block text-sm font-medium text-gray-700 mb-1", children: "Name" }),
        /* @__PURE__ */ jsx("input", { type: "text", id: "name", name: "name", required: true, className: "w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors", placeholder: "Your name" })
      ] }),
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("label", { htmlFor: "email", className: "block text-sm font-medium text-gray-700 mb-1", children: "Email" }),
        /* @__PURE__ */ jsx("input", { type: "email", id: "email", name: "email", required: true, className: "w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors", placeholder: "your@email.com" })
      ] }),
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("label", { htmlFor: "message", className: "block text-sm font-medium text-gray-700 mb-1", children: "Message" }),
        /* @__PURE__ */ jsx("textarea", { id: "message", name: "message", required: true, rows: 6, className: "w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors resize-none", placeholder: "Your message..." })
      ] }),
      /* @__PURE__ */ jsxs("button", { type: "submit", className: "inline-flex items-center gap-2 px-6 py-3 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors font-medium", children: [
        /* @__PURE__ */ jsx(Send, { size: 16 }),
        "Send Message"
      ] })
    ] })
  ] }) });
}
export {
  Contact as component
};
