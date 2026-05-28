import { jsx, jsxs } from "react/jsx-runtime";
import { Link } from "@tanstack/react-router";
import { marked } from "marked";
import { B as Badge } from "./badge-BxI9hQBx.js";
import { ArrowLeft, Calendar } from "lucide-react";
import { R as Route } from "./router-j_nH2NkM.js";
import "@radix-ui/react-slot";
import "class-variance-authority";
import "clsx";
import "tailwind-merge";
import "react";
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
const allBlogs = [
  {
    "title": "Blog Post 3",
    "date": "2026-01-15",
    "summary": "Summary of blog post 3.",
    "tags": [
      "Tag 2",
      "Tag 4"
    ],
    "author": "Your Name",
    "content": "Content for blog post 3.",
    "_meta": {
      "filePath": "getting-started-with-tanstack.md",
      "fileName": "getting-started-with-tanstack.md",
      "directory": ".",
      "extension": "md",
      "path": "getting-started-with-tanstack"
    }
  },
  {
    "title": "Blog Post 1",
    "date": "2026-02-10",
    "summary": "Summary of blog post 1.",
    "tags": [
      "Tag 1",
      "Tag 2"
    ],
    "author": "Your Name",
    "content": "Content for blog post 1.",
    "_meta": {
      "filePath": "react-19-features.md",
      "fileName": "react-19-features.md",
      "directory": ".",
      "extension": "md",
      "path": "react-19-features"
    }
  },
  {
    "title": "Blog Post 2",
    "date": "2026-02-01",
    "summary": "Summary of blog post 2.",
    "tags": [
      "Tag 1",
      "Tag 3"
    ],
    "author": "Your Name",
    "content": "Content for blog post 2.",
    "_meta": {
      "filePath": "tailwind-css-v4-guide.md",
      "fileName": "tailwind-css-v4-guide.md",
      "directory": ".",
      "extension": "md",
      "path": "tailwind-css-v4-guide"
    }
  }
];
function BlogPost() {
  const {
    slug
  } = Route.useParams();
  const post = allBlogs.find((p) => p._meta.path === slug);
  if (!post) {
    return /* @__PURE__ */ jsx("div", { className: "min-h-screen  flex items-center justify-center", children: /* @__PURE__ */ jsxs("div", { className: "text-center", children: [
      /* @__PURE__ */ jsx("h1", { className: "text-2xl font-bold text-gray-900 mb-4", children: "Post not found" }),
      /* @__PURE__ */ jsx(Link, { to: "/", className: "text-blue-600 hover:underline", children: "Back to blog" })
    ] }) });
  }
  const html = marked(post.content);
  return /* @__PURE__ */ jsx("div", { className: "min-h-screen ", children: /* @__PURE__ */ jsxs("div", { className: "max-w-3xl mx-auto px-4 py-12", children: [
    /* @__PURE__ */ jsxs(Link, { to: "/", className: "inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-8", children: [
      /* @__PURE__ */ jsx(ArrowLeft, { size: 16 }),
      "Back to blog"
    ] }),
    /* @__PURE__ */ jsxs("article", { children: [
      /* @__PURE__ */ jsxs("header", { className: "mb-8", children: [
        /* @__PURE__ */ jsx("h1", { className: "text-4xl font-bold text-gray-900 mb-4", children: post.title }),
        /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3 text-gray-500 mb-4", children: [
          /* @__PURE__ */ jsx(Calendar, { size: 16 }),
          /* @__PURE__ */ jsx("time", { children: new Date(post.date).toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric"
          }) }),
          /* @__PURE__ */ jsx("span", { children: "·" }),
          /* @__PURE__ */ jsx("span", { children: post.author })
        ] }),
        /* @__PURE__ */ jsx("div", { className: "flex flex-wrap gap-2", children: post.tags.map((tag) => /* @__PURE__ */ jsx(Badge, { variant: "secondary", children: tag }, tag)) })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "prose prose-gray max-w-none", dangerouslySetInnerHTML: {
        __html: html
      } })
    ] })
  ] }) });
}
export {
  BlogPost as component
};
