import type { Catalogue } from "../../catalog/schema.js";
import type { CatalogueStore } from "../../catalog/store.js";
import { type StageKind, stageKinds } from "../../kernel/pipeline.js";
import { type RunConfig, type StageSource, sourceOf } from "../admission/model.js";
import { admit, type FieldError } from "../admission/rules.js";
import { type CostEstimate, estimateRun } from "../estimate/index.js";
import { retainedPreviewPlan } from "../rebuild/preview-retained.js";
import type { RevisionDeps, RevisionView } from "../revisions/model.js";
import { saveRevision } from "../revisions/mutations.js";
import { currentRevisionId } from "../revisions/repo.js";
import { getRevisionView } from "../revisions/view.js";
import {
  type AddableOutput,
  type AddedOutputPlan,
  addableOutputLabels,
  planAddedOutput,
} from "./add.js";

export interface AddOutputDeps extends RevisionDeps {
  readonly catalogue?: CatalogueStore | undefined;
}

export interface AddedOutputPreview {
  readonly kind: AddableOutput;
  readonly label: string;
  readonly reused: readonly string[];
  readonly created: readonly string[];
  readonly textUse: string;
  // The text model rewrites the text for this output, which Add has to be told it accepts.
  readonly adapts: boolean;
  // The extra cost of the new stages only: the accepted text is priced as supplied.
  readonly estimate: CostEstimate;
  // Choices the project does not hold yet for this output (a voice, an image prompt), each
  // with the Settings control that sets it.
  readonly problems: readonly FieldError[];
  // The settings with the output switched on, for Settings to open with when a choice is missing.
  readonly config: RunConfig;
}

export type AddOutputRefusal = {
  readonly ok: false;
  readonly reason:
    | "no-project"
    | "no-revision"
    | "conflict"
    | "idempotency-conflict"
    | "invalid-edit"
    | "already"
    | "needs-article"
    | "narration-taken"
    | "adaptation-not-accepted";
  readonly message?: string | undefined;
  readonly fields?: readonly FieldError[] | undefined;
};

type Planned =
  | { readonly ok: true; readonly view: RevisionView; readonly plan: AddedOutputPlan }
  | AddOutputRefusal;

function planned(
  deps: AddOutputDeps,
  projectId: string,
  baseRevisionId: string,
  kind: AddableOutput,
): Planned {
  const view = getRevisionView(deps, projectId, baseRevisionId);
  if (view === undefined)
    return {
      ok: false,
      reason: currentRevisionId(deps.db, projectId) === undefined ? "no-project" : "no-revision",
    };
  const result = planAddedOutput(view.revision.config, kind);
  if (!result.ok) return result;
  if (kind !== "images" && (view.articleMarkdown ?? "").trim() === "")
    return {
      ok: false,
      reason: "needs-article",
      message: `${addableOutputLabels[kind]} is made from the article, which is not written yet. Wait for the Article step to finish, then add it.`,
    };
  return { ok: true, view, plan: result.plan };
}

export function previewAddedOutput(
  deps: AddOutputDeps,
  input: {
    readonly projectId: string;
    readonly baseRevisionId: string;
    readonly kind: AddableOutput;
  },
): { readonly ok: true; readonly value: AddedOutputPreview } | AddOutputRefusal {
  const found = planned(deps, input.projectId, input.baseRevisionId, input.kind);
  if (!found.ok) return found;
  if (!found.view.current) return { ok: false, reason: "conflict" };
  const { view, plan } = found;
  const text = view.articleMarkdown ?? "";
  return {
    ok: true,
    value: {
      kind: plan.kind,
      label: addableOutputLabels[plan.kind],
      reused: plan.reused,
      created: plan.created,
      textUse: plan.textUse,
      adapts: plan.adapts,
      estimate: estimateRun(
        addedOnly(view.revision.config, plan.config, text),
        plan.config.rendered,
        words(text),
        deps.catalogue,
      ),
      problems: newProblems(view.revision.config, plan.config),
      config: plan.config,
    },
  };
}

