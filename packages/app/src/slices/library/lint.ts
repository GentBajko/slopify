// What `logic/15` step 2 asks of a save: a name, a body, and no lint error. The slot
// grammar is not restated here - it is admission/substitute.ts's, imported so the editor
// and the run see the same parse of the same body.

import type { FieldError } from "../admission/rules.js";
import type { SlotLintError } from "../admission/substitute.js";
import { detectSlots } from "../admission/substitute.js";
import type { EntryDraft, PromptDraft } from "./model.js";
import { bodyMax, nameMax } from "./model.js";

export function lintPrompt(draft: PromptDraft): readonly FieldError[] {
  return lint(draft.name, draft.body);
}

export function lintEntry(draft: EntryDraft): readonly FieldError[] {
  return lint(draft.name, draft.body);
}

function lint(name: string, body: string): readonly FieldError[] {
  const fields: FieldError[] = [];
  const trimmed = name.trim();
  if (trimmed === "") {
    fields.push({ field: "name", message: "A name is required." });
  } else if (trimmed.length > nameMax) {
    fields.push({ field: "name", message: `A name is at most ${String(nameMax)} characters.` });
  }

  if (body.trim() === "") {
    fields.push({ field: "body", message: "A body is required." });
    return fields;
  }
  if (body.length > bodyMax) {
    fields.push({ field: "body", message: `A body is at most ${String(bodyMax)} characters.` });
    return fields;
  }
  for (const error of detectSlots(body).errors) {
    fields.push({ field: "body", message: describe(error, body) });
  }
  return fields;
}

// The parser reports a character offset; a person editing a textarea counts lines and
// columns, so the message says both what is wrong and where.
function describe(error: SlotLintError, body: string): string {
  const where = positionOf(body, error.at);
  switch (error.kind) {
    case "unclosed":
      return `The \`{{\` at ${where} is never closed.`;
    case "empty":
      return `The slot at ${where} has no name.`;
    case "nested":
      return `The slot at ${where} holds a brace; slots do not nest.`;
  }
}

function positionOf(body: string, at: number): string {
  const before = body.slice(0, at);
  const lastBreak = before.lastIndexOf("\n");
  const line = before.split("\n").length;
  const column = at - lastBreak;
  return `line ${String(line)}, column ${String(column)}`;
}
