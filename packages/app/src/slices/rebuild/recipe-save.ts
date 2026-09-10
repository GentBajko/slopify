import { stageKinds } from "../../kernel/pipeline.js";
import type { RunConfig } from "../admission/model.js";
import {
  allowedSources,
  type FieldError,
  normaliseDraft,
  silenceGapSecondsMax,
} from "../admission/rules.js";
import { render } from "../admission/substitute.js";
import type {
  RevisionContent,
  RevisionEdit,
  RevisionManifest,
  RevisionView,
} from "../revisions/model.js";
import { buildRecipes } from "./recipe-build.js";
import { type RecipeContext, selectedReference } from "./recipe-model.js";
import { validateRecipeInputs } from "./recipe-validation.js";

export type RevisionPlanResult =
  | {
      readonly ok: true;
      readonly config: RunConfig;
      readonly content: RevisionContent;
      readonly fingerprints: Readonly<Record<string, string>>;
      readonly manifest: RevisionManifest;
    }
  | { readonly ok: false; readonly fields: readonly FieldError[] };
export function normalizeArticleIntent(base: RevisionView, edit: RevisionEdit): RevisionContent {
  const restart =
    edit.regenerate?.includes("article:body") === true ||
    (base.revision.config.sources.article === "provide" &&
      edit.config.sources.article === "generate");
  const submittedText =
    edit.content.articleEdited === true ||
    edit.content.articleMarkdown !== base.revision.content.articleMarkdown;
  const changed = submittedText && edit.content.articleMarkdown !== base.articleMarkdown;
  return {
    ...edit.content,
    articleEdited: restart
      ? false
      : changed
        ? true
        : (base.revision.content.articleEdited ?? false),
  };
}
export function planRevision(base: RevisionView, edit: RevisionEdit): RevisionPlanResult {
  const content = normalizeImages(normalizeArticleIntent(base, edit));
  const fields = [
    ...validateEdit(edit.config, content),
    ...validateCues(content),
    ...validateRecipeInputs(edit.config, content),
  ];
  if (fields.length > 0) return { ok: false, fields };
  const normalized = normaliseDraft(edit.config);
  const rendered = { ...edit.config.rendered };
  for (const [key, raw] of Object.entries(content.promptTemplates))
    if (raw !== null) rendered[key] = render(raw, normalized.values);
  const config: RunConfig = {
    ...normalized,
    rendered,
    sources: {
      ...normalized.sources,
      images:
        edit.config.sources.images === "off"
          ? "off"
          : content.imageOrder.some((key) => content.imageDefinitions[key]?.source === "generate")
            ? "generate"
            : "provide",
    },
    provided: {
      ...edit.config.provided,
      ...(edit.config.sources.article === "provide"
        ? { article: content.articleMarkdown ?? edit.config.provided.article ?? "" }
        : {}),
    },
  };
  const manifest: RevisionManifest = {
    outputs: base.outputs.filter(selectedReference),
    pieces: base.pieces.filter(selectedReference),
  };
  const oldContext: RecipeContext = {
    config: base.revision.config,
    content: base.revision.content,
    manifest,
    resolved: {
      articleMarkdown: base.articleMarkdown,
      researchNotes: base.revision.config.provided.research ?? null,
    },
  };
  const old = buildRecipes(oldContext);
  const proposedContext: RecipeContext = {
    ...oldContext,
    config,
    content,
    resolved: { ...oldContext.resolved, researchNotes: config.provided.research ?? null },
  };
  const preliminary = buildRecipes(proposedContext);
  const articleChanged =
    old.find((row) => row.key === "article:body")?.fingerprint !==
    preliminary.find((row) => row.key === "article:body")?.fingerprint;
  const draftRecipes =
    config.sources.article === "generate" && !content.articleEdited && articleChanged
      ? buildRecipes({
          ...proposedContext,
          resolved: { ...proposedContext.resolved, articleMarkdown: null },
        })
      : preliminary;
  const changed = new Set(
    draftRecipes
      .filter((row) => old.find((value) => value.key === row.key)?.fingerprint !== row.fingerprint)
      .map((row) => row.key),
  );
  const desired = buildRecipes({
    ...proposedContext,
    manifest: {
      outputs: manifest.outputs.filter((row) => !changed.has(row.workKey)),
      pieces: manifest.pieces.filter((row) => !changed.has(row.key)),
    },
    resolved: {
      ...proposedContext.resolved,
      articleMarkdown:
        config.sources.article === "generate" && !content.articleEdited && articleChanged
          ? null
          : proposedContext.resolved.articleMarkdown,
    },
  });
  const fingerprints = Object.fromEntries(desired.map((row) => [row.key, row.fingerprint]));
  const outputs = manifest.outputs.map((row) => {
    const next = desired.find((value) => value.key === row.workKey);
    const unchanged =
      next !== undefined &&
      old.find((value) => value.key === row.workKey)?.fingerprint === next.fingerprint;
    const state =
      next === undefined
        ? row.state
        : unchanged && row.state === "ready"
          ? "ready"
          : row.fingerprint === next.fingerprint
            ? row.state
            : next.kind === "provided"
              ? "review"
              : "outdated";
    return {
      ...row,
      state,
      fingerprint: state === "ready" && next !== undefined ? next.fingerprint : row.fingerprint,
    };
  });
  const pieces = manifest.pieces.map((row) => {
    const next = desired.find((value) => value.key === row.key);
    const unchanged =
      next !== undefined &&
      old.find((value) => value.key === row.key)?.fingerprint === next.fingerprint;
    return unchanged ? { ...row, fingerprint: next.fingerprint } : row;
  });
  return { ok: true, config, content, fingerprints, manifest: { outputs, pieces } };
}
function normalizeImages(content: RevisionContent): RevisionContent {
  return {
    ...content,
    imageDefinitions: Object.fromEntries(
      Object.entries(content.imageDefinitions).map(([key, value]) => [
        key,
        value.source === "provide" ? { ...value, prompt: null, templateKey: null } : value,
      ]),
    ),
  };
}
function validateEdit(config: RunConfig, content: RevisionContent): readonly FieldError[] {
  const fields: FieldError[] = [];
  for (const kind of stageKinds)
    if (!allowedSources[kind].includes(config.sources[kind]))
      fields.push({
        field: `sources.${kind}`,
        message: `The ${kind} stage cannot be set to ${config.sources[kind]}.`,
      });
  if (config.sources.images !== "off" && content.imageOrder.length === 0)
    fields.push({
      field: "content.imageOrder",
      message: "Keep at least one image, or turn Images and Video off.",
    });
  if (config.sources.images === "off" && config.sources.video !== "off")
    fields.push({ field: "sources.video", message: "Turn Video off when Images is off." });
  if (
    new Set(content.imageOrder).size !== content.imageOrder.length ||
    content.imageOrder.some((key) => content.imageDefinitions[key] === undefined) ||
    Object.keys(content.imageDefinitions).some((key) => !content.imageOrder.includes(key))
  )
    fields.push({
      field: "content.imageOrder",
      message: "Every image must appear exactly once in the image order.",
    });
  if (config.title.trim() === "" || config.title.length > 200)
    fields.push({ field: "title", message: "A title between 1 and 200 characters is required." });
  if (
    !Number.isFinite(config.silenceGapSeconds) ||
    config.silenceGapSeconds < 0 ||
    config.silenceGapSeconds > silenceGapSecondsMax
  )
    fields.push({
      field: "silenceGapSeconds",
      message: `Use a gap between 0 and ${silenceGapSecondsMax} seconds.`,
    });
  if (
    config.sources.article === "provide" &&
    !(content.articleMarkdown ?? config.provided.article)?.trim()
  )
    fields.push({ field: "provided.article", message: "Paste the article." });
  if (
    config.sources.audio === "off" &&
    config.subtitles !== undefined &&
    config.subtitles.mode !== "off"
  )
    fields.push({ field: "subtitles.mode", message: "Subtitles need narration audio." });
  return fields;
}

function validateCues(content: RevisionContent): readonly FieldError[] {
  const cues = content.subtitleCues?.cues;
  if (cues === undefined) return [];
  const fields: FieldError[] = [];
  for (const [index, cue] of cues.entries()) {
    const path = `content.subtitleCues.cues.${index}`;
    if (!cue.text.trim()) fields.push({ field: `${path}.text`, message: "Enter subtitle text." });
    if (!Number.isFinite(cue.start) || cue.start < 0 || cue.start < (cues[index - 1]?.end ?? 0))
      fields.push({ field: `${path}.start`, message: "Cues must be ordered and cannot overlap." });
    if (!Number.isFinite(cue.end) || cue.end <= cue.start)
      fields.push({
        field: `${path}.end`,
        message: "End must follow start.",
      });
  }
  return fields;
}
