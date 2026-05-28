import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { g as getUser } from "./router-j_nH2NkM.js";
import "react/jsx-runtime";
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
function IndexRedirect() {
  const navigate = useNavigate();
  useEffect(() => {
    const user = getUser();
    if (!user) {
      navigate({
        to: "/login"
      });
    } else if (user.role === "admin") {
      navigate({
        to: "/admin"
      });
    } else if (user.role === "mentor") {
      navigate({
        to: "/mentor"
      });
    } else {
      navigate({
        to: "/student"
      });
    }
  }, [navigate]);
  return null;
}
export {
  IndexRedirect as component
};
