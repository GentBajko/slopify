import { z } from "zod";
import { transact } from "../../kernel/db/tx.js";
import { projectById } from "../admission/repo.js";
import { detectSlots } from "../admission/substitute.js";
import { listCheckpoints } from "../checkpoints/repo.js";
import type { PromptKind } from "../library/model.js";
import type { LibrarySnapshot } from "../library/snapshot.js";
import type { PlayDraftDocument } from "../play-drafts/model.js";
import { requestHash } from "../play-drafts/repo.js";
import type { ProjectRevision } from "../revisions/model.js";
import { currentRevisionId, revisionById } from "../revisions/repo.js";
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
      document: documentFromProject(deps, revision),
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
  addPrompt("article", config.articlePrompt, "article");
  addPrompt("narration", config.narrationPrompt, "narration");
  addPrompt("description", config.descriptionPrompt, "description");
  const definitions = revision.content.imageOrder.flatMap((key) => {
    const definition = revision.content.imageDefinitions[key];
    return definition === undefined ? [] : [definition];
  });
  const imagePrompts =
    config.sources.images === "generate" && definitions.length > 0
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
    images:
      config.sources.images === "provide"
        ? (definitions.length ? definitions : (config.provided.images ?? [])).map((_, index) =>
            attachment(`Image ${index + 1}`),
          )
        : [],
  };
  return {
    schemaVersion: 1,
    librarySnapshot: { prompts, entries },
    form: {
      title: config.title,
      format: config.format,
      sources: config.sources,
      ...(config.document === undefined ? {} : { document: config.document }),
      checkpoints: listCheckpoints(deps.db, revision.projectId, revision.id).map(
        (gate) => gate.stage,
      ),
      llm: config.llm ?? { provider: "", model: "" },
      audio: config.audio ?? { provider: "", model: "", voice: "" },
      images: config.images ?? { provider: "", model: "" },
      articlePrompt: config.articlePrompt ?? "",
      ...(config.narrationPrompt === undefined ? {} : { narrationPrompt: config.narrationPrompt }),
      ...(config.youtubeDescription === true ? { youtubeDescription: true } : {}),
      ...(config.descriptionPrompt === undefined
        ? {}
        : { descriptionPrompt: config.descriptionPrompt }),
      imagePrompts,
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
    expectedWords: "1500",
    previewText: "Every story begins with a word.",
    fontUpload: null,
  };
}
