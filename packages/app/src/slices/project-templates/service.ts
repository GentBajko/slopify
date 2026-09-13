import { z } from "zod";
import { transact } from "../../kernel/db/tx.js";
import type { DraftView } from "../play-drafts/model.js";
import { requestHash } from "../play-drafts/repo.js";
import { createDraft, readDraft } from "../play-drafts/service.js";
import type { ProjectTemplate, TemplateDeps, TemplateResult, TemplateSummary } from "./model.js";
import { insertTemplateRevision, templateById, templateSummaries } from "./repo.js";
import {
  templateCreateSchema,
  templateDeleteSchema,
  templateInstantiateSchema,
  templateUpdateSchema,
} from "./schema.js";
import { freshTemplateDraft, templateSetup } from "./setup.js";

export function listTemplates(deps: TemplateDeps): readonly TemplateSummary[] {
  return templateSummaries(deps.db);
}
export function readTemplate(
  deps: TemplateDeps,
  id: string,
  version?: number,
): TemplateResult<ProjectTemplate> {
  if (
    !z.uuid().safeParse(id).success ||
    (version !== undefined && !z.number().int().positive().safeParse(version).success)
  )
    return { ok: false, reason: "invalid-input" };
  const value = templateById(deps.db, id, version);
  return value ? { ok: true, value } : { ok: false, reason: "not-found" };
}
export function createTemplate(
  deps: TemplateDeps,
  input: unknown,
): TemplateResult<ProjectTemplate> {
  const parsed = templateCreateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid-input" };
  return transact(deps.db, () => {
    const { id, name, document } = parsed.data;
    const hash = requestHash(parsed.data);
    const old = deps.db.prepare("SELECT creation_hash FROM project_templates WHERE id=?").get(id);
    if (old)
      return old.creation_hash === hash
        ? readTemplate(deps, id, 1)
        : { ok: false, reason: "conflict" };
    const setup = templateSetup(deps, document);
    if (!setup.ok) return setup;
    const at = deps.clock.now().toISOString();
    const value: ProjectTemplate = {
      id,
      name,
      document: setup.value,
      version: 1,
      createdAt: at,
      updatedAt: at,
    };
    deps.db
      .prepare(
        "INSERT INTO project_templates(id,head_version,creation_hash,created_at) VALUES (?,1,?,?)",
      )
      .run(id, hash, at);
    insertTemplateRevision(deps.db, value);
    return { ok: true, value };
  });
}
export function updateTemplate(
  deps: TemplateDeps,
  input: unknown,
): TemplateResult<ProjectTemplate> {
  const parsed = templateUpdateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid-input" };
  return transact(deps.db, () => {
    const { id, baseVersion, mutationId, name, document } = parsed.data;
    const previous = templateById(deps.db, id);
    if (!previous) return { ok: false, reason: "not-found" };
    const row = deps.db
      .prepare("SELECT mutation_id,mutation_hash FROM project_templates WHERE id=?")
      .get(id);
    const hash = requestHash(parsed.data);
    if (row?.mutation_id === mutationId)
      return row.mutation_hash === hash
        ? { ok: true, value: previous }
        : { ok: false, reason: "conflict" };
    if (previous.version !== baseVersion) return { ok: false, reason: "conflict" };
    const setup = templateSetup(deps, document);
    if (!setup.ok) return setup;
    const value: ProjectTemplate = {
      ...previous,
      name,
      document: setup.value,
      version: baseVersion + 1,
      updatedAt: deps.clock.now().toISOString(),
    };
    insertTemplateRevision(deps.db, value);
    deps.db
      .prepare(
        "UPDATE project_templates SET head_version=?,mutation_id=?,mutation_hash=? WHERE id=? AND head_version=?",
      )
      .run(value.version, mutationId, hash, id, baseVersion);
    return { ok: true, value };
  });
}
export function deleteTemplate(
  deps: TemplateDeps,
  input: unknown,
): TemplateResult<{ readonly deleted: true }> {
  const parsed = templateDeleteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid-input" };
  return transact(deps.db, () => {
    const previous = templateById(deps.db, parsed.data.id);
    if (!previous) return { ok: false, reason: "not-found" };
    if (previous.version !== parsed.data.baseVersion) return { ok: false, reason: "conflict" };
    if (
      deps.db
        .prepare("SELECT 1 FROM schedules WHERE template_id=? AND deleted_at IS NULL LIMIT 1")
        .get(parsed.data.id)
    )
      return { ok: false, reason: "referenced-by-schedule" };
    deps.db.prepare("DELETE FROM project_templates WHERE id=?").run(parsed.data.id);
    return { ok: true, value: { deleted: true } };
  });
}
export function instantiateTemplate(deps: TemplateDeps, input: unknown): TemplateResult<DraftView> {
  const parsed = templateInstantiateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid-input" };
  return transact(deps.db, () => {
    const { templateId, id, version } = parsed.data;
    const receipt = deps.db
      .prepare(
        "SELECT template_id,template_version FROM project_template_instantiations WHERE draft_id=?",
      )
      .get(id);
    if (receipt) {
      if (receipt.template_id !== templateId || receipt.template_version !== version)
        return { ok: false, reason: "conflict" };
      const draft = readDraft(deps, id);
      return draft.ok ? draft : { ok: false, reason: "conflict" };
    }
    const template = templateById(deps.db, templateId, version);
    if (!template) return { ok: false, reason: "not-found" };
    const result = createDraft(deps, {
      id,
      document: freshTemplateDraft(deps, template.document, { id: templateId, version }),
    });
    if (!result.ok) return { ok: false, reason: "conflict" };
    deps.db.prepare("UPDATE play_draft_attachments SET status='reattach' WHERE draft_id=?").run(id);
    deps.db
      .prepare(
        "INSERT INTO project_template_instantiations(draft_id,template_id,template_version) VALUES (?,?,?)",
      )
      .run(id, templateId, version);
    const draft = readDraft(deps, id);
    if (!draft.ok) throw new Error("Created template draft could not be read");
    return draft;
  });
}
