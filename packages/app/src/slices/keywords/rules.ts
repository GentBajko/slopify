// What the editor and Play say about the keywords in one body: a `Slopify_` name that is no
// keyword, a keyword where it can't be filled, and an old name that still works. Browser-safe.

import {
  isReserved,
  type KeywordPlace,
  type KeywordSpec,
  listOf,
  placeLabels,
  reservedPrefix,
} from "./model.js";
import { keywordOf, legacyNames } from "./specs.js";

export const keywordProblemKinds = ["unknown", "wrong-place", "legacy"] as const;
export type KeywordProblemKind = (typeof keywordProblemKinds)[number];

export interface KeywordProblem {
  readonly kind: KeywordProblemKind;
  // As written between the braces, trimmed.
  readonly name: string;
  // Offset of the opening `{{`, so an editor can mark it in place.
  readonly at: number;
  readonly message: string;
}

// The same well-formed slot the parser reads (`admission/substitute.ts`).
const slot = /\{\{([^{}\n]*)\}\}/g;

// Unknown names already in the stored prompt are let through, so a prompt saved before the
// prefix was reserved still saves.
export function keywordProblems(
  body: string,
  place: KeywordPlace,
  grandfathered: readonly string[] = [],
): readonly KeywordProblem[] {
  const problems: KeywordProblem[] = [];
  for (const match of body.matchAll(slot)) {
    const name = (match[1] ?? "").trim();
    if (name === "") continue;
    const at = match.index;
    const where = `{{${name}}} at ${positionOf(body, at)}`;
    const spec = keywordOf(name);
    if (spec === undefined) {
      if (isReserved(name) && !grandfathered.includes(name))
        problems.push({
          kind: "unknown",
          name,
          at,
          message: `${where} isn't a keyword Slopify fills: names starting with ${reservedPrefix} are Slopify's own. Rename it, e.g. {{${name.slice(reservedPrefix.length) || "Topic"}}}, or insert a keyword from the Insert bar above the text.`,
        });
      continue;
    }
    const legacy = spec.legacy === name;
    if (!spec.places.includes(place)) {
      // An old name outside the picture prompts was plain text before the keywords, and still is.
      if (legacy) continue;
      problems.push({ kind: "wrong-place", name, at, message: wrongPlace(where, spec, place) });
      continue;
    }
    if (legacy)
      problems.push({
        kind: "legacy",
        name,
        at,
        message: `${where} is the old name of {{${spec.name}}}. It keeps working; use Update to new names above the text to rename it.`,
      });
  }
  return problems;
}

function wrongPlace(where: string, spec: KeywordSpec, place: KeywordPlace): string {
  if (place === "title")
    return `${where} can't be used in the title: Slopify fills its keywords from the title, so the title can't use them. Remove it, or use a keyword of your own such as {{${spec.name.slice(reservedPrefix.length)}}}.`;
  const works = listOf(spec.places.map((one) => placeLabels[one]));
  return `${where} can't be used in ${placeName(place)}: ${why(spec, place)}. Remove it; it works in ${works}.`;
}

function why(spec: KeywordSpec, place: KeywordPlace): string {
  if ((place === "article" || place === "script") && spec.places.includes("narration"))
    return "it exists once the article is written, so never in the Article or Script prompt";
  switch (spec.filler) {
    case "digest":
      return place === "article" || place === "script"
        ? "it is written from the article, which doesn't exist yet when this prompt runs"
        : "Slopify writes it for pictures, descriptions, shorts and reviews only";
    case "duration":
      return "the video's length is known only once the narration is finished";
    case "scenes":
    case "appearance":
      return "it describes one picture, so it works only in picture prompts";
    default:
      return "it describes how pictures look, so it works only in picture prompts";
  }
}

function placeName(place: KeywordPlace): string {
  const label = placeLabels[place];
  const article = /^[AEIOU]/.test(label) ? "an" : "a";
  return place === "intro" || place === "outro"
    ? `${article} ${label} entry`
    : `${article} ${label} prompt`;
}

// The old names a body uses, in first-appearance order.
export function usesLegacy(body: string): readonly string[] {
  const found: string[] = [];
  for (const match of body.matchAll(slot)) {
    const name = (match[1] ?? "").trim();
    if (legacyNames.includes(name) && !found.includes(name)) found.push(name);
  }
  return found;
}

// The body with one old name written as its new one. Appearance means the same under both
// names; Scene's new name turns scenes on for that picture, which is why each is its own choice.
export function upgradeLegacy(body: string, which: string): string {
  const spec = keywordOf(which);
  if (spec === undefined || spec.legacy !== which) return body;
  return body.replace(slot, (whole: string, inside: string): string =>
    inside.trim() === which ? `{{${spec.name}}}` : whole,
  );
}

// The place a rendered prompt key fills (`library/slots.ts` names them).
export function placeOfKey(
  key: string,
  options: { readonly script?: boolean } = {},
): KeywordPlace | undefined {
  if (key === "article") return options.script === true ? "script" : "article";
  if (key === "narration" || key === "intro" || key === "outro") return key;
  if (key === "description" || key === "shorts") return key;
  if (key === "shortsImage" || key === "referencePrompt" || /^imagePrompts\.\d+$/.test(key))
    return "image";
  if (key === "thumbnailPrompt") return "thumbnail";
  if (key.startsWith("review.")) return "review";
  return undefined;
}

// The parser reports a character offset; a person editing a textarea counts lines and columns.
export function positionOf(body: string, at: number): string {
  const before = body.slice(0, at);
  const lastBreak = before.lastIndexOf("\n");
  const line = before.split("\n").length;
  const column = at - lastBreak;
  return `line ${String(line)}, column ${String(column)}`;
}
