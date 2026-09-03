import type { Appearance } from "@app/slices/settings/model.js";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { useApp } from "@/app-context";
import { settingsQuery } from "@/queries";

// uiux §Q19: `prefers-color-scheme` decides until the Settings control overrides it. The
// override is one attribute on the document element, which is what the light and dark
// blocks of styles/index.css key off; "system" removes it and hands the decision back to
// the media query, so there is no third palette to keep in step.
export function applyAppearance(root: HTMLElement, appearance: Appearance): void {
  if (appearance === "system") {
    root.removeAttribute("data-theme");
    return;
  }
  root.setAttribute("data-theme", appearance);
}

// Renders nothing: the theme is an attribute on the document, not a subtree. It hangs in
// the shell so every screen wears the saved appearance from the first paint, and it reads
// the same cache entry Settings writes, so a change there lands without a reload.
export function AppearanceSkin() {
  const { api } = useApp();
  const settings = useQuery(settingsQuery(api));
  const appearance = settings.data?.appearance ?? "system";

  useEffect(() => {
    applyAppearance(document.documentElement, appearance);
  }, [appearance]);

  return null;
}
