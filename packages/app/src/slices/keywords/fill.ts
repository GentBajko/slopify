// Filling the keywords Slopify fills into a prompt that `render` has already filled with the
// person's own values, so a value they gave a `Slopify_` name still wins. A body with no
// keyword comes back as the very same string. Browser-safe.

import type { FillerKind, KeywordPlace } from "./model.js";
import { keywordOf } from "./specs.js";

export type Filled =
  | { readonly ok: true; readonly text: string }
  // Keywords whose value is not written yet (the chapters before the article, the digest).
  | { readonly ok: false; readonly waiting: readonly string[] };

const slot = /\{\{([^{}\n]*)\}\}/g;

// Filled elsewhere: each picture's own keywords by the pictures, the release date and the length
// when the step runs.
const elsewhere: readonly FillerKind[] = ["scenes", "appearance", "release", "duration"];

export function mentionsKeyword(body: string): boolean {
  for (const match of body.matchAll(slot))
    if (keywordOf((match[1] ?? "").trim())?.name === (match[1] ?? "").trim()) return true;
  return false;
}

export function fillKeywords(
  body: string,
  place: KeywordPlace,
  values: Readonly<Record<string, string>>,
): Filled {
  return fillWith(body, (name) => {
    const spec = keywordOf(name);
    if (spec === undefined || spec.name !== name || !spec.places.includes(place)) return undefined;
    if (elsewhere.includes(spec.filler)) return undefined;
    return Object.hasOwn(values, name) ? (values[name] ?? "") : null;
  });
}

// The release date and the length, filled when the step runs: they are left in the planned
// request, so a later change to either never makes anything outdated.
export function fillLateKeywords(
  text: string,
  late: { readonly releaseDate?: string | undefined; readonly duration?: string | undefined },
): string {
  const filled = fillWith(text, (name) =>
    name === "Slopify_Release_Date"
      ? (late.releaseDate ?? "")
      : name === "Slopify_Duration"
        ? (late.duration ?? "")
        : undefined,
  );
  return filled.ok ? filled.text : text;
}

export function mentionsLateKeyword(text: string): boolean {
  return text.includes("Slopify_Release_Date") || text.includes("Slopify_Duration");
}

// `valueFor` answers a string to fill (an empty one leaves its line out), null for a keyword
// still waiting, and undefined for a name to leave as written.
export function fillWith(
  body: string,
  valueFor: (name: string) => string | null | undefined,
): Filled {
  const waiting: string[] = [];
  const blank: string[] = [];
  let touched = false;
  for (const match of body.matchAll(slot)) {
    const name = (match[1] ?? "").trim();
    const value = valueFor(name);
    if (value === undefined) continue;
    touched = true;
    if (value === null && !waiting.includes(name)) waiting.push(name);
    if (value === "" && !blank.includes(name)) blank.push(name);
  }
  if (!touched) return { ok: true, text: body };
  if (waiting.length > 0) return { ok: false, waiting };
  const kept =
    blank.length === 0
      ? body
      : body
          .split("\n")
          .filter((line) => !blank.some((name) => holds(line, name)))
          .join("\n")
          .replace(/\n{3,}/g, "\n\n")
          .trim();
  return {
    ok: true,
    text: kept.replace(slot, (whole: string, inside: string): string => {
      const value = valueFor(inside.trim());
      return value === undefined || value === null ? whole : value;
    }),
  };
}

function holds(line: string, name: string): boolean {
  for (const match of line.matchAll(slot)) if ((match[1] ?? "").trim() === name) return true;
  return false;
}
