import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { type Catalogue, isVideoModel } from "../../catalog/schema.js";
import type { RunConfig } from "../admission/model.js";
import { listProjects, stagesOf } from "../admission/repo.js";
import { draftRows } from "../play-drafts/repo.js";
import type { PlayDraftForm } from "../play-drafts/schema.js";
import { documentOf } from "../play-drafts/service.js";
import { templateById } from "../project-templates/repo.js";
import { currentRevisionId, revisionById } from "../revisions/repo.js";
import { isLocalCliProvider } from "../settings/model.js";
import type { ModelChoice, RetiredUsage, UsageKind, UsageSlot } from "./model.js";
import { usageSlots } from "./model.js";

export type { ModelChoice, RetiredUsage, UsageKind, UsageSlot } from "./model.js";
export { slotLabels, usageKinds, usageSlots } from "./model.js";

function familyOf(slot: UsageSlot): "llm" | "tts" | "image" {
  return slot === "llm" ? "llm" : slot === "audio" ? "tts" : "image";
}

// The model choices a Play form (a draft or a template) makes.
export function formChoices(form: PlayDraftForm): Partial<Record<UsageSlot, ModelChoice>> {
  const edit = form.videoEdit;
  return {
    llm: form.llm,
    audio: form.audio,
    images: form.images,
    ...(edit !== undefined && edit.animate !== "off"
      ? { animate: { provider: form.images.provider, model: edit.animateModel } }
      : {}),
  };
}
// The same for a project's run configuration.
export function configChoices(config: RunConfig): Partial<Record<UsageSlot, ModelChoice>> {
  const edit = config.videoEdit;
  return {
    ...(config.llm === undefined ? {} : { llm: config.llm }),
    ...(config.audio === undefined ? {} : { audio: config.audio }),
    ...(config.images === undefined ? {} : { images: config.images }),
    ...(edit !== undefined && edit.animate !== "off" && config.images !== undefined
      ? { animate: { provider: config.images.provider, model: edit.animateModel } }
      : {}),
  };
}

// Whether a choice names a catalogued model that is no longer offered. Command-line tools
// list their own models and are checked by the health check instead.
export function retiredStatus(
  catalogue: Catalogue,
  slot: UsageSlot,
  choice: ModelChoice,
): "retired" | "unlisted" | null {
  if (choice.provider === "" || choice.model.trim() === "" || isLocalCliProvider(choice.provider))
    return null;
  const row = catalogue[familyOf(slot)].find(
    (model) =>
      model.provider === choice.provider &&
      model.id === choice.model &&
      isVideoModel(model) === (slot === "animate"),
  );
  if (row === undefined) return "unlisted";
  if (row.deprecated) return "retired";
  return row.enabled ? null : "unlisted";
}

// The closest active model from the same provider and list: the one sharing the longest
// start of its ID (a newer version of the same line), the catalogue's order breaking ties.
export function suggestReplacement(
  catalogue: Catalogue,
  slot: UsageSlot,
  choice: ModelChoice,
): { readonly id: string; readonly name: string } | null {
  let best: { readonly id: string; readonly name: string; readonly score: number } | null = null;
  for (const row of catalogue[familyOf(slot)]) {
    if (
      row.provider !== choice.provider ||
      row.id === choice.model ||
      !row.enabled ||
      row.deprecated ||
      isVideoModel(row) !== (slot === "animate")
    )
      continue;
    const score = sharedStart(row.id.toLowerCase(), choice.model.toLowerCase());
    if (best === null || score > best.score) best = { id: row.id, name: row.name, score };
  }
  return best === null ? null : { id: best.id, name: best.name };
}

function sharedStart(a: string, b: string): number {
  let index = 0;
  while (index < a.length && index < b.length && a[index] === b[index]) index++;
  return index;
}

