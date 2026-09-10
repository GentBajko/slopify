import { z } from "zod";
import type { StageKind } from "../../kernel/pipeline.js";
import type { StagePiece } from "../../kernel/runner/piece-repo.js";
import type { Project, RunConfig, Stage } from "../admission/model.js";
import type { RevisionContent } from "../revisions/model.js";
import type { Output } from "../storage/model.js";
import { buildRecipes } from "./recipe-build.js";

export function baselineFingerprints(
  project: Project,
  outputs: readonly Output[],
  pieces: readonly StagePiece[],
  content: RevisionContent,
  stages: readonly Pick<Stage, "id" | "kind">[] = [],
): Readonly<Record<string, string>> {
  const recipes = buildRecipes({
    config: project.config,
    content,
    manifest: { outputs: [], pieces: [] },
    resolved: {
      articleMarkdown: content.articleMarkdown ?? project.config.provided.article ?? null,
      researchNotes: project.config.provided.research ?? null,
    },
  });
  const fingerprints = Object.fromEntries(recipes.map((value) => [value.key, value.fingerprint]));
  for (const output of outputs) {
    const key = legacyOutputWorkKey(output, project.config);
    if (fingerprints[key] === undefined) fingerprints[key] = `legacy:${output.id}`;
  }
  for (const piece of pieces) {
    const key = legacyPieceKey(piece, legacyStageKind(piece, stages), outputs);
    if (fingerprints[key] === undefined) fingerprints[key] = `legacy:${piece.id}`;
  }
  return fingerprints;
}
export function legacyOutputSlot(output: Output): string {
  return output.role === "image" ? `image:${output.id}` : `${output.stageKind}:${output.role}`;
}
export function legacyOutputWorkKey(output: Output, config?: Pick<RunConfig, "sources">): string {
  switch (output.role) {
    case "image":
      return `image:${output.id}`;
    case "thumbnail":
      return "thumbnail:image";
    case "notes":
      return "research:notes";
    case "article_md":
    case "article_txt":
    case "sources":
    case "glossary":
      return "article:body";
    case "audio_body":
      return config?.sources.audio === "provide" ? "audio:provided" : "audio:body:concat";
    case "audio_intro":
      return "audio:intro";
    case "audio_outro":
      return "audio:outro";
    case "audio_export":
      return "export:wav";
    case "video":
      return "export:video";
    case "subtitles_srt":
    case "subtitles_vtt":
    case "subtitle_ass":
    case "subtitle_font":
      return "subtitles:files";
    case "subtitle_words":
      return "subtitles:timing";
    case "render_params":
    case "instructions":
      return `${output.stageKind}:${output.role}`;
  }
}
export function legacyPieceKey(
  piece: StagePiece,
  stageKind: StageKind,
  outputs: readonly Output[] = [],
): string {
  if (piece.kind === "chunk") return `audio:body:${piece.id}:1`;
  if (piece.kind === "image") return `image:${legacyImageOutput(piece, outputs)?.id ?? piece.id}`;
  if (piece.kind === "prompt_written" && stageKind === "thumbnail") return "thumbnail:prompt";
  if (piece.kind === "segment") {
    const category = piece.idx === 1 ? "intro" : "outro";
    if (stageKind === "article") return `entry:${category}:text`;
    if (stageKind === "audio") return `audio:${category}`;
  }
  return `${stageKind}:${piece.kind}:${piece.id}`;
}

function legacyStageKind(
  piece: StagePiece,
  stages: readonly Pick<Stage, "id" | "kind">[],
): StageKind {
  const stage = stages.find((row) => row.id === piece.stageId);
  if (stage !== undefined) return stage.kind;
  switch (piece.kind) {
    case "chunk":
      return "audio";
    case "chapter":
      return "research";
    case "image":
      return "images";
    case "prompt_written":
      return "thumbnail";
    case "article_written":
    case "segment":
      return "article";
  }
}
export function legacyImageOutput(
  piece: StagePiece,
  outputs: readonly Output[],
): Output | undefined {
  if (piece.kind !== "image") return undefined;
  const parsed = legacyImageMetadata.safeParse(piece.payload);
  if (!parsed.success) return undefined;
  const { file, prompt, promptName } = parsed.data;
  const matches = outputs.filter(
    (row) =>
      row.role === "image" &&
      (file !== undefined
        ? row.path === file
        : typeof prompt === "string" &&
          row.meta.index === piece.idx &&
          row.meta.prompt === prompt &&
          (typeof promptName !== "string" ||
            row.meta.promptName === undefined ||
            row.meta.promptName === promptName)),
  );
  if (matches.length > 1)
    throw new Error(`Legacy image piece ${piece.id} matches multiple outputs.`);
  return matches[0];
}

const legacyImageMetadata = z
  .string()
  .transform((value, context): unknown => {
    try {
      return JSON.parse(value) as unknown;
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
      context.addIssue({ code: "custom", message: "Invalid legacy piece JSON." });
      return z.NEVER;
    }
  })
  .pipe(
    z.object({
      file: z.string().optional(),
      prompt: z.unknown().optional(),
      promptName: z.unknown().optional(),
    }),
  );
