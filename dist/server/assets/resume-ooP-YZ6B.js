import { jsx, jsxs } from "react/jsx-runtime";
import { marked } from "marked";
import { C as Card, b as CardHeader, c as CardTitle, a as CardContent } from "./card-DJsljjq_.js";
import { c as cn, B as Badge } from "./badge-BxI9hQBx.js";
import * as SeparatorPrimitive from "@radix-ui/react-separator";
import * as HoverCardPrimitive from "@radix-ui/react-hover-card";
import "@radix-ui/react-slot";
import "class-variance-authority";
import "clsx";
import "tailwind-merge";
const allJobs = [
  {
    "jobTitle": "Job Title 1",
    "summary": "Summary of responsibilities and achievements for this role.",
    "startDate": "2021-01-01",
    "endDate": "2021-12-31",
    "company": "Company 1",
    "location": "Remote",
    "tags": [
      "Skill 1",
      "Skill 2",
      "Skill 3"
    ],
    "content": "Description of work done in this role.",
    "_meta": {
      "filePath": "initech-junior.md",
      "fileName": "initech-junior.md",
      "directory": ".",
      "extension": "md",
      "path": "initech-junior"
    }
  },
  {
    "jobTitle": "Job Title 2",
    "summary": "Summary of responsibilities and achievements for this role.",
    "startDate": "2022-01-01",
    "endDate": "2022-12-31",
    "company": "Company 2",
    "location": "Remote",
    "tags": [
      "Skill 1",
      "Skill 4",
      "Skill 5"
    ],
    "content": "Description of work done in this role.",
    "_meta": {
      "filePath": "job-2.md",
      "fileName": "job-2.md",
      "directory": ".",
      "extension": "md",
      "path": "job-2"
    }
  }
];
const allEducations = [
  {
    "school": "School 1",
    "summary": "Degree or Certificate Program",
    "startDate": "2020-01-01",
    "endDate": "2020-12-31",
    "tags": [
      "Skill 1",
      "Skill 2",
      "Skill 3"
    ],
    "content": "Description of the program and what was learned.",
    "_meta": {
      "filePath": "code-school.md",
      "fileName": "code-school.md",
      "directory": ".",
      "extension": "md",
      "path": "code-school"
    }
  }
];
function Separator({
  className,
  orientation = "horizontal",
  decorative = true,
  ...props
}) {
  return /* @__PURE__ */ jsx(
    SeparatorPrimitive.Root,
    {
      "data-slot": "separator-root",
      decorative,
      orientation,
      className: cn(
        "bg-border shrink-0 data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-px",
        className
      ),
      ...props
    }
  );
}
function HoverCard({
  ...props
}) {
  return /* @__PURE__ */ jsx(HoverCardPrimitive.Root, { "data-slot": "hover-card", ...props });
}
function HoverCardTrigger({
  ...props
}) {
  return /* @__PURE__ */ jsx(HoverCardPrimitive.Trigger, { "data-slot": "hover-card-trigger", ...props });
}
function HoverCardContent({
  className,
  align = "center",
  sideOffset = 4,
  ...props
}) {
  return /* @__PURE__ */ jsx(HoverCardPrimitive.Portal, { "data-slot": "hover-card-portal", children: /* @__PURE__ */ jsx(
    HoverCardPrimitive.Content,
    {
      "data-slot": "hover-card-content",
      align,
      sideOffset,
      className: cn(
        "bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 w-64 origin-(--radix-hover-card-content-transform-origin) rounded-md border p-4 shadow-md outline-hidden",
        className
      ),
      ...props
    }
  ) });
}
function App() {
  return /* @__PURE__ */ jsx("div", { className: "min-h-screen p-8 lg:p-12", children: /* @__PURE__ */ jsxs("div", { className: "max-w-4xl mx-auto space-y-12", children: [
    /* @__PURE__ */ jsxs("div", { className: "text-center space-y-4", children: [
      /* @__PURE__ */ jsx("h1", { className: "text-5xl font-bold", children: "My Resume" }),
      /* @__PURE__ */ jsx("p", { className: "text-lg", children: "Professional Experience & Education" }),
      /* @__PURE__ */ jsx(Separator, { className: "mt-8" })
    ] }),
    /* @__PURE__ */ jsxs(Card, { children: [
      /* @__PURE__ */ jsx(CardHeader, { children: /* @__PURE__ */ jsx(CardTitle, { className: "text-2xl", children: "Career Summary" }) }),
      /* @__PURE__ */ jsx(CardContent, { children: /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-8", children: [
        /* @__PURE__ */ jsx("p", { className: "flex-1 leading-relaxed", children: "I am a passionate and driven professional seeking opportunities that will leverage my extensive experience in frontend development while providing continuous growth and learning opportunities. My goal is to contribute to innovative projects that challenge me to expand my skill set and make meaningful impacts through technology." }),
        /* @__PURE__ */ jsx("img", { src: "/headshot-on-white.jpg", alt: "Professional headshot", className: "w-44 h-52 rounded-2xl object-cover" })
      ] }) })
    ] }),
    /* @__PURE__ */ jsxs("section", { className: "space-y-6", children: [
      /* @__PURE__ */ jsx("h2", { className: "text-3xl font-semibold", children: "Work Experience" }),
      /* @__PURE__ */ jsx("div", { className: "space-y-6", children: allJobs.map((job) => /* @__PURE__ */ jsxs(Card, { children: [
        /* @__PURE__ */ jsx(CardHeader, { children: /* @__PURE__ */ jsxs("div", { className: "flex justify-between items-start", children: [
          /* @__PURE__ */ jsxs("div", { className: "space-y-2", children: [
            /* @__PURE__ */ jsx(CardTitle, { className: "text-xl", children: job.jobTitle }),
            /* @__PURE__ */ jsxs("p", { className: "font-medium", children: [
              job.company,
              " - ",
              job.location
            ] })
          ] }),
          /* @__PURE__ */ jsxs(Badge, { variant: "secondary", className: "text-sm", children: [
            job.startDate,
            " - ",
            job.endDate || "Present"
          ] })
        ] }) }),
        /* @__PURE__ */ jsxs(CardContent, { children: [
          /* @__PURE__ */ jsx("p", { className: "mb-6 leading-relaxed", children: job.summary }),
          /* @__PURE__ */ jsx("div", { className: "flex flex-wrap gap-2", children: job.tags.map((tag) => /* @__PURE__ */ jsxs(HoverCard, { children: [
            /* @__PURE__ */ jsx(HoverCardTrigger, { children: /* @__PURE__ */ jsx(Badge, { variant: "outline", className: "cursor-pointer", children: tag }) }),
            /* @__PURE__ */ jsx(HoverCardContent, { className: "w-64", children: /* @__PURE__ */ jsxs("p", { className: "text-sm", children: [
              "Experience with ",
              tag,
              " in professional development"
            ] }) })
          ] }, tag)) }),
          job.content && /* @__PURE__ */ jsx("div", { className: "mt-6 prose prose-sm max-w-none", dangerouslySetInnerHTML: {
            __html: marked(job.content)
          } })
        ] })
      ] }, job.jobTitle)) })
    ] }),
    /* @__PURE__ */ jsxs("section", { className: "space-y-6", children: [
      /* @__PURE__ */ jsx("h2", { className: "text-3xl font-semibold", children: "Education" }),
      /* @__PURE__ */ jsx("div", { className: "space-y-6", children: allEducations.map((education) => /* @__PURE__ */ jsxs(Card, { children: [
        /* @__PURE__ */ jsx(CardHeader, { children: /* @__PURE__ */ jsx(CardTitle, { className: "text-xl", children: education.school }) }),
        /* @__PURE__ */ jsxs(CardContent, { children: [
          /* @__PURE__ */ jsx("p", { className: "leading-relaxed", children: education.summary }),
          education.content && /* @__PURE__ */ jsx("div", { className: "mt-6 prose prose-sm max-w-none", dangerouslySetInnerHTML: {
            __html: marked(education.content)
          } })
        ] })
      ] }, education.school)) })
    ] })
  ] }) });
}
export {
  App as component
};
