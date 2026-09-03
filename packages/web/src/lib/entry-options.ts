import type { EntryCategory, EntryMode } from "@app/slices/library/model.js";
import { entryCategories, entryModes } from "@app/slices/library/model.js";

// The two segmented switches of 09 (uiux/screens/09-intros-outros.md), in the order the
// reference sheet draws them, which is the order `slices/library/model.ts` declares them
// in. `logic/15` step 1: an entry has a category and a mode, and both may change after
// creation (§Q122).
export const categoryOptions: readonly { readonly value: EntryCategory; readonly label: string }[] =
  entryCategories.map((value) => ({ value, label: categoryLabel(value) }));

export const modeOptions: readonly { readonly value: EntryMode; readonly label: string }[] =
  entryModes.map((value) => ({ value, label: modeLabel(value) }));

export function categoryLabel(category: EntryCategory): string {
  switch (category) {
    case "intro":
      return "Intro";
    case "outro":
      return "Outro";
  }
}

export function modeLabel(mode: EntryMode): string {
  switch (mode) {
    case "text":
      return "Text";
    case "llm":
      return "LLM";
  }
}

// A category read off the URL. Anything else is someone's typing, and Intro is the tab
// the screen opens on.
export function categoryOf(value: unknown): EntryCategory {
  return entryCategories.find((category) => category === value) ?? "intro";
}
