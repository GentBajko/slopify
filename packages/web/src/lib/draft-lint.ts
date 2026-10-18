import type { FieldError } from "@app/slices/admission/rules.js";
import { detectSlots } from "@app/slices/admission/substitute.js";
import type { KeywordPlace } from "@app/slices/keywords/model.js";
import { keywordProblems } from "@app/slices/keywords/rules.js";
import { keywordOf } from "@app/slices/keywords/specs.js";
import { keywordWarnings, lintEntry, lintPrompt } from "@app/slices/library/lint.js";
import type { EntryDraft, PromptDraft } from "@app/slices/library/model.js";

// The slot grammar is not restated here. `lintPrompt` and `lintEntry` are the functions
// `slices/library/save.ts` runs on the way to the database and `detectSlots` is the parser
// they delegate to, imported through the `@app/*` alias so the editor's feedback while
// typing and the server's refusal are one rule with one set of sentences. Nothing the
// editor lets through can surprise the server, and a `fields[]` that comes back from a
// save lands on the same list the local pass writes.
//
// One module for both libraries, because one rule set covers both: a prompt and an
// intro/outro entry are a name and a body with `{{slots}}`, and the two screens that edit
// them say the same sentences about the same mistakes.

export type { FieldError };

// A slot's opening token. `SlotLintError.at` is its offset, and marking it is the whole
// of what the editor knows about the syntax: what makes the token wrong stays in
// `substitute.ts`.
const opener = "{{";

// A keyword Slopify fills, as the overlay marks it: usable here, a misuse (a keyword where it
// can't be filled, or a `Slopify_` name that is no keyword), or an old name that still works.
export const keywordMarks = ["known", "misuse", "legacy"] as const;
export type KeywordMark = (typeof keywordMarks)[number];

export interface PieceKeyword {
  readonly name: string;
  readonly kind: KeywordMark;
  readonly message?: string;
}

export interface BodyPiece {
  // Offset of the piece in the body, which is what makes a piece identifiable across
  // keystrokes when the list is redrawn.
  readonly start: number;
  readonly text: string;
  readonly marked: boolean;
  readonly keyword?: PieceKeyword;
}

// Where the body runs, so its keywords can be marked; `grandfathered` is the stored prompt's
// own slot names, which the save lets through.
export interface BodyPlace {
  readonly place: KeywordPlace;
  readonly grandfathered?: readonly string[];
}

// Every problem that would refuse this draft, in the order the shared lint reports them:
// the name before the body, and within the body the earliest offset first. `refused` is
// what the browser cannot know on its own - a name's uniqueness belongs to the database
// index, so a collision exists only once the server has answered 409.
//
// A prompt is told from an entry by the field that names its library, which is the same
// discriminant `slices/library/model.ts` gives the two drafts.
//
// `grandfathered` is the slot names of the stored prompt being edited, as the server passes them.
export function draftProblems(
  draft: PromptDraft | EntryDraft,
  refused: readonly FieldError[],
  grandfathered: readonly string[] = [],
): readonly FieldError[] {
  const lint = "kind" in draft ? lintPrompt(draft, grandfathered) : lintEntry(draft, grandfathered);
  return [...lint, ...refused];
}

// What Save lets through but Play would refuse or the editor offers to update: a keyword where
// it can't be filled, and an old keyword name.
export function draftWarnings(draft: PromptDraft | EntryDraft): readonly FieldError[] {
  return keywordWarnings(draft);
}

// The detected slots parted: the person's own fields, and the keywords Slopify fills (old
// names included). An unknown `Slopify_` name stays the person's: it is a field until renamed.
export function keywordSlots(slots: readonly string[]): {
  readonly own: readonly string[];
  readonly filled: readonly string[];
} {
  return {
    own: slots.filter((name) => keywordOf(name) === undefined),
    filled: slots.filter((name) => keywordOf(name) !== undefined),
  };
}

// The sentence beside a disabled Save. It names the first problem rather than the count,
// so the button says what to fix and not merely that something is wrong.
export function firstProblem(problems: readonly FieldError[]): string | undefined {
  return problems[0]?.message;
}

export function bodyProblems(problems: readonly FieldError[]): readonly FieldError[] {
  return problems.filter((problem) => problem.field === "body");
}

export function nameProblems(problems: readonly FieldError[]): readonly FieldError[] {
  return problems.filter((problem) => problem.field === "name");
}

export function slotNames(body: string): readonly string[] {
  return detectSlots(body).names;
}

// The body split for the overlay that sits behind the textarea: each offending `{{` in a
// piece of its own, and with a place each keyword Slopify fills, everything else around them.
// The spans are sorted, and the cursor drops one that would overlap the piece before it.
export function bodyPieces(body: string, where?: BodyPlace): readonly BodyPiece[] {
  const spans: { start: number; end: number; keyword?: PieceKeyword }[] = detectSlots(
    body,
  ).errors.map((error) => ({
    start: error.at,
    end: Math.min(error.at + opener.length, body.length),
  }));
  if (where !== undefined) spans.push(...keywordSpans(body, where));
  spans.sort((left, right) => left.start - right.start);

  const pieces: BodyPiece[] = [];
  let cursor = 0;
  for (const span of spans) {
    if (span.start < cursor) {
      continue;
    }
    if (span.start > cursor) {
      pieces.push({ start: cursor, text: body.slice(cursor, span.start), marked: false });
    }
    const text = body.slice(span.start, span.end);
    pieces.push(
      span.keyword === undefined
        ? { start: span.start, text, marked: true }
        : { start: span.start, text, marked: false, keyword: span.keyword },
    );
    cursor = span.end;
  }
  if (cursor < body.length) {
    pieces.push({ start: cursor, text: body.slice(cursor), marked: false });
  }
  return pieces;
}

// The same well-formed slot the parser reads (`admission/substitute.ts`).
const slot = /\{\{([^{}\n]*)\}\}/g;

// Each keyword Slopify fills that means something here: one usable in this place, one the lint
// names (misplaced, unknown, or an old name). An old name outside the picture prompts is plain
// text, as it always was, and an unknown name the stored prompt already had is a field.
function keywordSpans(
  body: string,
  { place, grandfathered = [] }: BodyPlace,
): { start: number; end: number; keyword: PieceKeyword }[] {
  const problems = keywordProblems(body, place, grandfathered);
  const spans: { start: number; end: number; keyword: PieceKeyword }[] = [];
  for (const match of body.matchAll(slot)) {
    const name = (match[1] ?? "").trim();
    const start = match.index;
    const end = start + match[0].length;
    const problem = problems.find((one) => one.at === start);
    if (problem !== undefined) {
      const kind = problem.kind === "legacy" ? "legacy" : "misuse";
      spans.push({ start, end, keyword: { name, kind, message: problem.message } });
      continue;
    }
    const spec = keywordOf(name);
    if (spec !== undefined && spec.name === name && spec.places.includes(place))
      spans.push({ start, end, keyword: { name, kind: "known" } });
  }
  return spans;
}
