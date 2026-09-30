// "Used by": the templates, schedules and projects that name a Library prompt or intro/outro.
// Everything refers to the Library by name (a template's form, a schedule's template, a
// project revision's config), so the match is the name, without regard to case, within the
// prompt's kind or the entry's category - the same rule the unique indexes and
// `snapshot.ts` use.

import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { liveProject } from "../admission/repo.js";
import type { EntryCategory, PromptKind } from "./model.js";

export type LibraryRef =
  | { readonly item: "prompt"; readonly kind: PromptKind; readonly name: string }
  | { readonly item: "entry"; readonly category: EntryCategory; readonly name: string };

export interface UsedByTemplate {
  readonly id: string;
  readonly name: string;
}

export interface UsedBySchedule {
  readonly id: string;
  readonly name: string;
  readonly status: string;
}

export interface UsedByProject {
  readonly id: string;
  readonly title: string;
  // How many of the project's revisions used it, out of how many it has.
  readonly revisions: number;
  readonly totalRevisions: number;
  // Whether the revision the project is on now uses it.
  readonly current: boolean;
}

export interface UsedBy {
  readonly templates: readonly UsedByTemplate[];
  readonly schedules: readonly UsedBySchedule[];
  readonly projects: readonly UsedByProject[];
}

// The places a Play form or a run config names a Library item. Both shapes carry the same
// names; a run config holds the intro and outro as `{ name }` and a form as the name. A
// multi-voice script run picks a Script prompt where the article prompt goes
// (`usesScriptPrompt`), so that one field belongs to Script or to Article by the run.
type Json = Record<string, unknown>;

interface Slot {
  readonly get: () => unknown;
  readonly set: (name: string) => void;
}

function record(value: unknown): Json | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Json)
    : undefined;
}

function field(owner: Json | undefined, key: string): readonly Slot[] {
  return owner === undefined ? [] : [{ get: () => owner[key], set: (name) => (owner[key] = name) }];
}

// An intro or outro: the name in a form, `{ name, mode }` in a run config.
function entrySlot(owner: Json, key: string): readonly Slot[] {
  const held = record(owner[key]);
  return held === undefined ? field(owner, key) : field(held, "name");
}

function scriptRun(value: Json): boolean {
  return record(value.sources)?.audio === "generate" && record(value.voices)?.source === "script";
}

function slotsIn(value: Json, ref: LibraryRef): readonly Slot[] {
  if (ref.item === "entry") return entrySlot(value, ref.category);
  const shorts = record(value.shorts);
  switch (ref.kind) {
    case "article":
      return scriptRun(value) ? [] : field(value, "articlePrompt");
    case "script":
      return scriptRun(value) ? field(value, "articlePrompt") : [];
    case "narration":
      return field(value, "narrationPrompt");
    case "thumbnail":
      return field(value, "thumbnailPrompt");
    case "description":
      return field(value, "descriptionPrompt");
    case "shorts":
      return field(shorts, "prompt");
    case "review":
      return Object.values(record(record(value.reviews)?.stages) ?? {}).flatMap((stage) =>
        field(record(stage), "prompt"),
      );
    case "image":
      return [
        ...(Array.isArray(value.imagePrompts) ? value.imagePrompts : []).flatMap((one) =>
          field(record(one), "name"),
        ),
        ...field(record(value.reference), "prompt"),
        ...field(shorts, "imagePrompt"),
      ];
  }
}

// The names a form or config holds for one kind of prompt or category of entry.
export function namesIn(value: unknown, ref: LibraryRef): readonly string[] {
  const form = record(value);
  if (form === undefined) return [];
  return slotsIn(form, ref)
    .map((slot) => slot.get())
    .filter((name): name is string => typeof name === "string" && name.trim() !== "");
}

// A copy of the form or config with every place that names `from` naming `to` instead, or
// undefined when nothing names it.
export function renamedIn(value: unknown, ref: LibraryRef, to: string): unknown {
  const form = record(value);
  if (form === undefined) return undefined;
  const copy = structuredClone(form);
  const from = ref.name.trim().toLowerCase();
  let changed = false;
  for (const slot of slotsIn(copy, ref)) {
    const name = slot.get();
    if (typeof name !== "string" || name.trim().toLowerCase() !== from || name === to) continue;
    slot.set(to);
    changed = true;
  }
  return changed ? copy : undefined;
}

export function uses(
  value: unknown,
  ref: LibraryRef,
  formerNames: readonly string[] = [],
): boolean {
  const wanted = new Set([ref.name, ...formerNames].map((name) => name.trim().toLowerCase()));
  return namesIn(value, ref).some((name) => wanted.has(name.trim().toLowerCase()));
}

const documentShape = z.object({ form: z.unknown() }).loose();

