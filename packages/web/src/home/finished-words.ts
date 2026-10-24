import type { StageKind } from "@app/kernel/pipeline.js";
import type { ListingOutputs, ProjectListing } from "@app/slices/admission/model.js";
import { stageWords } from "@/lib/stage-words";
import { shortDate, startedAt } from "@/lib/utils";

// How Home and Projects describe a finished project in one line, from the list's own facts
// (`slices/admission/listing-facts.ts`): "3:05 · video + 2 shorts + PDF · finished Sep 27".

// "3:05", "1:02:10".
export function lengthWords(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const rest = String(whole % 60).padStart(2, "0");
  return hours > 0
    ? `${String(hours)}:${String(minutes).padStart(2, "0")}:${rest}`
    : `${String(minutes)}:${rest}`;
}

// "video + 2 shorts + PDF", "video + 1 short + audio"; undefined when nothing was made.
export function madeWords(outputs: ListingOutputs | undefined): string | undefined {
  if (outputs === undefined) return undefined;
  const parts = [
    outputs.video ? "video" : undefined,
    outputs.shorts === 0
      ? undefined
      : `${String(outputs.shorts)} ${outputs.shorts === 1 ? "short" : "shorts"}`,
    outputs.pdf ? "PDF" : undefined,
    outputs.audio ? "audio" : undefined,
  ].filter((part) => part !== undefined);
  return parts.length === 0 ? undefined : parts.join(" + ");
}

// "finished 17:22" today, "finished Sep 27" before.
export function finishedWords(iso: string, now: Date = new Date()): string {
  const at = new Date(iso);
  return `finished ${at.toDateString() === now.toDateString() ? startedAt(iso, now) : shortDate(iso, now)}`;
}

// "PDF failed", "Thumbnail and PDF failed": the steps a run that still made its video lost.
export function failedWords(steps: readonly StageKind[]): string {
  const names = [...new Set(steps.map((kind) => stageWords[kind]))];
  const last = names.at(-1);
  if (last === undefined) return "";
  return `${names.length === 1 ? last : `${names.slice(0, -1).join(", ")} and ${last}`} failed`;
}

// The finished line of a row: its length, its shape, what it made and when it finished, each
// left out while unknown.
export function finishedLine(
  project: Pick<ProjectListing, "durationSeconds" | "format" | "outputs" | "finishedAt">,
  now: Date = new Date(),
): string {
  return [
    project.durationSeconds === undefined ? undefined : lengthWords(project.durationSeconds),
    project.format,
    madeWords(project.outputs),
    project.finishedAt === undefined ? undefined : finishedWords(project.finishedAt, now),
  ]
    .filter((part) => part !== undefined)
    .join(" · ");
}
