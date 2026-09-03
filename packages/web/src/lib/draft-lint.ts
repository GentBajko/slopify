import type { FieldError } from "@app/slices/admission/rules.js";
import { detectSlots } from "@app/slices/admission/substitute.js";
import { lintEntry, lintPrompt } from "@app/slices/library/lint.js";
import type { EntryDraft, PromptDraft } from "@app/slices/library/model.js";

// The slot grammar is not restated here. `lintPrompt` and `lintEntry` are the functions
// `slices/library/save.ts` runs on the way to the database and `detectSlots` is the parser
// they delegate to, imported through the `@app/*` alias so the editor's feedback while
// typing and the server's refusal are one rule with one set of sentences. Nothing the
// editor lets through can surprise the server, and a `fields[]` that comes back from a
// save lands on the same list the local pass writes (`logic/15` step 2, `logic/03` §Q20).
//
// One module for both libraries because `logic/15` §Q121 puts one rule set over both: a
// prompt and an intro/outro entry are a name and a body with `{{slots}}`, and the two
// screens that edit them say the same sentences about the same mistakes.

export type { FieldError };

// A slot's opening token. `SlotLintError.at` is its offset, and marking it is the whole
// of what the editor knows about the syntax: what makes the token wrong stays in
// `substitute.ts`.
const opener = "{{";

export interface BodyPiece {
  // Offset of the piece in the body, which is what makes a piece identifiable across
  // keystrokes when the list is redrawn.
  readonly start: number;
  readonly text: string;
  readonly marked: boolean;
}

// Every problem that would refuse this draft, in the order the shared lint reports them:
// the name before the body, and within the body the earliest offset first. `refused` is
// what the browser cannot know on its own - a name's uniqueness belongs to the database
// index, so a collision exists only once the server has answered 409 (`logic/15` §Q122).
//
// A prompt is told from an entry by the field that names its library, which is the same
// discriminant `slices/library/model.ts` gives the two drafts.
export function draftProblems(
  draft: PromptDraft | EntryDraft,
  refused: readonly FieldError[],
): readonly FieldError[] {
  const lint = "kind" in draft ? lintPrompt(draft) : lintEntry(draft);
  return [...lint, ...refused];
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
// piece of its own, everything else around it. The offsets arrive in ascending order from
// a single left-to-right scan, and the cursor guards the order rather than trusting it.
export function bodyPieces(body: string): readonly BodyPiece[] {
  const pieces: BodyPiece[] = [];
  let cursor = 0;
  for (const error of detectSlots(body).errors) {
    if (error.at < cursor) {
      continue;
    }
    if (error.at > cursor) {
      pieces.push({ start: cursor, text: body.slice(cursor, error.at), marked: false });
    }
    const end = Math.min(error.at + opener.length, body.length);
    pieces.push({ start: error.at, text: body.slice(error.at, end), marked: true });
    cursor = end;
  }
  if (cursor < body.length) {
    pieces.push({ start: cursor, text: body.slice(cursor), marked: false });
  }
  return pieces;
}