function formOf(json: string): unknown {
  const parsed = documentShape.safeParse(JSON.parse(json));
  return parsed.success ? parsed.data.form : undefined;
}

// `formerNames` are names the item had before a rename that no other item holds now: a
// project revision keeps the name its run used (`rename.ts` leaves revisions alone), so a
// renamed prompt still finds the projects that ran it.
export function usedBy(
  db: DatabaseSync,
  ref: LibraryRef,
  formerNames: readonly string[] = [],
): UsedBy {
  // A name that appears nowhere in the JSON cannot match, so SQL skips those rows before any
  // is parsed. JSON escapes quotes and backslashes, so only a plain name is pre-filtered.
  // SQLite's lower() folds ASCII only, so a name with anything else is not pre-filtered.
  const names = [ref.name, ...formerNames];
  const plain = names.every((name) => /^[\x20-\x7e]*$/u.test(name) && !/["\\]/u.test(name))
    ? names.map((name) => name.trim().toLowerCase())
    : [""];
  const mentions = (column: string) =>
    `(${plain.map(() => `instr(lower(${column}),?)>0`).join(" OR ")})`;
  const matches = (value: unknown) => uses(value, ref, formerNames);
  const templates = db
    .prepare(
      `SELECT t.id,r.name,r.document_json FROM project_templates t
       JOIN project_template_revisions r ON r.template_id=t.id AND r.version=t.head_version
       WHERE t.deleted_at IS NULL AND ${mentions("r.document_json")} ORDER BY lower(r.name),t.id`,
    )
    .all(...plain)
    .flatMap((row) => {
      const parsed = templateRow.parse(row);
      return matches(formOf(parsed.document_json)) ? [{ id: parsed.id, name: parsed.name }] : [];
    });
  // A schedule runs its template as it is now (`schedules/scheduler.ts`), so the template's
  // current version is what it uses.
  const schedules = db
    .prepare(
      `SELECT s.id,s.name,s.status,r.document_json FROM schedules s
       JOIN project_templates t ON t.id=s.template_id
       JOIN project_template_revisions r ON r.template_id=t.id AND r.version=t.head_version
       WHERE s.deleted_at IS NULL AND s.status IN ('active','paused') AND ${mentions("r.document_json")}
       ORDER BY lower(s.name),s.id`,
    )
    .all(...plain)
    .flatMap((row) => {
      const parsed = scheduleRow.parse(row);
      return matches(formOf(parsed.document_json))
        ? [{ id: parsed.id, name: parsed.name, status: parsed.status }]
        : [];
    });
  const revisionRows = db
    .prepare(
      `SELECT r.project_id,p.title,r.id AS revision_id,r.config,h.revision_id AS head,
        (SELECT count(*) FROM project_revisions x WHERE x.project_id=r.project_id) AS total
       FROM project_revisions r JOIN projects p ON p.id=r.project_id
       LEFT JOIN project_heads h ON h.project_id=r.project_id
       WHERE ${liveProject("p")} AND ${mentions("r.config")}
       ORDER BY p.created_at DESC,p.id,r.created_at`,
    )
    .all(...plain)
    .map((row) => revisionRow.parse(row));
  const projects = new Map<string, UsedByProject>();
  for (const row of revisionRows) {
    if (!matches(JSON.parse(row.config))) continue;
    const seen = projects.get(row.project_id);
    projects.set(row.project_id, {
      id: row.project_id,
      title: row.title,
      revisions: (seen?.revisions ?? 0) + 1,
      totalRevisions: row.total,
      current: (seen?.current ?? false) || row.head === row.revision_id,
    });
  }
  // A project from before revisions existed has none yet; its own config is what it ran with.
  for (const row of db
    .prepare(
      `SELECT p.id,p.title,p.config FROM projects p
       WHERE ${liveProject("p")}
       AND NOT EXISTS (SELECT 1 FROM project_revisions r WHERE r.project_id=p.id)
       AND ${mentions("p.config")} ORDER BY p.created_at DESC,p.id`,
    )
    .all(...plain)
    .map((row) => legacyRow.parse(row))) {
    if (matches(JSON.parse(row.config)))
      projects.set(row.id, {
        id: row.id,
        title: row.title,
        revisions: 0,
        totalRevisions: 0,
        current: true,
      });
  }
  return { templates, schedules, projects: [...projects.values()] };
}

const templateRow = z.object({ id: z.string(), name: z.string(), document_json: z.string() });
const scheduleRow = z.object({
  id: z.string(),
  name: z.string(),
  status: z.string(),
  document_json: z.string(),
});
const revisionRow = z.object({
  project_id: z.string(),
  title: z.string(),
  revision_id: z.string(),
  config: z.string(),
  head: z.string().nullable(),
  total: z.number(),
});
const legacyRow = z.object({ id: z.string(), title: z.string(), config: z.string() });
