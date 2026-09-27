import type { Catalogue } from "../../catalog/schema.js";
import { transact } from "../../kernel/db/tx.js";
import type { ThinkingMode } from "../../kernel/ports/llm.js";
import type { RunConfig } from "../admission/model.js";
import { projectById, stagesOf, updateProjectConfig } from "../admission/repo.js";
import type { DraftDeps } from "../play-drafts/model.js";
import { draftRow } from "../play-drafts/repo.js";
import type { PlayDraftForm } from "../play-drafts/schema.js";
import { documentOf, saveDraft } from "../play-drafts/service.js";
import { templateById } from "../project-templates/repo.js";
import { updateTemplate } from "../project-templates/service.js";
import { ensureBaseline, saveRevision } from "../revisions/index.js";
import type { RevisionDeps } from "../revisions/model.js";
import { currentRevisionId } from "../revisions/repo.js";
import {
  configChoices,
  formChoices,
  type ModelChoice,
  type RetiredUsage,
  retiredModelUsage,
  retiredStatus,
  type UsageKind,
  type UsageSlot,
} from "./usage.js";

export type UpkeepDeps = RevisionDeps & Pick<DraftDeps, "uuid">;
export interface SwitchRequest {
  readonly kind: UsageKind;
  readonly id: string;
  readonly slot: UsageSlot;
  readonly from: ModelChoice;
  // The model the button named. The server never picks a different one.
  readonly to: string;
}
export type SwitchResult =
  | { readonly ok: true; readonly changed: boolean }
  | { readonly ok: false; readonly message: string };

function keepThinking(
  catalogue: Catalogue,
  provider: string,
  model: string,
  thinking: ThinkingMode | undefined,
): { readonly thinking?: ThinkingMode } {
  if (thinking === undefined) return {};
  const row = catalogue.llm.find((entry) => entry.provider === provider && entry.id === model);
  return row?.llm.thinking?.[thinking] === undefined ? {} : { thinking };
}

function matches(choice: ModelChoice | undefined, from: ModelChoice): boolean {
  return choice !== undefined && choice.provider === from.provider && choice.model === from.model;
}

// The form with one model choice replaced, or undefined when the form no longer picks `from`
// there (it was changed meanwhile, so there is nothing to switch).
export function switchForm(
  form: PlayDraftForm,
  catalogue: Catalogue,
  request: SwitchRequest,
): PlayDraftForm | undefined {
  if (!matches(formChoices(form)[request.slot], request.from)) return undefined;
  const { to } = request;
  switch (request.slot) {
    case "llm": {
      const { thinking, ...rest } = form.llm;
      return {
        ...form,
        llm: { ...rest, model: to, ...keepThinking(catalogue, rest.provider, to, thinking) },
      };
    }
    case "audio":
      return { ...form, audio: { ...form.audio, model: to } };
    case "images":
      return { ...form, images: { ...form.images, model: to } };
    case "animate":
      return form.videoEdit === undefined
        ? undefined
        : { ...form, videoEdit: { ...form.videoEdit, animateModel: to } };
  }
}
export function switchConfig(
  config: RunConfig,
  catalogue: Catalogue,
  request: SwitchRequest,
): RunConfig | undefined {
  if (!matches(configChoices(config)[request.slot], request.from)) return undefined;
  const { to } = request;
  switch (request.slot) {
    case "llm": {
      if (config.llm === undefined) return undefined;
      const { thinking, ...rest } = config.llm;
      return {
        ...config,
        llm: { ...rest, model: to, ...keepThinking(catalogue, rest.provider, to, thinking) },
      };
    }
    case "audio":
      return config.audio === undefined
        ? undefined
        : { ...config, audio: { ...config.audio, model: to } };
    case "images":
      return config.images === undefined
        ? undefined
        : { ...config, images: { ...config.images, model: to } };
    case "animate":
      return config.videoEdit === undefined
        ? undefined
        : { ...config, videoEdit: { ...config.videoEdit, animateModel: to } };
  }
}

const changedMeanwhile =
  "This changed while you were looking at it. Reload Settings → Models to see what still uses a retired model.";

// One click on "Switch to <model>": changes that one choice and nothing else. A template gets a
// new version, and the schedules that ran its latest version follow it to the new one.
export async function switchRetiredModel(
  deps: UpkeepDeps,
  catalogue: Catalogue,
  request: SwitchRequest,
): Promise<SwitchResult> {
  if (
    retiredStatus(catalogue, request.slot, {
      provider: request.from.provider,
      model: request.to,
    }) !== null
  )
    return {
      ok: false,
      message: `${request.to} is not an active model of this provider. Reload Settings → Models and use the suggested switch, or choose a model yourself in the ${request.kind}.`,
    };
  switch (request.kind) {
    case "template":
      return switchTemplate(deps, catalogue, request, request.id);
    case "schedule": {
      const row = deps.db
        .prepare(
          "SELECT s.template_id AS templateId,s.template_version AS version,t.head_version AS head FROM schedules s JOIN project_templates t ON t.id=s.template_id WHERE s.id=? AND s.deleted_at IS NULL",
        )
        .get(request.id);
      if (row === undefined) return { ok: false, message: changedMeanwhile };
      if (row.version !== row.head)
        return {
          ok: false,
          message:
            "This schedule runs an older version of its template. In Library → Schedules, choose Edit, pick the template again so it runs the latest version, then save.",
        };
      return switchTemplate(deps, catalogue, request, String(row.templateId));
    }
    case "draft":
      return switchDraft(deps, catalogue, request);
    case "project":
      return switchProject(deps, catalogue, request);
  }
}

