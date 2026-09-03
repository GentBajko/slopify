// Creating, editing and deleting a template (`logic/15`). One rule set covers prompts
// and entries (§Q121), so both go through the same three outcomes.

import type { DatabaseSync } from "node:sqlite";
import type { Clock } from "../../kernel/clock.js";
import { isUniqueConstraint } from "../../kernel/db/index.js";
import type { Ids } from "../../kernel/ids.js";
import type { FieldError } from "../admission/rules.js";
import { detectSlots } from "../admission/substitute.js";
import { lintEntry, lintPrompt } from "./lint.js";
import type { Entry, EntryDraft, Prompt, PromptDraft } from "./model.js";
import {
  deleteEntry,
  deletePrompt,
  insertEntry,
  insertPrompt,
  replaceEntry,
  replacePrompt,
} from "./repo.js";

export interface LibraryDeps {
  readonly db: DatabaseSync;
  readonly ids: Ids;
  readonly clock: Clock;
}

// "invalid" carries the marked fields the editor shows; "duplicate-name" is the schema
// refusing the row; "not-found" is an edit or a delete of a template that is gone.
export type SaveFailure =
  | { readonly ok: false; readonly reason: "invalid"; readonly fields: readonly FieldError[] }
  | { readonly ok: false; readonly reason: "duplicate-name" }
  | { readonly ok: false; readonly reason: "not-found" };

export type SaveResult<T> = { readonly ok: true; readonly value: T } | SaveFailure;

export function createPrompt(deps: LibraryDeps, draft: PromptDraft): SaveResult<Prompt> {
  const fields = lintPrompt(draft);
  if (fields.length > 0) {
    return { ok: false, reason: "invalid", fields };
  }
  const prompt: Prompt = { id: deps.ids.next(), ...promptOf(deps, draft) };
  return written(() => {
    insertPrompt(deps.db, prompt);
    return true;
  }, prompt);
}

// §Q125: a save overwrites; there is no version history, so the row is replaced whole.
export function updatePrompt(
  deps: LibraryDeps,
  id: string,
  draft: PromptDraft,
): SaveResult<Prompt> {
  const fields = lintPrompt(draft);
  if (fields.length > 0) {
    return { ok: false, reason: "invalid", fields };
  }
  const prompt: Prompt = { id, ...promptOf(deps, draft) };
  return written(() => replacePrompt(deps.db, prompt), prompt);
}

export function removePrompt(deps: LibraryDeps, id: string): SaveResult<null> {
  return deletePrompt(deps.db, id) ? { ok: true, value: null } : { ok: false, reason: "not-found" };
}

export function createEntry(deps: LibraryDeps, draft: EntryDraft): SaveResult<Entry> {
  const fields = lintEntry(draft);
  if (fields.length > 0) {
    return { ok: false, reason: "invalid", fields };
  }
  const entry: Entry = { id: deps.ids.next(), ...entryOf(deps, draft) };
  return written(() => {
    insertEntry(deps.db, entry);
    return true;
  }, entry);
}

export function updateEntry(deps: LibraryDeps, id: string, draft: EntryDraft): SaveResult<Entry> {
  const fields = lintEntry(draft);
  if (fields.length > 0) {
    return { ok: false, reason: "invalid", fields };
  }
  const entry: Entry = { id, ...entryOf(deps, draft) };
  return written(() => replaceEntry(deps.db, entry), entry);
}

export function removeEntry(deps: LibraryDeps, id: string): SaveResult<null> {
  return deleteEntry(deps.db, id) ? { ok: true, value: null } : { ok: false, reason: "not-found" };
}

// The stored `slots` is recomputed from the body on every save, so the column can never
// describe a body that is no longer there.
function promptOf(deps: LibraryDeps, draft: PromptDraft): Omit<Prompt, "id"> {
  return {
    kind: draft.kind,
    name: draft.name.trim(),
    body: draft.body,
    slots: detectSlots(draft.body).names,
    updatedAt: deps.clock.now().toISOString(),
  };
}

function entryOf(deps: LibraryDeps, draft: EntryDraft): Omit<Entry, "id"> {
  return {
    category: draft.category,
    mode: draft.mode,
    name: draft.name.trim(),
    body: draft.body,
    slots: detectSlots(draft.body).names,
    updatedAt: deps.clock.now().toISOString(),
  };
}

// §Q122's uniqueness is the schema's: `prompts(kind, lower(name))` and
// `entries(category, lower(name))`. A read-then-write check would answer from a row a
// second writer could delete between the two statements, so the index decides and the
// raw SQLite error never leaves this module.
function written<T>(write: () => boolean, value: T): SaveResult<T> {
  try {
    return write() ? { ok: true, value } : { ok: false, reason: "not-found" };
  } catch (error) {
    if (isUniqueConstraint(error)) {
      return { ok: false, reason: "duplicate-name" };
    }
    throw error;
  }
}
