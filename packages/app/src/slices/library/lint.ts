// What a save has to carry: a name, a body and no lint error. The slot grammar is not
// restated here - it is admission/substitute.ts's, imported so the editor and the run see
// the same parse of the same body.

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
    fields.push({ field: "name", message: "Enter a name." });
  } else if (trimmed.length > nameMax) {
    fields.push({
      field: "name",
      message: `Keep the name to ${String(nameMax)} characters or fewer.`,
    });
  }

  if (body.trim() === "") {
    fields.push({ field: "body", message: "Enter the text." });
    return fields;
  }
  if (body.length > bodyMax) {
    fields.push({
      field: "body",
      message: `The text is too long. Keep it to ${String(bodyMax)} characters or fewer.`,
    });
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
      return `The \`{{\` at ${where} is never closed. Add \`}}\` after the keyword name.`;
    case "empty":
      return `The keyword at ${where} has no name. Write a name between \`{{\` and \`}}\`.`;
    case "nested":
      return `The keyword at ${where} contains a brace. Keywords cannot be placed inside other keywords.`;
  }
}

function positionOf(body: string, at: number): string {
  const before = body.slice(0, at);
  const lastBreak = before.lastIndexOf("\n");
  const line = before.split("\n").length;
  const column = at - lastBreak;
  return `line ${String(line)}, column ${String(column)}`;
}