function switchTemplate(
  deps: UpkeepDeps,
  catalogue: Catalogue,
  request: SwitchRequest,
  templateId: string,
): SwitchResult {
  return transact(deps.db, (): SwitchResult => {
    const template = templateById(deps.db, templateId);
    if (template === undefined) return { ok: false, message: changedMeanwhile };
    const form = switchForm(template.document.form, catalogue, request);
    if (form === undefined) return { ok: true, changed: false };
    const saved = updateTemplate(deps, {
      id: template.id,
      name: template.name,
      document: { ...template.document, form },
      baseVersion: template.version,
      mutationId: deps.uuid(),
    });
    if (!saved.ok)
      return {
        ok: false,
        message:
          saved.reason === "missing-prompt"
            ? `The template "${template.name}" uses a prompt or intro/outro that was deleted, so it cannot be saved. Open it in Library → Templates, choose another, and save.`
            : changedMeanwhile,
      };
    deps.db
      .prepare(
        "UPDATE schedules SET template_version=?,version=version+1,updated_at=? WHERE template_id=? AND template_version=? AND deleted_at IS NULL AND status IN ('active','paused')",
      )
      .run(saved.value.version, deps.clock.now().toISOString(), template.id, template.version);
    return { ok: true, changed: true };
  });
}

function switchDraft(deps: UpkeepDeps, catalogue: Catalogue, request: SwitchRequest): SwitchResult {
  const row = draftRow(deps.db, request.id);
  const document = row === undefined ? null : documentOf(row);
  if (row === undefined || document === null || row.state !== "active")
    return { ok: false, message: changedMeanwhile };
  const form = switchForm(document.form, catalogue, request);
  if (form === undefined) return { ok: true, changed: false };
  const saved = saveDraft(
    { ...deps, uuid: deps.uuid },
    {
      id: row.id,
      baseVersion: row.version,
      mutationId: deps.uuid(),
      document: { ...document, form },
    },
  );
  return saved.ok ? { ok: true, changed: true } : { ok: false, message: changedMeanwhile };
}

async function switchProject(
  deps: UpkeepDeps,
  catalogue: Catalogue,
  request: SwitchRequest,
): Promise<SwitchResult> {
  const project = projectById(deps.db, request.id);
  if (project === undefined) return { ok: false, message: changedMeanwhile };
  if (stagesOf(deps.db, project.id).some((stage) => stage.state === "running"))
    return {
      ok: false,
      message: "This project is running. Wait for it to finish or pause it, then switch.",
    };
  if (currentRevisionId(deps.db, project.id) === undefined) {
    // A project never edited has no saved versions yet: its configuration is the run itself.
    const config = switchConfig(project.config, catalogue, request);
    if (config === undefined) return { ok: true, changed: false };
    updateProjectConfig(deps.db, project.id, config, deps.clock.now().toISOString());
    return { ok: true, changed: true };
  }
  const baseline = await ensureBaseline(deps, project.id);
  if (!baseline.ok) return { ok: false, message: changedMeanwhile };
  const { revision } = baseline.view;
  const config = switchConfig(revision.config, catalogue, request);
  if (config === undefined) return { ok: true, changed: false };
  // The same save Edit project makes: a new version with only the model changed.
  const saved = await saveRevision(deps, {
    projectId: project.id,
    baseRevisionId: revision.id,
    idempotencyKey: deps.uuid(),
    edit: { config, content: revision.content },
  });
  return saved.ok
    ? { ok: true, changed: true }
    : {
        ok: false,
        message: `Slopify could not save the new model on "${project.title}"${
          saved.reason === "conflict"
            ? " because the project changed meanwhile"
            : "fields" in saved && saved.fields?.[0] !== undefined
              ? ` (${saved.fields[0].message})`
              : ""
        }. Open the project, choose Edit project and change it under Providers.`,
      };
}

// "Switch all": every listed use that has a suggestion and no reason to hold back, one by one.
export async function switchAllRetired(
  deps: UpkeepDeps,
  catalogue: Catalogue,
): Promise<{
  readonly switched: number;
  readonly failed: readonly { readonly key: string; readonly message: string }[];
}> {
  let switched = 0;
  const failed: { key: string; message: string }[] = [];
  // Templates first: switching one also moves the schedules that follow it.
  const order: readonly UsageKind[] = ["template", "schedule", "draft", "project"];
  const usages = [...retiredModelUsage(deps.db, catalogue)].sort(
    (a, b) => order.indexOf(a.kind) - order.indexOf(b.kind),
  );
  for (const usage of usages) {
    if (usage.blocked !== null || usage.replacement === null) continue;
    const result = await switchRetiredModel(deps, catalogue, requestOf(usage));
    if (!result.ok) failed.push({ key: usage.key, message: result.message });
    else if (result.changed) switched++;
  }
  return { switched, failed };
}

export function requestOf(usage: RetiredUsage): SwitchRequest {
  return {
    kind: usage.kind,
    id: usage.id,
    slot: usage.slot,
    from: { provider: usage.provider, model: usage.model },
    to: usage.replacement?.id ?? "",
  };
}
