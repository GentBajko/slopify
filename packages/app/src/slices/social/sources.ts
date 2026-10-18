import { readFileSync, statSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import type { Paths } from "../../kernel/paths.js";
import type { RunConfig } from "../admission/model.js";
import { projectById } from "../admission/repo.js";
import { projectChannelId } from "../channels/repo.js";
import { listDesigns } from "../designs/repo.js";
import { digestKey } from "../rebuild/recipe-digest.js";
import { isClipPath } from "../rebuild/runtime-export-edit.js";
import { piecesForRevision } from "../revisions/manifest-repo.js";
import { currentRevisionId } from "../revisions/repo.js";
import { assetOf } from "../storage/asset-name.js";
import { contentTypeOf, downloadName, slugOf } from "../storage/downloads.js";
import { outputPath } from "../storage/layout.js";
import type { Output } from "../storage/model.js";
import { outputsOf } from "../storage/repo.js";
import type { UploadPack } from "../studio/model.js";
import { uploadPack } from "../studio/pack.js";
import { videoOf } from "../studio/videos.js";
import { type ChannelSocial, channelSocial } from "./channel.js";
import type { MediaSources, SourceFile } from "./media.js";
import type { SocialPlatform } from "./model.js";
import { stripChapters } from "./text.js";

export interface SourceDeps {
  readonly db: DatabaseSync;
  readonly paths: Paths;
}

// Everything a project's posts are made from, read once per pack.
export interface PostSources {
  readonly projectId: string;
  readonly title: string;
  readonly config: RunConfig;
  readonly youtube: UploadPack;
  readonly media: MediaSources;
  // The YouTube description without its chapters and hashtags.
  readonly description: string;
  // The keyword digest's summary when the run wrote one, else the description's first paragraph.
  readonly summary: string;
  // What each site's post prompt wrote (`runtime-social.ts`), by site.
  readonly written: Readonly<Partial<Record<SocialPlatform, string>>>;
  readonly tags: readonly string[];
  readonly shortHashtags: readonly string[];
  readonly youtubeLink: string | null;
  readonly channel: ChannelSocial;
}

export function postSources(deps: SourceDeps, projectId: string): PostSources | undefined {
  const project = projectById(deps.db, projectId);
  const pack = uploadPack(deps, projectId);
  if (project === undefined || !pack.ok) return undefined;
  const outputs = outputsOf(deps.db, projectId).filter((output) => onDisk(deps, projectId, output));
  const slug = slugOf(project.title);
  const source = (output: Output): SourceFile => ({
    asset: assetOf(output),
    filename: downloadName(slug, output),
    contentType: contentTypeOf(output.path),
    bytes: output.bytes,
  });
  const seconds = (output: Output) =>
    output.durationMs === null ? null : output.durationMs / 1000;
  const video = outputs.find((output) => output.role === "video");
  const long = pack.pack.items[0];
  const shorts = pack.pack.items.filter((item) => item.kind === "short");
  const shortVideo = (asset: string | undefined) =>
    outputs.find((output) => output.role === "short_video" && assetOf(output) === asset);
  const thumbnail = long?.thumbnails[0];
  const thumbnailOutput = outputs.find(
    (output) => output.role === "thumbnail" && assetOf(output) === thumbnail?.asset,
  );
  const pictures = outputs
    .filter((output) => output.role === "image" && !isClipPath(output.path))
    .sort((a, b) => (a.meta.index ?? 0) - (b.meta.index ?? 0))
    .map((output) => {
      const alt = altOf(output.meta.prompt);
      return { ...source(output), ...(alt === undefined ? {} : { alt }) };
    });
  const description = stripChapters(long?.description ?? "");
  const written: Partial<Record<SocialPlatform, string>> = {};
  for (const output of outputs)
    if (output.role === "social_post" && output.meta.platform !== undefined)
      written[output.meta.platform] = readFileSync(
        outputPath(deps.paths, projectId, output.path),
        "utf8",
      ).trim();
  const longOnYoutube = videoOf(deps.db, projectId, null);
  return {
    projectId,
    title: project.title,
    config: project.config,
    youtube: pack.pack,
    media: {
      projectId,
      format: project.config.format,
      long: video === undefined ? null : { ...source(video), seconds: seconds(video) },
      shorts: shorts.map((item) => {
        const output = shortVideo(item.video?.asset);
        return {
          number: item.short ?? 0,
          file: output === undefined ? null : { ...source(output), seconds: seconds(output) },
        };
      }),
      thumbnail: thumbnailOutput === undefined ? null : source(thumbnailOutput),
      pictures,
      designs: listDesigns(deps.db, { projectId }).map((design) => ({
        id: design.id,
        name: design.name,
      })),
    },
    description,
    summary: digestSummary(deps.db, projectId) ?? firstParagraph(description),
    written,
    tags: long?.tags ?? [],
    shortHashtags: shorts.flatMap((item) => item.tags),
    youtubeLink:
      longOnYoutube?.uploadState === "done" ? `https://youtu.be/${longOnYoutube.videoId}` : null,
    channel: channelSocial(deps.db, projectChannelId(deps.db, projectId)),
  };
}

function onDisk(deps: SourceDeps, projectId: string, output: Output): boolean {
  return (
    statSync(outputPath(deps.paths, projectId, output.path), {
      throwIfNoEntry: false,
    })?.isFile() === true
  );
}

// A picture's alt text: the first sentence of the prompt that drew it, kept short.
function altOf(prompt: string | undefined): string | undefined {
  const text = prompt?.replace(/\s+/gu, " ").trim() ?? "";
  if (text === "") return undefined;
  const sentence = /^.*?[.!?](?=\s|$)/u.exec(text)?.[0] ?? text;
  return sentence.length <= 300 ? sentence : `${sentence.slice(0, 299)}…`;
}

function firstParagraph(text: string): string {
  return text.split(/\n\s*\n/u)[0]?.trim() ?? "";
}

// The summary the current version's keyword digest wrote, when it ran.
function digestSummary(db: DatabaseSync, projectId: string): string | undefined {
  const revision = currentRevisionId(db, projectId);
  if (revision === undefined) return undefined;
  const piece = piecesForRevision(db, projectId, revision).find(
    (row) => row.key === digestKey && row.selected && row.piece.state === "done",
  );
  if (piece?.piece.payload == null) return undefined;
  try {
    const payload = JSON.parse(piece.piece.payload) as { digest?: Record<string, unknown> };
    const summary = payload.digest?.Slopify_Summary;
    return typeof summary === "string" && summary.trim() !== "" ? summary.trim() : undefined;
  } catch {
    return undefined;
  }
}
