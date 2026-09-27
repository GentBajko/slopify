// Creating, editing and deleting a template. One rule set covers prompts
// and entries, so both go through the same three outcomes.

import type { DatabaseSync } from "node:sqlite";
import type { Clock } from "../../kernel/clock.js";
import { isUniqueConstraint } from "../../kernel/db/index.js";
import { transact } from "../../kernel/db/tx.js";
import type { Ids } from "../../kernel/ids.js";
import type { FieldError } from "../admission/rules.js";
import { detectSlots } from "../admission/substitute.js";
import { recordVersion, versionOf } from "./history.js";
import { lintEntry, lintPrompt } from "./lint.js";
import type { Entry, EntryDraft, Prompt, PromptDraft } from "./model.js";
import { entryCategories, promptKinds } from "./model.js";
import {
  entryById,
  insertEntry,
  insertPrompt,
  promptById,
  replaceEntry,
  replacePrompt,
  trashEntry,
  trashPrompt,
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
  return written(
    deps.db,
    () => {
      insertPrompt(deps.db, prompt);
      recordVersion(deps.db, "prompt", prompt);
      return true;
    },
    prompt,
  );
}

// A save replaces the row whole and keeps what was saved as a new version (`history.ts`).
export function updatePrompt(
  deps: LibraryDeps,
  id: string,
  draft: PromptDraft,
  restoredFrom?: number,
): SaveResult<Prompt> {
  const fields = lintPrompt(draft);
  if (fields.length > 0) {
    return { ok: false, reason: "invalid", fields };
  }
  const prompt: Prompt = { id, ...promptOf(deps, draft) };
  return written(
    deps.db,
    () => {
      const previous = promptById(deps.db, id);
      if (!replacePrompt(deps.db, prompt)) return false;
      recordVersion(deps.db, "prompt", prompt, {
        previous,
        ...(restoredFrom === undefined ? {} : { restoredFrom }),
      });
      return true;
    },
    prompt,
  );
}

// Restore saves an old version again, as a new version that says where it came from, so the
// versions after it stay in History.
export function restorePrompt(deps: LibraryDeps, id: string, version: number): SaveResult<Prompt> {
  const saved = versionOf(deps.db, "prompt", id, version);
  const kind = promptKinds.find((one) => one === saved?.kind);
  if (saved === undefined || kind === undefined || promptById(deps.db, id) === undefined)
    return { ok: false, reason: "not-found" };
  return updatePrompt(deps, id, { kind, name: saved.name, body: saved.body }, version);
}

// Delete moves the prompt to the trash with its history; Settings → Trash puts it back or
// removes it for good (`slices/trash`).
export function removePrompt(deps: LibraryDeps, id: string): SaveResult<null> {
  return trashPrompt(deps.db, id, deps.clock.now().toISOString())
    ? { ok: true, value: null }
    : { ok: false, reason: "not-found" };
}

export function createEntry(deps: LibraryDeps, draft: EntryDraft): SaveResult<Entry> {
  const fields = lintEntry(draft);
  if (fields.length > 0) {
    return { ok: false, reason: "invalid", fields };
  }
  const entry: Entry = { id: deps.ids.next(), ...entryOf(deps, draft) };
  return written(
    deps.db,
    () => {
      insertEntry(deps.db, entry);
      recordVersion(deps.db, "entry", entry);
      return true;
    },
    entry,
  );
}

export function updateEntry(
  deps: LibraryDeps,
  id: string,
  draft: EntryDraft,
  restoredFrom?: number,
): SaveResult<Entry> {
  const fields = lintEntry(draft);
  if (fields.length > 0) {
    return { ok: false, reason: "invalid", fields };
  }
  const entry: Entry = { id, ...entryOf(deps, draft) };
  return written(
    deps.db,
    () => {
      const previous = entryById(deps.db, id);
      if (!replaceEntry(deps.db, entry)) return false;
      recordVersion(deps.db, "entry", entry, {
        previous,
        ...(restoredFrom === undefined ? {} : { restoredFrom }),
      });
      return true;
    },
    entry,
  );
}

export function restoreEntry(deps: LibraryDeps, id: string, version: number): SaveResult<Entry> {
  const saved = versionOf(deps.db, "entry", id, version);
  const category = entryCategories.find((one) => one === saved?.kind);
  if (
    saved === undefined ||
    category === undefined ||
    saved.mode === null ||
    entryById(deps.db, id) === undefined
  )
    return { ok: false, reason: "not-found" };
  return updateEntry(
    deps,
    id,
    { category, mode: saved.mode, name: saved.name, body: saved.body },
    version,
  );
}

export function removeEntry(deps: LibraryDeps, id: string): SaveResult<null> {
  return trashEntry(deps.db, id, deps.clock.now().toISOString())
    ? { ok: true, value: null }
    : { ok: false, reason: "not-found" };
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

// Uniqueness is the schema's: `prompts(kind, lower(name))` and `entries(category,
// lower(name))`. A read-then-write check would answer from a row a second writer could
// delete between the two statements, so the index decides and the raw SQLite error never
// leaves this module.
// The row and its version are written together: a save either lands with its version or not
// at all.
function written<T>(db: DatabaseSync, write: () => boolean, value: T): SaveResult<T> {
  try {
    return transact(db, write) ? { ok: true, value } : { ok: false, reason: "not-found" };
  } catch (error) {
    if (isUniqueConstraint(error)) {
      return { ok: false, reason: "duplicate-name" };
    }
    throw error;
  }
}
