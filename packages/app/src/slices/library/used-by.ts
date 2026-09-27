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

// The fields of a Play form or a run config that name Library items. Both shapes carry the
// same names; a run config holds the intro and outro as `{ name }` and a form as the name.
const named = z.string().optional().catch(undefined);
const refsShape = z
  .object({
    articlePrompt: named,
    narrationPrompt: named,
    thumbnailPrompt: named,
    descriptionPrompt: named,
    imagePrompts: z
      .array(z.object({ name: z.string() }).loose())
      .optional()
      .catch(undefined),
    reference: z.object({ prompt: named }).loose().optional().catch(undefined),
    shorts: z.object({ prompt: named, imagePrompt: named }).loose().optional().catch(undefined),
    intro: z
      .union([z.string(), z.object({ name: z.string() }).loose()])
      .optional()
      .catch(undefined),
    outro: z
      .union([z.string(), z.object({ name: z.string() }).loose()])
      .optional()
      .catch(undefined),
  })
  .loose();

// The names a form or config holds for one kind of prompt or category of entry.
export function namesIn(value: unknown, ref: LibraryRef): readonly string[] {
  const parsed = refsShape.safeParse(value);
  if (!parsed.success) return [];
  const form = parsed.data;
  const entryName = (one: typeof form.intro) =>
    one === undefined ? undefined : typeof one === "string" ? one : one.name;
  const names: (string | undefined)[] =
    ref.item === "entry"
      ? [ref.category === "intro" ? entryName(form.intro) : entryName(form.outro)]
      : ref.kind === "article"
        ? [form.articlePrompt]
        : ref.kind === "narration"
          ? [form.narrationPrompt]
          : ref.kind === "thumbnail"
            ? [form.thumbnailPrompt]
            : ref.kind === "description"
              ? [form.descriptionPrompt]
              : ref.kind === "shorts"
                ? [form.shorts?.prompt]
                : [
                    ...(form.imagePrompts ?? []).map((one) => one.name),
                    form.reference?.prompt,
                    form.shorts?.imagePrompt,
                  ];
  return names.filter((name): name is string => name !== undefined && name.trim() !== "");
}

export function uses(value: unknown, ref: LibraryRef): boolean {
  const wanted = ref.name.trim().toLowerCase();
  return namesIn(value, ref).some((name) => name.trim().toLowerCase() === wanted);
}

const documentShape = z.object({ form: z.unknown() }).loose();

function formOf(json: string): unknown {
  const parsed = documentShape.safeParse(JSON.parse(json));
  return parsed.success ? parsed.data.form : undefined;
}

export function usedBy(db: DatabaseSync, ref: LibraryRef): UsedBy {
  // A name that appears nowhere in the JSON cannot match, so SQL skips those rows before any
  // is parsed. JSON escapes quotes and backslashes, so only a plain name is pre-filtered.
  // SQLite's lower() folds ASCII only, so a name with anything else is not pre-filtered.
  const plain =
    /^[\x20-\x7e]*$/u.test(ref.name) && !/["\\]/u.test(ref.name)
      ? ref.name.trim().toLowerCase()
      : "";
  const templates = db
    .prepare(
      `SELECT t.id,r.name,r.document_json FROM project_templates t
       JOIN project_template_revisions r ON r.template_id=t.id AND r.version=t.head_version
       WHERE t.deleted_at IS NULL AND instr(lower(r.document_json),?)>0 ORDER BY lower(r.name),t.id`,
    )
    .all(plain)
    .flatMap((row) => {
      const parsed = templateRow.parse(row);
      return uses(formOf(parsed.document_json), ref) ? [{ id: parsed.id, name: parsed.name }] : [];
    });
  // A schedule runs the template version it was saved with, so that version is what it uses.
  const schedules = db
    .prepare(
      `SELECT s.id,s.name,s.status,r.document_json FROM schedules s
       JOIN project_template_revisions r ON r.template_id=s.template_id AND r.version=s.template_version
       WHERE s.deleted_at IS NULL AND s.status IN ('active','paused') AND instr(lower(r.document_json),?)>0
       ORDER BY lower(s.name),s.id`,
    )
    .all(plain)
    .flatMap((row) => {
      const parsed = scheduleRow.parse(row);
      return uses(formOf(parsed.document_json), ref)
        ? [{ id: parsed.id, name: parsed.name, status: parsed.status }]
        : [];
    });
  const revisionRows = db
    .prepare(
      `SELECT r.project_id,p.title,r.id AS revision_id,r.config,h.revision_id AS head,
        (SELECT count(*) FROM project_revisions x WHERE x.project_id=r.project_id) AS total
       FROM project_revisions r JOIN projects p ON p.id=r.project_id
       LEFT JOIN project_heads h ON h.project_id=r.project_id
       WHERE ${liveProject("p")} AND instr(lower(r.config),?)>0
       ORDER BY p.created_at DESC,p.id,r.created_at`,
    )
    .all(plain)
    .map((row) => revisionRow.parse(row));
  const projects = new Map<string, UsedByProject>();
  for (const row of revisionRows) {
    if (!uses(JSON.parse(row.config), ref)) continue;
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
       AND instr(lower(p.config),?)>0 ORDER BY p.created_at DESC,p.id`,
    )
    .all(plain)
    .map((row) => legacyRow.parse(row))) {
    if (uses(JSON.parse(row.config), ref))
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
