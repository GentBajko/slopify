import { extname, isAbsolute, relative, resolve } from "node:path";
import type { Paths } from "../../kernel/paths.js";
import type { OutputRole, StageKind } from "./model.js";

export function projectDir(paths: Paths, projectId: string): string {
  return contained(paths.projects, projectId);
}

// The clips of each project's last render (`slices/video/clip-cache.ts`). Hidden, so
// reconcile, backups and the user's file browser leave it alone; disposable, so moving the
// files leaves it behind and a render simply encodes its clips again.
export const renderCacheFolder = ".render-cache";

export function renderCacheDir(paths: Paths, projectId: string): string {
  return contained(paths.projects, `${renderCacheFolder}/${projectId}`);
}

export function outputPath(paths: Paths, projectId: string, relativePath: string): string {
  return contained(projectDir(paths, projectId), relativePath);
}

// Scheduled backups (slices/backups) land in paths.backups unless the user picks another
// folder. Installs from before 3.0 keep it inside the projects root, since that is the one
// folder an older Docker install shares with the host; newer ones have it beside Projects.
// Project folders are ULIDs, so the name never collides with one; reconcile leaves it alone.
export const backupsFolderName = "Backups";

export function defaultBackupsDir(paths: Pick<Paths, "backups">): string {
  return paths.backups;
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
    throw new Error(
      `Slopify hit an internal error (the saved file path ${path} resolves outside ${root}). Try again; if it happens again, use Download diagnostics in Settings and report it.`,
    );
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
    case "narration_txt":
      return "narration.txt";
    case "tts_script":
      return "tts-script.txt";
    case "sources":
      return "sources.txt";
    case "glossary":
      return "glossary.txt";
    case "subtitles_srt":
      return "subtitles.srt";
    case "subtitles_vtt":
      return "subtitles.vtt";
    case "subtitle_words":
      return "subtitles.json";
    case "subtitle_ass":
      return "subtitles.ass";
    case "subtitle_font":
      return `subtitle-font${extension}`;
    case "render_params":
      return "render.json";
    case "instructions":
      return `instructions-${stageKind}.txt`;
    case "video":
      return "video.mp4";
    case "document_pdf":
      return "document.pdf";
    case "youtube_description":
      return "description.txt";
    case "youtube_tags":
      return "tags.txt";
    case "youtube_pinned_comment":
      return "pinned-comment.txt";
    case "youtube_titles":
      return "titles.txt";
    case "shorts":
      return "shorts.json";
    case "short_image":
      return `shorts/image-${String(index).padStart(3, "0")}${extension}`;
    case "short_video":
      return `shorts/short-${String(index).padStart(2, "0")}${extension}`;
    case "animated_image":
      return `animated/image-${String(index).padStart(3, "0")}${extension}`;
    case "figure_card":
      return `cards/card-${String(index).padStart(3, "0")}${extension}`;
    case "audio_body":
      return `audio-body${extension}`;
    case "audio_export":
      return "audio.wav";
    case "audio_intro":
      return `audio-intro${extension}`;
    case "audio_outro":
      return `audio-outro${extension}`;
    case "thumbnail":
      return `thumbnail${extension}`;
    case "script_md":
      return "script.md";
    case "audio_mp3":
      return "narration.mp3";
    case "audio_m4b":
      return "audiobook.m4b";
    case "audio_levelled":
      return `audio-levelled${extension}`;
    case "reference":
      return `reference${extension}`;
    case "image":
      return `images/${String(index).padStart(3, "0")}${extension}`;
  }
}

export function extensionOf(filename: string): string {
  const extension = extname(filename).toLowerCase();
  return /^\.[a-z0-9]{1,8}$/.test(extension) ? extension : "";
}
