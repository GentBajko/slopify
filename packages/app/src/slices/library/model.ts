// The two template libraries: prompts of three kinds, and the intro/outro entries. One rule
// set covers both, which is why the drafts, the lint and the save path below are shared
// rather than mirrored.

import type { EntryMode } from "../admission/model.js";

// The mode is admission's vocabulary already: a run's LLM row is required when a picked
// entry is LLM-mode, so both slices name the same two values.
export type { EntryMode } from "../admission/model.js";
export { entryModes } from "../admission/model.js";

// The CHECK constraint on `prompts.kind` holds the same three.
export const promptKinds = ["article", "image", "thumbnail"] as const;
export type PromptKind = (typeof promptKinds)[number];

export const entryCategories = ["intro", "outro"] as const;
export type EntryCategory = (typeof entryCategories)[number];

// The name is what the Play pickers show, so it shares admission's title bound.
export const nameMax = 200;
// ceiling: nothing sets a length for a body, and the sample article prompt is already a
// page long. This is a sanity bound on a trust boundary, not a product rule; raising it is
// a one-line change with no schema consequence.
export const bodyMax = 100_000;

export interface Prompt {
  readonly id: string;
  readonly kind: PromptKind;
  readonly name: string;
  readonly body: string;
  // Detected at save time and stored as the `slots` JSON, so Play builds its field list
  // without re-parsing every body.
  readonly slots: readonly string[];
  readonly updatedAt: string;
}

export interface PromptDraft {
  readonly kind: PromptKind;
  readonly name: string;
  readonly body: string;
}

export interface Entry {
  readonly id: string;
  readonly category: EntryCategory;
  readonly mode: EntryMode;
  readonly name: string;
  readonly body: string;
  readonly slots: readonly string[];
  readonly updatedAt: string;
}

export interface EntryDraft {
  readonly category: EntryCategory;
  readonly mode: EntryMode;
  readonly name: string;
  readonly body: string;
}
