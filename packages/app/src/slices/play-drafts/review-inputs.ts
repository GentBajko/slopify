import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { z } from "zod";
import type { CatalogueStore } from "../../catalog/store.js";
import { modelFields } from "../../catalog/validate.js";
import { admit, type FieldError } from "../admission/rules.js";
import { estimateRun } from "../estimate/index.js";
import type { ResolvedFont } from "../fonts/model.js";
import { listEntries } from "../library/repo.js";
import { pickTemplates, renderPicked } from "../library/slots.js";
import { reviewCheckpointSet } from "../rebuild/recipe-checkpoints.js";
import { readSettings } from "../settings/playback.js";
import { stagedFiles } from "../storage/repo.js";
import { toAdmissionDraft } from "./convert.js";
import type {
  DraftResult,
  DraftReviewDeps,
  DraftView,
  ResolvedPlayReview,
  ResolvedPlayRun,
} from "./model.js";
import { requestHash } from "./repo.js";
import { readDraft } from "./service.js";

export function reviewRefusal(
  view: DraftView,
  fields: readonly FieldError[],
  reason: "readiness" | "stale-review" = "readiness",
): Extract<DraftResult<never>, { ok: false }> {
  return { ok: false, reason, currentVersion: view.draft.version, fields };
}
export function reviewBinding(value: ResolvedPlayReview): string {
  return requestHash({
    ...(value.checkpointSet === undefined ? {} : { checkpointSet: value.checkpointSet }),
    runs: value.runs,
    estimates: value.estimates,
    catalogue: value.catalogue,
    attachmentIdentity: value.attachmentIdentity,
  });
}
export function resolveReviewInputs(
  deps: DraftReviewDeps,
  view: DraftView,
  font: ResolvedFont | null,
): DraftResult<ResolvedPlayReview> {
  const fresh = readDraft(deps, view.draft.id);
  if (!fresh.ok) return fresh;
  if (
    fresh.value.draft.version !== view.draft.version ||
    requestHash(fresh.value.draft.document) !== requestHash(view.draft.document)
  )
    return reviewRefusal(fresh.value, [], "stale-review");
  const { document } = view.draft;
  const fields: FieldError[] = [];
  if (document.fontUpload !== null)
    fields.push({
      field: "fontUpload",
      message: "Wait for the font upload to finish or choose another font.",
    });
  const words = z
    .number()
    .int()
    .min(1)
    .max(100000)
    .safeParse(document.expectedWords.trim() === "" ? Number.NaN : Number(document.expectedWords));
  if (!words.success)
    fields.push({ field: "expectedWords", message: "Enter a whole number between 1 and 100000." });
  if (document.variants.length > 49)
    fields.push({ field: "variants", message: "Review at most 50 runs including the base run." });
  const converted = toAdmissionDraft({
    document,
    attachments: fresh.value.attachments,
    entries: listEntries(deps.db),
    silenceGapSeconds: readSettings(deps).silenceGapSeconds,
  });
  if (!converted.ok) fields.push(...converted.fields);
  if (!converted.ok || !words.success || fields.length) return reviewRefusal(view, fields);
  const catalogue = deps.catalogue.read();
  const captured: CatalogueStore = {
    ...deps.catalogue,
    read: () => catalogue,
    models: (provider, family) =>
      catalogue[family].filter(
        (model) => model.provider === provider && model.enabled && !model.deprecated,
      ),
  };
  const staged = stagedFiles(deps.db);
  const basePicked = pickTemplates(deps.db, converted.draft);
  const drafts = [
    basePicked.draft,
    ...document.variants.map((variant) => ({
      ...basePicked.draft,
      title: variant.title,
      values: { ...basePicked.draft.values, ...variant.values },
    })),
  ];
  const runs: ResolvedPlayRun[] = [];
  for (const [index, draft] of drafts.entries()) {
    const values = Object.fromEntries(
      basePicked.requiredSlots.map((name) => [
        name,
        Object.hasOwn(draft.values, name) ? (draft.values[name] ?? "") : "",
      ]),
    );
    const admitted = admit({
      draft: { ...draft, values },
      staged,
      requiredSlots: basePicked.requiredSlots,
    });
    const accepted = admitted.ok ? admitted.draft : draft;
    const issues = [
      ...basePicked.missing,
      ...(admitted.ok ? [] : admitted.fields),
      ...modelFields(accepted, captured),
    ];
    fields.push(
      ...issues.map((issue) => ({
        ...issue,
        field:
          index > 0 && (issue.field === "title" || issue.field.startsWith("values."))
            ? `variants.${index - 1}.${issue.field}`
            : issue.field,
        message: `${index > 0 ? `Run ${index + 1}: ` : ""}${issue.message}`,
      })),
    );
    runs.push({
      draft: accepted,
      rendered: renderPicked(basePicked, accepted.values),
      templates: Object.fromEntries(basePicked.bodies.map(({ key, body }) => [key, body])),
    });
  }
  const activeIds = new Set(
    runs.flatMap((run) => [
      run.draft.provided.audio,
      run.draft.provided.thumbnail,
      ...(run.draft.provided.images ?? []),
    ]),
  );
  const attachmentIdentity = fresh.value.attachments.flatMap((file) =>
    file.stagedFileId !== null && activeIds.has(file.stagedFileId)
      ? [{ id: file.id, stagedFileId: file.stagedFileId, bytes: file.bytes }]
      : [],
  );
  let fontHash: string | null = null;
  if (font !== null) {
    const stat = statSync(font.path, { throwIfNoEntry: false });
    if (!stat?.isFile() || font.id !== converted.draft.subtitles?.fontId)
      fields.push({
        field: "subtitles.fontId",
        message: "The selected font is no longer available. Choose another font.",
      });
    else fontHash = createHash("sha256").update(readFileSync(font.path)).digest("hex");
  }
  if (fields.length) return reviewRefusal(view, fields);
  const estimates = runs.map((run) => estimateRun(run.draft, run.rendered, words.data, captured));
  for (const run of runs)
    for (const stage of run.draft.checkpoints ?? [])
      if (
        stage === "video"
          ? run.draft.sources.video === "off" && run.draft.sources.audio === "off"
          : run.draft.sources[stage] !== "generate"
      )
        fields.push({
          field: `checkpoints.${stage}`,
          message: "Choose a checkpoint only before an enabled generated stage or export.",
        });
  if (fields.length) return reviewRefusal(view, fields);
  const checkpointSet = reviewCheckpointSet(runs, catalogue, attachmentIdentity, fontHash);
  const resolved = {
    runs,
    estimates,
    catalogue,
    attachmentIdentity,
    font,
    ...(checkpointSet.length ? { checkpointSet } : {}),
  };
  return { ok: true, value: { ...resolved, fingerprint: requestHash({ ...resolved, fontHash }) } };
}