function usagesOf(
  catalogue: Catalogue,
  base: Pick<RetiredUsage, "kind" | "id" | "name">,
  choices: Partial<Record<UsageSlot, ModelChoice>>,
  blocked: string | null,
): RetiredUsage[] {
  const found: RetiredUsage[] = [];
  for (const slot of usageSlots) {
    const choice = choices[slot];
    if (choice === undefined) continue;
    const why = retiredStatus(catalogue, slot, choice);
    if (why === null) continue;
    const replacement = suggestReplacement(catalogue, slot, choice);
    found.push({
      ...base,
      key: `${base.kind}:${base.id}:${slot}`,
      slot,
      provider: choice.provider,
      model: choice.model,
      why,
      replacement,
      blocked:
        blocked ??
        (replacement === null
          ? "This provider has no other model to switch to. Choose another provider for this step and save."
          : null),
    });
  }
  return found;
}

const scheduleRow = z.object({
  id: z.string(),
  name: z.string(),
  template_id: z.string(),
  template_version: z.number(),
});
const headRow = z.object({ head_version: z.number() });

// A place that picks models: a template, a schedule (the template version it runs), a draft,
// or a project with steps still to run.
export interface ChoiceSite {
  readonly kind: UsageKind;
  readonly id: string;
  readonly name: string;
  readonly choices: Partial<Record<UsageSlot, ModelChoice>>;
  // Why this site cannot be switched in one click, if it cannot.
  readonly blocked: string | null;
}

export function choiceSites(db: DatabaseSync): readonly ChoiceSite[] {
  const sites: ChoiceSite[] = [];
  const heads = new Map<string, number>();
  for (const row of db.prepare("SELECT id FROM project_templates ORDER BY id").all()) {
    const id = z.object({ id: z.string() }).parse(row).id;
    const template = templateById(db, id);
    if (template === undefined) continue;
    heads.set(id, template.version);
    sites.push({
      kind: "template",
      id,
      name: template.name,
      choices: formChoices(template.document.form),
      blocked: null,
    });
  }
  for (const raw of db
    .prepare(
      "SELECT id,name,template_id,template_version FROM schedules WHERE deleted_at IS NULL AND status IN ('active','paused') ORDER BY lower(name),id",
    )
    .all()) {
    const row = scheduleRow.parse(raw);
    const template = templateById(db, row.template_id, row.template_version);
    if (template === undefined) continue;
    const head =
      heads.get(row.template_id) ??
      headRow.parse(
        db.prepare("SELECT head_version FROM project_templates WHERE id=?").get(row.template_id),
      ).head_version;
    sites.push({
      kind: "schedule",
      id: row.id,
      name: row.name,
      choices: formChoices(template.document.form),
      blocked:
        head === row.template_version
          ? null
          : `This schedule runs an older version of the template "${template.name}". In Library → Schedules, choose Edit, pick the template again so it runs the latest version, then save.`,
    });
  }
  for (const row of draftRows(db)) {
    if (row.state !== "active") continue;
    const document = documentOf(row);
    if (document === null) continue;
    sites.push({
      kind: "draft",
      id: row.id,
      name: row.title.trim() === "" ? "Untitled draft" : row.title,
      choices: formChoices(document.form),
      blocked: null,
    });
  }
  for (const project of listProjects(db)) {
    const stages = stagesOf(db, project.id);
    // Only a project with steps still to run will use its models again.
    if (!stages.some((stage) => ["pending", "running", "failed", "canceled"].includes(stage.state)))
      continue;
    const revisionId = currentRevisionId(db, project.id);
    const config =
      revisionId === undefined
        ? project.config
        : (revisionById(db, project.id, revisionId)?.config ?? project.config);
    sites.push({
      kind: "project",
      id: project.id,
      name: project.title,
      choices: configChoices(config),
      blocked: stages.some((stage) => stage.state === "running")
        ? "This project is running. Wait for it to finish or pause it, then switch."
        : null,
    });
  }
  return sites;
}

// Every template, schedule, draft and unfinished project that still picks a retired or
// unlisted model, with the suggested replacement. Nothing is changed here.
export function retiredModelUsage(db: DatabaseSync, catalogue: Catalogue): readonly RetiredUsage[] {
  return choiceSites(db).flatMap((site) =>
    usagesOf(
      catalogue,
      { kind: site.kind, id: site.id, name: site.name },
      site.choices,
      site.blocked,
    ),
  );
}
