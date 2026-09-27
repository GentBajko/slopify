import { z } from "zod";
import { transact } from "../../kernel/db/tx.js";
import { sourceOf } from "../admission/model.js";
import { projectById } from "../admission/repo.js";
import { detectSlots } from "../admission/substitute.js";
import { projectChannelId } from "../channels/repo.js";
import { listCheckpoints } from "../checkpoints/repo.js";
import { documentThemeOf } from "../document/model.js";
import { imageScaleForm } from "../images/scale.js";
import type { PromptKind } from "../library/model.js";
import type { LibrarySnapshot } from "../library/snapshot.js";
import type { PlayDraftDocument } from "../play-drafts/model.js";
import { requestHash } from "../play-drafts/repo.js";
import { reviewSettingsForm } from "../reviews/model.js";
import type { ProjectRevision } from "../revisions/model.js";
import { currentRevisionId, revisionById } from "../revisions/repo.js";
import { shortsExtrasForm } from "../shorts/model.js";
import { ambientBedFormOf } from "../video/ambient-bed.js";
import { usesScriptPrompt } from "../voices/model.js";
import type { ProjectTemplate, TemplateDeps, TemplateResult } from "./model.js";
import { createTemplate, readTemplate } from "./service.js";

export const projectTemplateCreateSchema = z
  .object({
    id: z.uuid(),
    name: z.string().trim().min(1).max(200),
    projectId: z.string().min(1).max(64),
    revisionId: z.string().min(1).max(64),
  })
  .strict()
  .readonly();
export const templateFromProjectSchema = projectTemplateCreateSchema;

export function createTemplateFromProject(
  deps: TemplateDeps,
  input: unknown,
): TemplateResult<ProjectTemplate> {
  const parsed = projectTemplateCreateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid-input" };
  return transact(deps.db, () => {
    const hash = requestHash({ operation: "template-from-project", ...parsed.data });
    const old = deps.db
      .prepare("SELECT creation_hash FROM project_templates WHERE id=?")
      .get(parsed.data.id);
    if (old)
      return old.creation_hash === hash
        ? readTemplate(deps, parsed.data.id, 1)
        : { ok: false, reason: "conflict" };
    const project = projectById(deps.db, parsed.data.projectId);
    if (project === undefined) return { ok: false, reason: "not-found" };
    const current = currentRevisionId(deps.db, project.id);
    if (current === undefined || current !== parsed.data.revisionId)
      return { ok: false, reason: "conflict" };
    const revision = revisionById(deps.db, project.id, current);
    if (revision === undefined) return { ok: false, reason: "conflict" };
    if (
      revision.config.sources.images === "generate" &&
      revision.content.imageOrder.some(
        (key) => revision.content.imageDefinitions[key]?.source === "provide",
      )
    )
      return { ok: false, reason: "invalid-input" };
    const result = createTemplate(deps, {
      id: parsed.data.id,
      name: parsed.data.name,
      // The project's channel, so the template lands where the video came from.
      document: {
        ...documentFromProject(deps, revision),
        channelId: projectChannelId(deps.db, project.id),
      },
    });
    if (result.ok)
      deps.db
        .prepare("UPDATE project_templates SET creation_hash=? WHERE id=?")
        .run(hash, parsed.data.id);
    return result;
  });
}

