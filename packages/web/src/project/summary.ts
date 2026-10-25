import type { StageKind } from "@app/kernel/pipeline.js";
import type { ProjectSummary, RunConfig, Stage } from "@app/slices/admission/model.js";
import {
  keptAsIsWord,
  parkedOnAgent,
  waitingForAgentWord,
} from "@app/slices/admission/state-words.js";
import { documentThemeLabel } from "@app/slices/document/model.js";
import type { Output } from "@app/slices/storage/model.js";
import { stageWords } from "@/lib/stage-words";

// The one-line summary in the middle of a rundown row: "7 chapters researched · 41
// sources" in the design chapter's words, built here from what the project actually holds
// rather than from anything invented. Pure, so every branch of it is tested without a
// render.

export function finalOutput(config: RunConfig): "video" | "audio" | "article" {
  return config.sources.video !== "off"
    ? "video"
    : config.sources.audio !== "off"
      ? "audio"
      : "article";
}

// A stage's name on this project: a Video stage that only exports the narration is its Audio
// export, and an audiobook's or a podcast's is the book or the episode it makes; every other
// stage keeps its one name (lib/stage-words.ts).
export function stageName(kind: StageKind, config: RunConfig): string {
  if (kind !== "video") return stageWords[kind];
  if (finalOutput(config) === "audio") return "Audio export";
  const format = config.voices?.format;
  return format === undefined ? stageWords[kind] : listeningNames[format];
}

const listeningNames: Readonly<Record<NonNullable<RunConfig["voices"]>["format"], string>> = {
  audiobook: "Audiobook",
  drama: "Radio drama",
  podcast: "Episode",
  interview: "Episode",
};

export function preparingSubtitles(stage: Stage, config: RunConfig): boolean {
  return (
    stage.kind === "video" &&
    stage.state === "running" &&
    config.subtitles !== undefined &&
    config.subtitles.mode !== "off" &&
    stage.progressTotal === 100 &&
    (stage.progressCurrent ?? 0) <= 35
  );
}

// What each stage's progress counts: chapters, chunks, images, and a
// render percentage. The word the meter is measured in belongs beside the meter.
const running: Readonly<Record<StageKind, (current: number, total: number) => string>> = {
  research: (current, total) => `chapter ${String(current)} of ${String(total)}`,
  article: (current, total) => `${String(current)} of ${String(total)}`,
  audio: (current, total) => `chunk ${String(current)} of ${String(total)}`,
  images: (current, total) => `image ${String(current)} of ${String(total)}`,
  thumbnail: (current, total) => `${String(current)} of ${String(total)}`,
  video: (current, total) => `${String(percent(current, total))}% rendered`,
  document: (current, total) => `${String(current)} of ${String(total)}`,
};

const segments: Readonly<Record<string, string>> = {
  audio_intro: "intro",
  audio_outro: "outro",
};

// `resumable` is the project body's own word: nothing is running and the work left is held
// until Resume, as it is after a restart. Those stages wait on the button, not on the stages
// above them, unless the run is Kept as is: then nothing offers the button.
export function summaryOf(
  stage: Stage,
  outputs: readonly Output[],
  project: ProjectSummary,
  resumable = false,
): string {
  const mine = outputs.filter((output) => output.stageKind === stage.kind);
  switch (stage.state) {
    case "skipped":
      return "Not part of this run";
    case "pending":
      if (project.status === "paused") return "Waits until you continue the run";
      if (project.status === "pending" && project.setAside === true) return keptAsIsWord;
      if (resumable) return "Waits until you continue the run";
      if (parkedOnAgent(project)) return waitingForAgentWord;
      if (stage.retryAt !== undefined) return `Trying again at ${clockTime(stage.retryAt)}`;
      if (stage.kind === "images" || (stage.kind === "thumbnail" && stage.source === "from_prompt"))
        return "Ready to run";
      return "Waits for the stages above";
    case "provided":
      return filenames(mine) ?? "Supplied by you";
    case "failed":
      // The row's error line carries the provider's own words; repeating them here would
      // truncate them into the column.
      return `Stopped after ${attempts(stage)}`;
    case "canceled":
      return "Canceled by user";
    case "running":
      if (preparingSubtitles(stage, project.config))
        return `Preparing captions · ${String(percent(stage.progressCurrent ?? 0, 35))}%`;
      if (stage.activity !== undefined) return capitalised(activityText(stage) ?? "");
      if (stage.kind === "video" && finalOutput(project.config) === "audio")
        return "Exporting combined audio";
      return stage.progressTotal === null || stage.progressTotal <= 0
        ? "Running"
        : running[stage.kind](stage.progressCurrent ?? 0, stage.progressTotal);
    case "done":
      return done(stage.kind, mine, project);
  }
}

