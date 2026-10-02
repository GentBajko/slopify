import { readFileSync, statSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import type { Paths } from "../../kernel/paths.js";
import { thumbnailCountOf } from "../admission/model.js";
import { projectById } from "../admission/repo.js";
import { channelById, projectChannelId } from "../channels/repo.js";
import { namesPhotorealisticPrompt } from "../library/photorealistic.js";
import { isClipPath } from "../rebuild/runtime-export-edit.js";
import { listVoices } from "../settings/repo.js";
import { realPersonVoiceIds } from "../settings/voices.js";
import { fullVideoLine } from "../shorts/model.js";
import { assetOf } from "../storage/asset-name.js";
import { contentTypeOf, downloadName, slugOf } from "../storage/downloads.js";
import { outputPath } from "../storage/layout.js";
import type { Output } from "../storage/model.js";
import { outputsOf } from "../storage/repo.js";
import { videoEditOf } from "../video/edit-settings.js";
import { usesVoices } from "../voices/model.js";
import { effectiveDescription } from "../youtube/edits-repo.js";
import { aiDisclosureOf } from "./disclosure.js";
import {
  type PackFile,
  type PackItem,
  studioAudience,
  studioTitleMax,
  type UploadPack,
} from "./model.js";
import { picked, readUploadPick } from "./pick.js";
import { projectPlaylists, readRealFootage } from "./settings.js";
import { videoOf } from "./videos.js";

export interface PackDeps {
  readonly db: DatabaseSync;
  readonly paths: Paths;
}

export type PackResult =
  | { readonly ok: true; readonly pack: UploadPack }
  | { readonly ok: false; readonly reason: "unknown-project" };

// What `shorts.json` holds for each picked clip; only what the pack uses.
const clipsSchema = z.object({
  shorts: z.array(
    z.object({
      number: z.number(),
      first: z.number().optional(),
      last: z.number().optional(),
      title: z.string(),
      description: z.string(),
      hashtags: z.array(z.string()),
    }),
  ),
});

// Builds the pack from the project's current outputs: the video, the YouTube description and
// tags, the thumbnails and each short. Nothing is generated here; a part that isn't made yet
// is left empty and named in `missing` with what to do about it.
export function uploadPack(deps: PackDeps, projectId: string): PackResult {
  const project = projectById(deps.db, projectId);
  if (project === undefined) return { ok: false, reason: "unknown-project" };
  const config = project.config;
  const outputs = outputsOf(deps.db, projectId).filter((output) =>
    available(deps, projectId, output),
  );
  const slug = slugOf(project.title);
  const file = (output: Output): PackFile => ({
    url: `/files/${projectId}/${assetOf(output)}`,
    asset: assetOf(output),
    filename: downloadName(slug, output),
    contentType: contentTypeOf(output.path),
    bytes: output.bytes,
  });
  const text = (output: Output | undefined): string | undefined =>
    output === undefined
      ? undefined
      : readFileSync(outputPath(deps.paths, projectId, output.path), "utf8").trim();
  const channelId = projectChannelId(deps.db, projectId);
  // The channel's playlists (Settings → YouTube Studio), ticked as this project chose.
  const playlistChoices = projectPlaylists(deps.db, projectId, channelId);
  const playlists = playlistChoices.filter((one) => one.chosen).map((one) => one.name);
  const playlist = playlists[0] ?? null;
  const missing: string[] = [];
  // The channel's setting, then what the project narrates and shows (`disclosure.ts`).
  const setting = channelById(deps.db, channelId)?.aiDisclosure ?? "auto";
  const realPersonVoices = realPersonVoicesOf(deps, config);
  const uploadedClips =
    config.sources.images === "provide"
      ? outputs.filter((output) => output.role === "image" && isClipPath(output.path)).length
      : 0;
  const realFootage = uploadedClips > 0 && readRealFootage(deps.db, projectId);
  const atmosphere = videoEditOf(config).atmosphere;
  const disclosure = (kind: "video" | "short") =>
    aiDisclosureOf({
      setting,
      kind,
      realPersonVoices,
      // A short's pictures are always drawn anew, never the uploaded clips.
      realFootage: kind === "video" && realFootage,
      footageOverlay: atmosphere === "none" ? undefined : atmosphere,
      photorealistic:
        kind === "short"
          ? namesPhotorealisticPrompt(deps.db, config.shorts?.imagePrompt)
          : config.sources.images === "generate" &&
            config.imagePrompts.some((prompt) => namesPhotorealisticPrompt(deps.db, prompt.name)),
    });

  const video = outputs.find((output) => output.role === "video");
  if (video === undefined)
    missing.push(
      "The video isn't made yet. Let the Video stage finish (or use Continue the run on the project page), then open Prepare upload again.",
    );
  const written = text(outputs.find((output) => output.role === "youtube_description"));
  const writtenTags = text(outputs.find((output) => output.role === "youtube_tags"));
  // As the project page shows it: the user's edits, and channel links filled in.
  const edited =
    written === undefined
      ? undefined
      : effectiveDescription(deps.db, projectId, {
          description: written,
          tags: writtenTags ?? "",
          titles: text(outputs.find((output) => output.role === "youtube_titles")),
          // The last chapter is checked against the video's own length when it is known.
          durationSeconds:
            video?.durationMs === null || video?.durationMs === undefined
              ? undefined
              : video.durationMs / 1000,
        });
  const tagsFile = edited?.tags ?? writtenTags;
  const description = edited?.description;
  if (description === undefined)
    missing.push(
      config.youtubeDescription === true
        ? "The YouTube description isn't written yet. It is written after the video's subtitle timing; wait for the Video stage to finish."
        : "No YouTube description is written for this project. Turn on YouTube description in Edit project → Prompts to have one written with chapters and tags.",
    );
  const count = thumbnailCountOf(config);
  // The first thumbnail, then the second and third, and never one left from when the project
  // made three and now makes one.
  const thumbnails = outputs
    .filter((output) => output.role === "thumbnail" && (output.meta.index ?? 1) <= count)
    .sort((a, b) => (a.meta.index ?? 1) - (b.meta.index ?? 1));
  if (thumbnails.length === 0)
    missing.push(
      config.sources.thumbnail === "off"
        ? "This project makes no thumbnail, so YouTube will pick a frame. Set Thumbnail in Edit project to make or upload one."
        : "The thumbnail isn't made yet. Let the Thumbnail stage finish, then open Prepare upload again.",
    );
  else if (thumbnails.length < count)
    missing.push(
      `Only ${String(thumbnails.length)} of the ${String(count)} thumbnails are made. Regenerate the missing ones in the project's Images section.`,
    );
  if (playlistChoices.length === 0)
    missing.push(
      "No playlist is set for this project's channel, so the playlist step is left to you. Set one in Settings → YouTube Studio → Playlists.",
    );

  // The video's titles and thumbnails in the project's order, and the ones the person picked
  // for the upload first (`pick.ts`); the A/B test later tries the rest beside them.
  const ownTitle = project.title.slice(0, studioTitleMax);
  const allTitles = [
    ownTitle,
    ...(edited?.titles ?? "")
      .split("\n")
      .map((one) => one.trim().slice(0, studioTitleMax))
      .filter((one) => one !== ""),
  ];
  const allThumbnails = thumbnails.map(file);
  const pick = readUploadPick(deps.db, projectId);
  const arranged = picked(allTitles, allThumbnails, pick);
  const items: PackItem[] = [
    {
      kind: "video",
      video: video === undefined ? null : file(video),
      title: arranged.titles[0] ?? ownTitle,
      titles: arranged.titles.slice(1),
      description: description ?? "",
      tags: tagsOf(tagsFile),
      thumbnails: arranged.thumbnails,
      pickable: {
        titles: allTitles,
        thumbnails: allThumbnails,
        title: pick.title < allTitles.length ? pick.title : 0,
        thumbnail: pick.thumbnail < allThumbnails.length ? pick.thumbnail : 0,
      },
      audience: studioAudience,
      alteredContent: disclosure("video"),
      playlists,
      playlist,
      ...(edited?.chapterNotice === undefined ? {} : { chapterNotice: edited.chapterNotice }),
    },
  ];

  // The shorts link the long video: the link set in the project, else the one Slopify knows
  // the video by on YouTube (`videos.ts`).
  const longVideo = videoOf(deps.db, projectId, null);
  const fullVideoLink =
    config.shorts?.fullVideoLink ??
    (longVideo?.uploadState === "done" ? `https://youtu.be/${longVideo.videoId}` : undefined);
  const clips = clipsOf(text(outputs.find((output) => output.role === "shorts")));
  const shortVideos = outputs.filter((output) => output.role === "short_video");
  for (const clip of clips) {
    // The clip's own render: the one cut from the same sentences, else the newest for its
    // number (a list written before the sentences were kept).
    const mine = shortVideos.filter((output) => output.meta.short === clip.number);
    const exact = mine.find(
      (output) =>
        clip.first !== undefined &&
        output.meta.sentences?.[0] === clip.first &&
        output.meta.sentences?.[1] === clip.last,
    );
    const render = exact ?? mine.at(-1);
    if (render === undefined)
      missing.push(
        `Short ${String(clip.number)} isn't rendered yet. Let the Video stage finish, then open Prepare upload again.`,
      );
    items.push({
      kind: "short",
      short: clip.number,
      video: render === undefined ? null : file(render),
      title: clip.title.slice(0, studioTitleMax),
      titles: [],
      description: [
        clip.description,
        fullVideoLine(fullVideoLink),
        "",
        clip.hashtags.join(" "),
      ].join("\n"),
      // The hashtags without their #, as search tags.
      tags: clip.hashtags.map((tag) => tag.replace(/^#+/, "").trim()).filter((tag) => tag !== ""),
      // Studio shows a frame of a short; a custom thumbnail isn't offered in its upload dialog.
      thumbnails: [],
      audience: studioAudience,
      alteredContent: disclosure("short"),
      playlists,
      playlist,
    });
  }
  return {
    ok: true,
    pack: {
      projectId,
      projectTitle: project.title,
      items,
      missing,
      playlistChoices,
      ...(uploadedClips > 0 ? { footage: { clips: uploadedClips, real: realFootage } } : {}),
    },
  };
}

// The saved voices marked "Imitates a real person" that narrate the project: its one narration
// voice, or every speaker's of a multi-voice run. None when the narration isn't an AI voice.
function realPersonVoicesOf(
  deps: PackDeps,
  config: NonNullable<ReturnType<typeof projectById>>["config"],
): readonly string[] {
  if (config.sources.audio !== "generate") return [];
  const narrating = usesVoices(config)
    ? (config.voices?.speakers ?? []).map((speaker) => speaker.voice)
    : config.audio === undefined
      ? []
      : [config.audio];
  const flagged = realPersonVoiceIds(deps.db);
  const names = listVoices(deps.db)
    .filter(
      (voice) =>
        flagged.has(voice.id) &&
        narrating.some((one) => one.provider === voice.provider && one.voice === voice.voiceId),
    )
    .map((voice) => voice.name);
  return [...new Set(names)];
}

// The item the person chose: the long video, or short `short`.
export function packItem(pack: UploadPack, short: number | undefined): PackItem | undefined {
  return pack.items.find((item) =>
    short === undefined ? item.kind === "video" : item.kind === "short" && item.short === short,
  );
}

function tagsOf(line: string | undefined): readonly string[] {
  return (line ?? "")
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => tag !== "");
}

function clipsOf(text: string | undefined): z.infer<typeof clipsSchema>["shorts"] {
  if (text === undefined) return [];
  try {
    const parsed = clipsSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data.shorts : [];
  } catch {
    return [];
  }
}

function available(deps: PackDeps, projectId: string, output: Output): boolean {
  return (
    statSync(outputPath(deps.paths, projectId, output.path), {
      throwIfNoEntry: false,
    })?.isFile() === true
  );
}
