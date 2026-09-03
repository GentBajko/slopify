import { extname, isAbsolute, relative, resolve } from "node:path";
import type { Paths } from "../../kernel/paths.js";
import type { OutputRole, StageKind } from "./model.js";

export function projectDir(paths: Paths, projectId: string): string {
  return contained(paths.projects, projectId);
}

export function outputPath(paths: Paths, projectId: string, relativePath: string): string {
  return contained(projectDir(paths, projectId), relativePath);
}

export function stagingPath(paths: Paths, stagedFileId: string): string {
  return contained(paths.staging, stagedFileId);
}

// Every asset of a project lives under its own folder; an id or a
// stored path that resolves anywhere else is a bug in whatever produced it.
function contained(root: string, path: string): string {
  const target = resolve(root, path);
  const inside = relative(root, target);
  if (inside === "" || inside.startsWith("..") || isAbsolute(inside)) {
    throw new Error(`${path} resolves outside ${root}`);
  }
  return target;
}

// The names inside a project folder are fixed, so a provided file is stored under the name
// its role dictates and keeps only its extension. The stage is part of the name for the one
// role more than one stage produces: research and the article each store what they sent,
// and the project page offers them per stage under "Show instructions".
export function outputFileName(
  role: OutputRole,
  index: number,
  extension: string,
  stageKind: StageKind,
): string {
  switch (role) {
    case "notes":
      return "research.txt";
    case "article_md":
      return "article.md";
    case "article_txt":
      return "article.txt";
    case "sources":
      return "sources.txt";
    case "glossary":
      return "glossary.txt";
    case "render_params":
      return "render.json";
    case "instructions":
      return `instructions-${stageKind}.txt`;
    case "video":
      return "video.mp4";
    case "audio_body":
      return `audio-body${extension}`;
    case "audio_intro":
      return `audio-intro${extension}`;
    case "audio_outro":
      return `audio-outro${extension}`;
    case "thumbnail":
      return `thumbnail${extension}`;
    case "image":
      return `images/${String(index).padStart(3, "0")}${extension}`;
  }
}

export function extensionOf(filename: string): string {
  const extension = extname(filename).toLowerCase();
  return /^\.[a-z0-9]{1,8}$/.test(extension) ? extension : "";
}