// A running stage's step in words, when the server named it (`rebuild/activity.ts`): "drawing
// the shorts' pictures (12 of 38)", "rendering the video (45%)".
export function activityText(stage: Stage): string | undefined {
  const activity = stage.activity;
  if (activity === undefined) return undefined;
  if (activity.percent !== undefined) return `${activity.label} (${String(activity.percent)}%)`;
  if (activity.done !== undefined && activity.total !== undefined)
    return `${activity.label} (${String(activity.done)} of ${String(activity.total)})`;
  return activity.label;
}

export function capitalised(text: string): string {
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

// How far a running stage is, 0 to 1, for a meter: its named step's own progress when it has
// one, else its whole count. Undefined when there is nothing to measure.
export function stageFraction(stage: Stage): number | undefined {
  const activity = stage.activity;
  if (activity?.percent !== undefined) return activity.percent / 100;
  if (activity?.done !== undefined && activity.total !== undefined && activity.total > 0)
    return activity.done / activity.total;
  if (activity !== undefined) return undefined;
  if (stage.progressTotal === null || stage.progressTotal <= 0) return undefined;
  return Math.min(1, Math.max(0, (stage.progressCurrent ?? 0) / stage.progressTotal));
}

// "14:05": when a step waiting out a rate limit or a timeout runs again by itself.
export function clockTime(at: string): string {
  return new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function attempts(stage: Stage): string {
  return stage.attemptCount === 1 ? "1 attempt" : `${String(stage.attemptCount)} attempts`;
}

function done(kind: StageKind, mine: readonly Output[], project: ProjectSummary): string {
  switch (kind) {
    case "research":
      return "Notes ready";
    // "Done" already says the article is written; only its end matter is news.
    case "article": {
      const extras = [
        ...(mine.some((output) => output.role === "sources") ? ["sources"] : []),
        ...(mine.some((output) => output.role === "glossary") ? ["glossary"] : []),
      ];
      return extras.length === 0 ? "" : `With ${extras.join(" and ")}`;
    }
    // The length, then the intro and outro when there are any; the body is the narration
    // itself, so it is never named.
    case "audio": {
      const named = mine.flatMap((output) => {
        const segment = segments[output.role];
        return segment === undefined ? [] : [segment];
      });
      return join([duration(total(mine)), withParts(named)]);
    }
    case "images":
      return count(mine.filter((output) => output.role === "image").length, "image");
    case "thumbnail":
      return mine.length === 0 ? "Thumbnail ready" : "1 image";
    case "video":
      return join([
        duration(total(mine)),
        finalOutput(project.config) === "audio" ? "WAV · stereo · 48 kHz" : project.format,
      ]);
    case "document":
      return `${documentThemeLabel(project.config.document)} theme`;
  }
}

function filenames(mine: readonly Output[]): string | undefined {
  const names = mine.flatMap((output) =>
    output.originalFilename === null ? [] : [output.originalFilename],
  );
  return names.length === 0 ? undefined : names.join(", ");
}

function total(mine: readonly Output[]): number | undefined {
  const longest = Math.max(0, ...mine.map((output) => output.durationMs ?? 0));
  return longest === 0 ? undefined : longest;
}

// mm:ss, and hh:mm:ss once a narration runs past the hour.
export function duration(ms: number | undefined): string | undefined {
  // Zero is not a length a player could seek in, so it reads as no length at all.
  if (ms === undefined || !Number.isFinite(ms) || ms <= 0) {
    return undefined;
  }
  const seconds = Math.round(ms / 1000);
  const parts = [Math.floor(seconds / 60) % 60, seconds % 60].map((part) =>
    String(part).padStart(2, "0"),
  );
  const hours = Math.floor(seconds / 3600);
  return hours === 0 ? parts.join(":") : [String(hours), ...parts].join(":");
}

export function percent(current: number, total: number): number {
  return total <= 0 ? 0 : Math.min(100, Math.max(0, Math.round((current / total) * 100)));
}

function count(many: number, noun: string): string {
  return many === 1 ? `1 ${noun}` : `${String(many)} ${noun}s`;
}

// "with intro and outro", "with intro": the narration's other parts.
function withParts(words: readonly string[]): string | undefined {
  return words.length === 0 ? undefined : `with ${words.join(" and ")}`;
}

function join(parts: readonly (string | undefined)[]): string {
  return parts.filter((part) => part !== undefined && part !== "").join(" · ");
}
