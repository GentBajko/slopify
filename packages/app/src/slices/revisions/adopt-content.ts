import { readFileSync, statSync } from "node:fs";
import { z } from "zod";
import type { StagePiece } from "../../kernel/runner/piece-repo.js";
import type { Project } from "../admission/model.js";
import { legacyImageOutput } from "../rebuild/recipe-legacy.js";
import { outputPath } from "../storage/layout.js";
import type { Output } from "../storage/model.js";
import { pieceFile } from "../storage/reconcile.js";
import type { ProjectAsset, RevisionContent, RevisionDeps } from "./model.js";

const imagePayload = z.object({
  prompt: z.string().optional(),
  promptIndex: z.number().int().positive().optional(),
});
export function baselineContent(
  deps: RevisionDeps,
  project: Project,
  outputs: readonly Output[],
  pieces: readonly StagePiece[],
  assets: ReadonlyMap<string, ProjectAsset>,
): RevisionContent {
  const article = outputs.find((row) => row.role === "article_md");
  const articlePath =
    article === undefined ? undefined : outputPath(deps.paths, project.id, article.path);
  const articleMarkdown =
    articlePath !== undefined && statSync(articlePath, { throwIfNoEntry: false })?.isFile() === true
      ? readFileSync(articlePath, "utf8")
      : undefined;
  const provided: Partial<Record<"research" | "article" | "audio" | "thumbnail", string>> = {};
  const roles = {
    research: "notes",
    article: "article_md",
    audio: "audio_body",
    thumbnail: "thumbnail",
  } as const;
  for (const [stage, role] of Object.entries(roles)) {
    if (stage !== "research" && stage !== "article" && stage !== "audio" && stage !== "thumbnail")
      continue;
    if (project.config.sources[stage] !== "provide") continue;
    const output = outputs.find((row) => row.role === role);
    const asset = output === undefined ? undefined : assets.get(output.path);
    if (asset !== undefined) provided[stage] = asset.id;
  }
  const imageDefinitions: Record<string, RevisionContent["imageDefinitions"][string]> = {};
  const order: { key: string; index: number }[] = [];
  const imagePieces = pieces.filter((row) => row.kind === "image");
  const images = outputs.filter((row) => row.role === "image");
  for (const output of images) {
    const piece = imagePieces.find((row) => legacyImageOutput(row, images)?.id === output.id);
    const payload = parsedImage(piece?.payload ?? null);
    const supplied =
      project.config.sources.images === "provide" ||
      (project.config.sources.images === "off" &&
        piece === undefined &&
        output.originalFilename !== null &&
        output.meta.provider === undefined &&
        output.meta.prompt === undefined);
    imageDefinitions[output.id] = {
      source: supplied ? "provide" : "generate",
      assetId: assets.get(output.path)?.id ?? null,
      prompt: supplied ? null : (payload?.prompt ?? output.meta.prompt ?? null),
      templateKey: supplied ? null : templateKey(payload?.promptIndex),
    };
    order.push({ key: output.id, index: output.meta.index ?? 0 });
  }
  for (const piece of imagePieces) {
    if (legacyImageOutput(piece, images) !== undefined) continue;
    const payload = parsedImage(piece.payload);
    const path = pieceFile(piece.payload);
    imageDefinitions[piece.id] = {
      source: "generate",
      assetId: path === undefined ? null : (assets.get(path)?.id ?? null),
      prompt: payload?.prompt ?? null,
      templateKey: templateKey(payload?.promptIndex),
    };
    order.push({ key: piece.id, index: piece.idx });
  }
  if (
    project.config.sources.images === "generate" &&
    images.length === 0 &&
    imagePieces.length === 0
  ) {
    for (const [index, prompt] of project.config.imagePrompts.entries()) {
      const key = `imagePrompts.${index}`;
      for (let send = 0; send < prompt.number; send += 1) {
        const id = deps.ids.next();
        imageDefinitions[id] = {
          source: "generate",
          assetId: null,
          prompt: project.config.rendered[key] ?? null,
          templateKey: key,
        };
        order.push({ key: id, index: order.length });
      }
    }
  }
  return {
    ...(articleMarkdown === undefined ? {} : { articleMarkdown }),
    articleEdited: false,
    provided,
    imageOrder: order.sort((a, b) => a.index - b.index).map((row) => row.key),
    imageDefinitions,
    narrationOverrides: {},
    regenerationTokens: {},
    promptTemplates: Object.fromEntries(
      Object.keys(project.config.rendered).map((key) => [key, null]),
    ),
  };
}
function parsedImage(payload: string | null): z.infer<typeof imagePayload> | undefined {
  if (payload === null) return undefined;
  let value: unknown;
  try {
    value = JSON.parse(payload);
  } catch (error) {
    if (error instanceof SyntaxError) return undefined;
    throw error;
  }
  const result = imagePayload.safeParse(value);
  return result.success ? result.data : undefined;
}
function templateKey(index: number | undefined): string | null {
  return index === undefined ? null : `imagePrompts.${index - 1}`;
}
