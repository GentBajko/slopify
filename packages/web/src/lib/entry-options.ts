import type { EntryCategory, EntryMode } from "@app/slices/library/model.js";
import { entryCategories, entryModes } from "@app/slices/library/model.js";

// The entry editor's two segmented switches, in the order `slices/library/model.ts`
// declares them in. An entry has a category and a mode, and both may change after
// creation.
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

// What each mode does with the body, said under the Mode switch. A text entry is rendered
// and narrated as it stands, while an LLM entry is an instruction the article stage sends
// with the title, the keyword values and the article, and it is the answer that gets
// narrated.
export function modeHint(mode: EntryMode): string {
  switch (mode) {
    case "text":
      return "Text is narrated as written.";
    case "llm":
      return "LLM is an instruction whose answer is narrated.";
  }
}

// Both modes hold `{{slots}}`: a text body is rendered with no call, and the picked intro's
// and outro's names are collected whatever the mode. Only what happens to the rendered body
// differs, so only that sentence does.
export function noSlotsHint(mode: EntryMode): string {
  switch (mode) {
    case "text":
      return "No slots. This text is narrated as written.";
    case "llm":
      return "No slots. This instruction runs as written.";
  }
}

// A category read off the URL. Anything else is someone's typing, and Intro is the tab
// the screen opens on.
export function categoryOf(value: unknown): EntryCategory {
  return entryCategories.find((category) => category === value) ?? "intro";
}