function documentFromProject(deps: TemplateDeps, revision: ProjectRevision): PlayDraftDocument {
  const config = revision.config;
  const prompts: LibrarySnapshot["prompts"][number][] = [];
  const entries: LibrarySnapshot["entries"][number][] = [];
  const addPrompt = (kind: PromptKind, name: string | undefined, key: string, literal?: string) => {
    if (!name) return;
    const body = literal ?? revision.content.promptTemplates[key] ?? config.rendered[key];
    if (body === null || body === undefined) return;
    prompts.push({
      id: deps.uuid(),
      kind,
      name,
      body,
      slots: [...detectSlots(body).names],
      updatedAt: revision.createdAt,
    });
  };
  addPrompt(usesScriptPrompt(config) ? "script" : "article", config.articlePrompt, "article");
  addPrompt("narration", config.narrationPrompt, "narration");
  addPrompt("description", config.descriptionPrompt, "description");
  for (const [stage, picked] of Object.entries(config.reviews?.stages ?? {}))
    addPrompt("review", picked.prompt, `review.${stage}`);
  const definitions = revision.content.imageOrder.flatMap((key) => {
    const definition = revision.content.imageDefinitions[key];
    return definition === undefined ? [] : [definition];
  });
  const imagePrompts =
    // A project that scales its images with the narration's length keeps its ticked prompts
    // and the setting, rather than one prompt per image of the count it planned.
    config.sources.images === "generate" &&
    definitions.length > 0 &&
    config.imageScale === undefined
      ? definitions.map((definition, index) => {
          const key = definition.templateKey ?? "";
          const original = revision.content.promptTemplates[key];
          const body =
            original && definition.prompt === config.rendered[key]
              ? original
              : (definition.prompt ?? original ?? "");
          const name = `Project image ${index + 1}`;
          addPrompt("image", name, key, body);
          return { name, number: "1" };
        })
      : config.imagePrompts.map((prompt, index) => {
          addPrompt("image", prompt.name, `imagePrompts.${index}`);
          return { name: prompt.name, number: String(prompt.number) };
        });
  addPrompt("thumbnail", config.thumbnailPrompt, "thumbnailPrompt");
  addPrompt("shorts", config.shorts?.prompt, "shorts");
  // The shorts' image style may be the same Library prompt one of the slideshow images uses,
  // and a snapshot holds one prompt per kind and name.
  if (
    !prompts.some((prompt) => prompt.kind === "image" && prompt.name === config.shorts?.imagePrompt)
  )
    addPrompt("image", config.shorts?.imagePrompt, "shortsImage");
  // The establishing image's prompt, the same way.
  if (
    config.reference?.source === "prompt" &&
    !prompts.some((prompt) => prompt.kind === "image" && prompt.name === config.reference?.prompt)
  )
    addPrompt("image", config.reference.prompt, "referencePrompt");
  for (const category of ["intro", "outro"] as const) {
    const choice = config[category];
    const body = revision.content.promptTemplates[category] ?? config.rendered[category];
    if (choice !== undefined && body !== null && body !== undefined)
      entries.push({
        id: deps.uuid(),
        category,
        mode: choice.mode,
        name: choice.name,
        body,
        slots: [...detectSlots(body).names],
        updatedAt: revision.createdAt,
      });
  }
  const attachment = (name: string) => ({ attachmentId: deps.uuid(), name });
  const provided = {
    research: config.sources.research === "provide" ? (config.provided.research ?? "") : "",
    article:
      config.sources.article === "provide"
        ? (revision.content.articleMarkdown ?? config.provided.article ?? "")
        : "",
    audio: config.sources.audio === "provide" ? attachment("Audio from project") : null,
    thumbnail: config.sources.thumbnail === "provide" ? attachment("Thumbnail from project") : null,
    ...(config.reference?.source === "provide"
      ? { reference: attachment("Establishing image from project") }
      : {}),
    images:
      config.sources.images === "provide"
        ? (definitions.length ? definitions : (config.provided.images ?? [])).map((_, index) =>
            attachment(`Image ${index + 1}`),
          )
        : [],
    // Named like the project's other files, to be attached again on Play.
    ...(config.shorts?.enabled === true && revision.content.shortsMusic !== undefined
      ? { shortsMusic: attachment("Music from project") }
      : {}),
    ...(config.ambientBed?.source === "upload" && revision.content.ambientBed !== undefined
      ? { ambientBed: attachment("Ambient sound from project") }
      : {}),
  };
  return {
    schemaVersion: 1,
    librarySnapshot: { prompts, entries },
    form: {
      title: config.title,
      format: config.format,
      sources: config.sources,
      // A project from before theme settings was drawn with DiceMaster; the template says so
      // outright, as a draft without a theme would now mean Plain.
      ...(config.document === undefined
        ? sourceOf(config.sources, "document") === "generate"
          ? { document: { theme: documentThemeOf(undefined) } }
          : {}
        : { document: config.document }),
      checkpoints: listCheckpoints(deps.db, revision.projectId, revision.id).map(
        (gate) => gate.stage,
      ),
      llm: config.llm ?? { provider: "", model: "" },
      audio: config.audio ?? { provider: "", model: "", voice: "" },
      images: config.images ?? { provider: "", model: "" },
      ...(config.reference === undefined
        ? {}
        : {
            reference: {
              source: config.reference.source,
              prompt: config.reference.prompt ?? "",
              thumbnail: config.reference.thumbnail !== false,
            },
          }),
      articlePrompt: config.articlePrompt ?? "",
      ...(config.thumbnailCount === 3 ? { thumbnailCount: 3 as const } : {}),
      ...(config.narrationPrompt === undefined ? {} : { narrationPrompt: config.narrationPrompt }),
      ...(config.youtubeDescription === true ? { youtubeDescription: true } : {}),
      ...(config.language === undefined ? {} : { language: config.language }),
      ...(config.descriptionPrompt === undefined
        ? {}
        : { descriptionPrompt: config.descriptionPrompt }),
      ...(config.shorts === undefined
        ? {}
        : {
            shorts: {
              enabled: config.shorts.enabled,
              count: String(config.shorts.count),
              minSeconds: String(config.shorts.minSeconds),
              maxSeconds: String(config.shorts.maxSeconds),
              prompt: config.shorts.prompt ?? "",
              imagePrompt: config.shorts.imagePrompt ?? "",
              ...shortsExtrasForm(config.shorts),
            },
          }),
      // A project without edit settings makes a template without them, so a video made from
      // it cuts every N seconds like the project did.
      ...(config.videoEdit === undefined ? {} : { videoEdit: config.videoEdit }),
      ...(config.reviews === undefined ? {} : { reviews: reviewSettingsForm(config.reviews) }),
      ...(config.voices === undefined ? {} : { voices: config.voices }),
      ...(config.ambientBed === undefined
        ? {}
        : { ambientBed: ambientBedFormOf(config.ambientBed) }),
      // Level the volume at the project's targets while it is on; off leaves it to Settings'
      // default, which is how a template made before the setting starts a run.
      ...(config.loudness === undefined
        ? {}
        : {
            loudness: {
              enabled: true,
              videoLufs: config.loudness.videoLufs,
              audioFilesLufs: config.loudness.audioFilesLufs,
            },
          }),
      imagePrompts,
      ...(config.imageScale === undefined ? {} : { imageScale: imageScaleForm(config.imageScale) }),
      thumbnailPrompt: config.thumbnailPrompt ?? "",
      intro: config.intro?.name ?? "",
      outro: config.outro?.name ?? "",
      chunking: {
        mode: config.chunking?.mode ?? "whole",
        words: config.chunking?.words === undefined ? "500" : String(config.chunking.words),
        characters:
          config.chunking?.characters === undefined ? "3000" : String(config.chunking.characters),
      },
      subtitles: {
        mode: config.subtitles?.mode ?? "off",
        language: "en",
        fontId: config.subtitles?.fontId ?? "default",
        fontSize:
          config.subtitles?.fontSize === undefined ? "48" : String(config.subtitles.fontSize),
        position: config.subtitles?.position ?? "bottom",
      },
      imageSeconds: String(config.imageSeconds),
      edgeSilenceSeconds: String(config.edgeSilenceSeconds),
      zoomPercent: String(config.zoomPercent),
      motionStyle: config.motionStyle,
      values: config.values,
      provided,
    },
    section: "content",
    variants: [],
    // The length a project that scales its images planned for, so the template plans the same.
    expectedWords: String(config.imageScale?.words ?? 1500),
    previewText: "Every story begins with a word.",
    fontUpload: null,
  };
}