// Saves the revision that switches the new output on, and names the work only it needs: the
// keys the previous revision did not have, minus anything the new revision can reuse. The
// caller previews and starts exactly those, so nothing already accepted runs again.
export async function addOutput(
  deps: AddOutputDeps,
  input: {
    readonly projectId: string;
    readonly baseRevisionId: string;
    readonly kind: AddableOutput;
    readonly idempotencyKey: string;
    // "Adapt my text into a conversation", ticked: required when the output rewrites the text.
    readonly adapt?: boolean | undefined;
  },
): Promise<
  | {
      readonly ok: true;
      readonly view: RevisionView;
      readonly workKeys: readonly string[];
      readonly duplicate: boolean;
    }
  | AddOutputRefusal
> {
  const found = planned(deps, input.projectId, input.baseRevisionId, input.kind);
  if (!found.ok) return found;
  const { view, plan } = found;
  if (plan.adapts && input.adapt !== true)
    return {
      ok: false,
      reason: "adaptation-not-accepted",
      message: `${addableOutputLabels[plan.kind]} rewrites your article as a conversation. Tick "Adapt my article into a conversation" in Add another output, then add it.`,
    };
  const problems = newProblems(view.revision.config, plan.config);
  if (problems.length > 0) return { ok: false, reason: "invalid-edit", fields: problems };
  const catalogue = catalogueOf(deps);
  const before = new Set(retainedPreviewPlan(deps, view, catalogue).work.map((row) => row.key));
  const saved = await saveRevision(deps, {
    projectId: input.projectId,
    baseRevisionId: input.baseRevisionId,
    idempotencyKey: input.idempotencyKey,
    edit: { config: plan.config, content: view.revision.content },
  });
  if (!saved.ok)
    return {
      ok: false,
      reason: saved.reason,
      ...(saved.fields === undefined ? {} : { fields: saved.fields }),
    };
  const workKeys = retainedPreviewPlan(deps, saved.view, catalogue)
    .work.filter((row) => !before.has(row.key) && row.disposition !== "reuse")
    .map((row) => row.key);
  return { ok: true, view: saved.view, workKeys, duplicate: saved.duplicate };
}

// The new output priced on its own: the accepted text as supplied, the stages already made
// switched off (narration as supplied when a video is added over it).
function addedOnly(before: RunConfig, after: RunConfig, text: string): RunConfig {
  const made = stageKinds.filter((kind) => sourceOf(before.sources, kind) !== "off");
  const sources = {
    ...after.sources,
    ...Object.fromEntries(made.map((kind) => [kind, suppliedSource(kind)])),
  };
  return {
    ...after,
    sources,
    provided: { ...after.provided, article: text },
    ...(sourceOf(before.sources, "video") === "off"
      ? {}
      : { youtubeDescription: undefined, shorts: undefined }),
  };
}

function suppliedSource(kind: StageKind): StageSource {
  return kind === "audio" || kind === "images" || kind === "article" ? "provide" : "off";
}

// What admission refuses for the new configuration that it did not refuse before: the choices
// the new output needs and the project lacks. Problems the project already had stay its own.
function newProblems(before: RunConfig, after: RunConfig): readonly FieldError[] {
  const fieldsOf = (config: RunConfig): readonly FieldError[] => {
    const result = admit({ draft: config, staged: [], requiredSlots: [] });
    return result.ok ? [] : result.fields;
  };
  const known = new Set(fieldsOf(before).map((one) => `${one.field}\n${one.message}`));
  return fieldsOf(after)
    .filter((one) => !known.has(`${one.field}\n${one.message}`))
    .map((one) => ({ field: one.field, message: settingsHint(one) }));
}

function settingsHint(problem: FieldError): string {
  return /Settings|Edit project/.test(problem.message)
    ? problem.message
    : `${problem.message} Set it in this project's Settings, save, then add the output again.`;
}

function catalogueOf(deps: AddOutputDeps): Catalogue {
  return (
    deps.catalogue?.read() ?? {
      schemaVersion: 1,
      updatedAt: "",
      providers: {},
      llm: [],
      tts: [],
      image: [],
    }
  );
}

function words(text: string): number {
  return text.split(/\s+/u).filter((one) => one !== "").length;
}
