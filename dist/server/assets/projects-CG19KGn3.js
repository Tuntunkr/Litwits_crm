import { jsx, jsxs } from "react/jsx-runtime";
import { C as Card, b as CardHeader, c as CardTitle, a as CardContent } from "./card-DJsljjq_.js";
import { B as Badge } from "./badge-BxI9hQBx.js";
import { Github, ExternalLink } from "lucide-react";
import "@radix-ui/react-slot";
import "class-variance-authority";
import "clsx";
import "tailwind-merge";
const allProjects = [
  {
    "title": "Project 2",
    "description": "Description of project 2.",
    "tags": [
      "Tag 1",
      "Tag 4",
      "Tag 5"
    ],
    "github": "https://github.com/your-username/project-2",
    "liveUrl": "https://project-2.example.com",
    "content": "Details about project 2 and what it does.",
    "_meta": {
      "filePath": "portfolio-site.md",
      "fileName": "portfolio-site.md",
      "directory": ".",
      "extension": "md",
      "path": "portfolio-site"
    }
  },
  {
    "title": "Project 1",
    "description": "Description of project 1.",
    "tags": [
      "Tag 1",
      "Tag 2",
      "Tag 3"
    ],
    "github": "https://github.com/your-username/project-1",
    "liveUrl": "https://project-1.example.com",
    "content": "Details about project 1 and what it does.",
    "_meta": {
      "filePath": "task-manager.md",
      "fileName": "task-manager.md",
      "directory": ".",
      "extension": "md",
      "path": "task-manager"
    }
  }
];
function Projects() {
  return /* @__PURE__ */ jsx("div", { className: "min-h-screen", children: /* @__PURE__ */ jsxs("div", { className: "max-w-4xl mx-auto px-4 py-12", children: [
    /* @__PURE__ */ jsx("h1", { className: "text-4xl font-bold text-gray-900 mb-2", children: "Projects" }),
    /* @__PURE__ */ jsx("p", { className: "text-gray-600 mb-8", children: "A selection of projects I've built and contributed to." }),
    /* @__PURE__ */ jsx("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-6", children: allProjects.map((project) => /* @__PURE__ */ jsxs(Card, { className: "flex flex-col", children: [
      /* @__PURE__ */ jsx(CardHeader, { children: /* @__PURE__ */ jsx(CardTitle, { className: "text-xl", children: project.title }) }),
      /* @__PURE__ */ jsxs(CardContent, { className: "flex-1 flex flex-col", children: [
        /* @__PURE__ */ jsx("p", { className: "text-gray-600 mb-4 flex-1", children: project.description }),
        /* @__PURE__ */ jsx("div", { className: "flex flex-wrap gap-2 mb-4", children: project.tags.map((tag) => /* @__PURE__ */ jsx(Badge, { variant: "secondary", children: tag }, tag)) }),
        /* @__PURE__ */ jsxs("div", { className: "flex gap-3", children: [
          project.github && /* @__PURE__ */ jsxs("a", { href: project.github, target: "_blank", rel: "noopener noreferrer", className: "inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors", children: [
            /* @__PURE__ */ jsx(Github, { size: 16 }),
            "GitHub"
          ] }),
          project.liveUrl && /* @__PURE__ */ jsxs("a", { href: project.liveUrl, target: "_blank", rel: "noopener noreferrer", className: "inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 transition-colors", children: [
            /* @__PURE__ */ jsx(ExternalLink, { size: 16 }),
            "Live Demo"
          ] })
        ] })
      ] })
    ] }, project._meta.path)) })
  ] }) });
}
export {
  Projects as component
};
