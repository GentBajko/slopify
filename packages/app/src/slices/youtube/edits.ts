// Hand edits to the YouTube description. The project page lets the user edit the summary,
// the chapters, the hashtags, the tags and the pinned comment in place; each edit is saved with the generated
// text it was made from (`base`), so when the description is written again the page can tell
// a field the user changed from one they left alone. Browser-safe: the project page applies
// these rules to what it shows, and the server only stores the edits.

import { parseTimestamp } from "./timestamps.js";

export const descriptionFields = [
  "summary",
  "chapters",
  "hashtags",
  "tags",
  "pinnedComment",
  "titles",
] as const;
export type DescriptionField = (typeof descriptionFields)[number];

// Each field as the text box shows it: the chapters one "M:SS Title" per line, the hashtags
// separated by spaces and the tags by commas, which is how YouTube's fields take them; the
// other titles one per line.
export type DescriptionFields = Readonly<Record<DescriptionField, string>>;

export interface FieldEdit {
  // The generated text the user started from.
  readonly base: string;
  // What the user wrote.
  readonly text: string;
}

export type DescriptionEdits = Readonly<Partial<Record<DescriptionField, FieldEdit>>>;

export interface ResolvedField {
  // What the page shows and copies (before placeholders are filled).
  readonly text: string;
  // Whether that is the user's text rather than the generated one.
  readonly edited: boolean;
  // The generated text now, when it changed since the user edited this field: the page offers
  // "Use it / Keep mine / View diff" instead of overwriting the user's text.
  readonly pending?: string | undefined;
}

// Splits a written description back into its three parts, beside the tags, the pinned comment
// and the other titles (each empty for a description written before it existed). `assembleDescription` (answer.ts) lays it out as
// the summary, a blank line, one chapter per line, a blank line and the hashtags; reading it
// from the end keeps a summary with blank lines of its own whole.
export function splitDescription(
  description: string,
  tags: string,
  extras: {
    readonly pinnedComment?: string | undefined;
    readonly titles?: string | undefined;
  } = {},
): DescriptionFields {
  const lines = description.replace(/\r\n?/gu, "\n").split("\n");
  while (lines.length > 0 && lines.at(-1)?.trim() === "") lines.pop();
  let hashtags = "";
  const last = lines.at(-1)?.trim() ?? "";
  if (last !== "" && last.split(/\s+/u).every((word) => /^#[\p{L}\p{N}_]+$/u.test(word))) {
    hashtags = last;
    lines.pop();
  }
  while (lines.length > 0 && lines.at(-1)?.trim() === "") lines.pop();
  const chapters: string[] = [];
  while (lines.length > 0 && isChapterLine(lines.at(-1) ?? "")) {
    chapters.unshift((lines.pop() ?? "").trim());
  }
  return {
    summary: lines.join("\n").trim(),
    chapters: chapters.join("\n"),
    hashtags,
    tags: tags.trim(),
    pinnedComment: (extras.pinnedComment ?? "").trim(),
    titles: (extras.titles ?? "").trim(),
  };
}

function isChapterLine(line: string): boolean {
  const [time = "", ...title] = line.trim().split(/\s+/u);
  return parseTimestamp(time) !== undefined && title.length > 0;
}

// The description as YouTube takes it, from the fields as shown: the same layout
// `assembleDescription` writes, leaving out a part the user emptied.
export function composeDescription(fields: DescriptionFields): string {
  return [fields.summary.trim(), fields.chapters.trim(), fields.hashtags.trim()]
    .filter((part) => part !== "")
    .join("\n\n");
}

// The rules for one field:
// - never edited: the generated text;
// - edited, and the generated text is still the one the edit started from: the user's text;
// - edited, and the generated text changed since: the user's text, with the new generated text
//   pending for the user to take or dismiss - unless the two now agree, and then there is
//   nothing to choose;
// - not written yet: the user's text if there is one, otherwise nothing.
export function resolveField(
  generated: string | undefined,
  edit: FieldEdit | undefined,
): ResolvedField {
  if (edit === undefined) return { text: generated ?? "", edited: false };
  if (generated === undefined || edit.base === generated) return { text: edit.text, edited: true };
  if (edit.text === generated) return { text: generated, edited: false };
  return { text: edit.text, edited: true, pending: generated };
}

export function resolveFields(
  generated: DescriptionFields | undefined,
  edits: DescriptionEdits,
): Readonly<Record<DescriptionField, ResolvedField>> {
  const one = (field: DescriptionField) => resolveField(generated?.[field], edits[field]);
  return {
    summary: one("summary"),
    chapters: one("chapters"),
    hashtags: one("hashtags"),
    tags: one("tags"),
    pinnedComment: one("pinnedComment"),
    titles: one("titles"),
  };
}

export function shownFields(
  resolved: Readonly<Record<DescriptionField, ResolvedField>>,
): DescriptionFields {
  return {
    summary: resolved.summary.text,
    chapters: resolved.chapters.text,
    hashtags: resolved.hashtags.text,
    tags: resolved.tags.text,
    pinnedComment: resolved.pinnedComment.text,
    titles: resolved.titles.text,
  };
}

// Saving an edit: text equal to the generated text is no edit at all, so the field follows the
// next regeneration again.
export function withEdit(
  edits: DescriptionEdits,
  field: DescriptionField,
  text: string,
  generated: string,
): DescriptionEdits {
  if (text === generated) return withoutEdit(edits, field);
  return { ...edits, [field]: { base: generated, text } };
}

// "Use it": the field follows the generated text again.
export function withoutEdit(edits: DescriptionEdits, field: DescriptionField): DescriptionEdits {
  const { [field]: _dropped, ...rest } = edits;
  return rest;
}
