import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import type { Entry, EntryCategory, Prompt, PromptKind } from "./model.js";
import { entryCategories, entryModes, promptKinds } from "./model.js";

// A row naming a kind, category or mode this build does not know can only come from a
// hand-edited database or a downgrade; parsing throws rather than hiding a saved row.
const promptRow = z.object({
  id: z.string(),
  kind: z.enum(promptKinds),
  name: z.string(),
  body: z.string(),
  slots: z.string(),
  updated_at: z.string(),
});

const entryRow = z.object({
  id: z.string(),
  category: z.enum(entryCategories),
  mode: z.enum(entryModes),
  name: z.string(),
  body: z.string(),
  slots: z.string(),
  updated_at: z.string(),
});

const slotsColumn = z.array(z.string());

// `lower(name)` and not `name COLLATE NOCASE`: it is the expression the unique indexes
// are built on, so a lookup by name reads the index instead of the table.
const byName = "lower(name) = lower(?)";
// `logic/15` step 5: the lists on 04 Prompts and the pickers on Play sort by name.
const byNameOrder = "ORDER BY lower(name)";

export function insertPrompt(db: DatabaseSync, prompt: Prompt): void {
  db.prepare(
    "INSERT INTO prompts (id, kind, name, body, slots, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(
    prompt.id,
    prompt.kind,
    prompt.name,
    prompt.body,
    JSON.stringify(prompt.slots),
    prompt.updatedAt,
  );
}

// §Q122: the kind may change after creation, so the update writes it like any other
// column. Returns false when no row has that id.
export function replacePrompt(db: DatabaseSync, prompt: Prompt): boolean {
  const result = db
    .prepare(
      "UPDATE prompts SET kind = ?, name = ?, body = ?, slots = ?, updated_at = ? WHERE id = ?",
    )
    .run(
      prompt.kind,
      prompt.name,
      prompt.body,
      JSON.stringify(prompt.slots),
      prompt.updatedAt,
      prompt.id,
    );
  return Number(result.changes) > 0;
}

// §Q123: no foreign key points at this row, so a project that used the template keeps
// its own rendered text and nothing cascades.
export function deletePrompt(db: DatabaseSync, id: string): boolean {
  return Number(db.prepare("DELETE FROM prompts WHERE id = ?").run(id).changes) > 0;
}

export function listPrompts(db: DatabaseSync): readonly Prompt[] {
  return db
    .prepare(`SELECT * FROM prompts ${byNameOrder}`)
    .all()
    .map((row) => toPrompt(promptRow.parse(row)));
}

export function promptById(db: DatabaseSync, id: string): Prompt | undefined {
  const row = db.prepare("SELECT * FROM prompts WHERE id = ?").get(id);
  return row === undefined ? undefined : toPrompt(promptRow.parse(row));
}

export function promptByName(db: DatabaseSync, kind: PromptKind, name: string): Prompt | undefined {
  const row = db.prepare(`SELECT * FROM prompts WHERE kind = ? AND ${byName}`).get(kind, name);
  return row === undefined ? undefined : toPrompt(promptRow.parse(row));
}

export function insertEntry(db: DatabaseSync, entry: Entry): void {
  db.prepare(
    "INSERT INTO entries (id, category, mode, name, body, slots, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).run(
    entry.id,
    entry.category,
    entry.mode,
    entry.name,
    entry.body,
    JSON.stringify(entry.slots),
    entry.updatedAt,
  );
}

export function replaceEntry(db: DatabaseSync, entry: Entry): boolean {
  const result = db
    .prepare(
      "UPDATE entries SET category = ?, mode = ?, name = ?, body = ?, slots = ?, updated_at = ? WHERE id = ?",
    )
    .run(
      entry.category,
      entry.mode,
      entry.name,
      entry.body,
      JSON.stringify(entry.slots),
      entry.updatedAt,
      entry.id,
    );
  return Number(result.changes) > 0;
}

export function deleteEntry(db: DatabaseSync, id: string): boolean {
  return Number(db.prepare("DELETE FROM entries WHERE id = ?").run(id).changes) > 0;
}

export function listEntries(db: DatabaseSync): readonly Entry[] {
  return db
    .prepare(`SELECT * FROM entries ${byNameOrder}`)
    .all()
    .map((row) => toEntry(entryRow.parse(row)));
}

export function entryById(db: DatabaseSync, id: string): Entry | undefined {
  const row = db.prepare("SELECT * FROM entries WHERE id = ?").get(id);
  return row === undefined ? undefined : toEntry(entryRow.parse(row));
}

export function entryByName(
  db: DatabaseSync,
  category: EntryCategory,
  name: string,
): Entry | undefined {
  const row = db
    .prepare(`SELECT * FROM entries WHERE category = ? AND ${byName}`)
    .get(category, name);
  return row === undefined ? undefined : toEntry(entryRow.parse(row));
}

function toPrompt(row: z.infer<typeof promptRow>): Prompt {
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    body: row.body,
    slots: parseSlots(row.slots),
    updatedAt: row.updated_at,
  };
}

function toEntry(row: z.infer<typeof entryRow>): Entry {
  return {
    id: row.id,
    category: row.category,
    mode: row.mode,
    name: row.name,
    body: row.body,
    slots: parseSlots(row.slots),
    updatedAt: row.updated_at,
  };
}

// A JSON column never reaches a caller as a string.
function parseSlots(slots: string): readonly string[] {
  const parsed: unknown = JSON.parse(slots);
  return slotsColumn.parse(parsed);
}
