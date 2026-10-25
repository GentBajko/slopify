import type { EntryCategory, EntryMode } from "@app/slices/library/model.js";
import { entryCategories, entryModes } from "@app/slices/library/model.js";

// The intro and outro editor's two choices, in the order `slices/library/model.ts` declares
// them in. An entry has a category and a mode, and both may change after creation.
export const categoryOptions: readonly { readonly value: EntryCategory; readonly label: string }[] =
  entryCategories.map((value) => ({ value, label: categoryChoice(value) }));

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

// The choice in the editor says where each one is spoken.
function categoryChoice(category: EntryCategory): string {
  switch (category) {
    case "intro":
      return "Intro, before the video";
    case "outro":
      return "Outro, after the video";
  }
}

// What an intro or outro is for, with an example: said above the list and in an empty one.
export function categoryAbout(category: EntryCategory): string {
  switch (category) {
    case "intro":
      return "Spoken before the video starts, like “Welcome back to the channel.”";
    case "outro":
      return "Spoken after the video ends, like “Thanks for watching. See you next week.”";
  }
}

// Its second line in the Prompts page's list of kinds, as each prompt kind says what it writes.
export function categoryWrites(category: EntryCategory): string {
  switch (category) {
    case "intro":
      return "Said before the video";
    case "outro":
      return "Said after the video";
  }
}

// What the narrator reads: the words as they stand, or an answer the AI writes from them.
export function modeLabel(mode: EntryMode): string {
  switch (mode) {
    case "text":
      return "Say these exact words";
    case "llm":
      return "Let the AI write it from these instructions";
  }
}

// The one line under the choice. A text entry is filled in and narrated as it stands; an AI
// entry is an instruction the article stage sends with the title, the keyword values and the
// article, and it is the answer that gets narrated.
export function modeHint(mode: EntryMode, category: EntryCategory): string {
  switch (mode) {
    case "text":
      return "Narrated exactly as written, with the keywords filled in.";
    case "llm":
      return `The AI writes the ${category} from these instructions, then it is narrated: one AI call per video.`;
  }
}

// The text box's label and example, which follow the mode.
export function bodyLabel(mode: EntryMode): string {
  switch (mode) {
    case "text":
      return "Words to say";
    case "llm":
      return "Instructions for the AI";
  }
}

export function bodyPlaceholder(mode: EntryMode, category: EntryCategory): string {
  if (mode === "llm")
    return category === "intro"
      ? "Write one warm sentence that welcomes the viewer to a video about {{Topic}}."
      : "Write one sentence that thanks the viewer and asks them to subscribe.";
  return category === "intro"
    ? "Welcome back to the channel. Today: {{Topic}}."
    : "Thanks for watching. See you next week.";
}

// Both modes hold keywords: a text body is filled in with no call, and the picked intro's and
// outro's names are collected whatever the mode. Only what happens to the filled-in body
// differs, so only that sentence does.
export function noSlotsHint(mode: EntryMode): string {
  switch (mode) {
    case "text":
      return "It asks you for nothing: it is narrated as written.";
    case "llm":
      return "It asks you for nothing: the AI gets these instructions as written.";
  }
}

// A category read off the URL. Anything else is someone's typing, and Intro is the list the
// screen opens on.
export function categoryOf(value: unknown): EntryCategory {
  return entryCategories.find((category) => category === value) ?? "intro";
}
