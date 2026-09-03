import type { StageKind } from "@app/kernel/pipeline.js";
import type { ProjectSummary, Stage } from "@app/slices/admission/model.js";
import type { Output } from "@app/slices/storage/model.js";

// The one-line summary in the middle of a rundown row: "7 chapters researched · 41
// sources" in the design chapter's words, built here from what the project actually holds
// rather than from anything invented. Pure, so every branch of it is tested without a
// render (uiux/screens/08-project.md, Composition).

export const stageNames: Readonly<Record<StageKind, string>> = {
  research: "Research",
  article: "Article",
  audio: "Audio",
  images: "Images",
  thumbnail: "Thumbnail",
  video: "Video",
};

// What each stage's progress counts (`logic/01` §Q6): chapters, chunks, images, and a
// render percentage. The word the meter is measured in belongs beside the meter.
const running: Readonly<Record<StageKind, (current: number, total: number) => string>> = {
  research: (current, total) => `chapter ${String(current)} of ${String(total)}`,
  article: (current, total) => `${String(current)} of ${String(total)}`,
  audio: (current, total) => `chunk ${String(current)} of ${String(total)}`,
  images: (current, total) => `image ${String(current)} of ${String(total)}`,
  thumbnail: (current, total) => `${String(current)} of ${String(total)}`,
  video: (current, total) => `${String(percent(current, total))}% rendered`,
};

const segments: Readonly<Record<string, string>> = {
  audio_intro: "intro",
  audio_body: "body",
  audio_outro: "outro",
};

export function summaryOf(
  stage: Stage,
  outputs: readonly Output[],
  project: ProjectSummary,
): string {
  const mine = outputs.filter((output) => output.stageKind === stage.kind);
  switch (stage.state) {
    case "skipped":
      return "Not part of this run";
    case "pending":
      return "Waits for the stages above";
    case "provided":
      return filenames(mine) ?? "Provided";
    case "failed":
      // The row's error line carries the provider's own words; repeating them here would
      // truncate them into the column (`logic/01` §Q10).
      return `Stopped after ${attempts(stage)}`;
    case "canceled":
      return "Canceled by user";
    case "running":
      return stage.progressTotal === null || stage.progressTotal <= 0
        ? "Running"
        : running[stage.kind](stage.progressCurrent ?? 0, stage.progressTotal);
    case "done":
      return done(stage.kind, mine, project);
  }
}

export function attempts(stage: Stage): string {
  return stage.attemptCount === 1 ? "1 attempt" : `${String(stage.attemptCount)} attempts`;
}

function done(kind: StageKind, mine: readonly Output[], project: ProjectSummary): string {
  switch (kind) {
    case "research":
      return "Notes ready";
    case "article": {
      const extras = mine.filter(
        (output) => output.role === "sources" || output.role === "glossary",
      );
      return extras.length === 0
        ? "Article ready"
        : `Article and ${String(extras.length)} end-matter files`;
    }
    case "audio": {
      const named = mine.flatMap((output) => {
        const segment = segments[output.role];
        return segment === undefined ? [] : [segment];
      });
      return join([sentence(named), duration(total(mine))]);
    }
    case "images":
      return count(mine.filter((output) => output.role === "image").length, "image");
    case "thumbnail":
      return mine.length === 0 ? "Thumbnail ready" : "1 image";
    case "video":
      return join([duration(total(mine)), project.format]);
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

function sentence(words: readonly string[]): string | undefined {
  if (words.length === 0) {
    return undefined;
  }
  if (words.length === 1) {
    return capital(words[0] ?? "");
  }
  return capital(`${words.slice(0, -1).join(", ")} and ${words[words.length - 1] ?? ""}`);
}

function capital(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function join(parts: readonly (string | undefined)[]): string {
  return parts.filter((part) => part !== undefined && part !== "").join(" · ");
}
