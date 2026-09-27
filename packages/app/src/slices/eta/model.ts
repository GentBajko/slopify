// Time left on a running step, said honestly. Two bases, in this order:
// - progress: the step has counted some of its chapters, chunks or images, so the rest is
//   estimated from the rate so far;
// - history: nothing counted yet (a CLI image job drawing its first picture for minutes), so the
//   estimate is how long the same kind of step, on the same provider and model when known,
//   took in finished runs (`history.ts`), minus the time spent already.
// Neither: "unknown", never a made-up number. A step past its usual time is "overdue".
// Browser-safe: the project page and Home recompute it every second from the same inputs.

import type { StageKind, StageState } from "../../kernel/pipeline.js";

export const etaBases = ["progress", "history", "overdue", "unknown"] as const;
export type EtaBasis = (typeof etaBases)[number];

export interface Eta {
  readonly basis: EtaBasis;
  // Seconds left; absent for "overdue" and "unknown".
  readonly seconds?: number | undefined;
}

export interface EtaStage {
  readonly state: StageState;
  readonly startedAt: string | null;
  readonly progressCurrent: number | null;
  readonly progressTotal: number | null;
  // How long this step usually takes in all, from finished runs (`history.ts`).
  readonly typicalSeconds?: number | undefined;
}

// Undefined for a step that isn't running: a finished one has no time left, and a waiting one
// hasn't started the clock.
export function stageEta(stage: EtaStage, now: number): Eta | undefined {
  if (stage.state !== "running") return undefined;
  const started = stage.startedAt === null ? Number.NaN : Date.parse(stage.startedAt);
  const spent = Number.isFinite(started) ? Math.max(0, (now - started) / 1000) : undefined;
  const current = stage.progressCurrent ?? 0;
  const total = stage.progressTotal ?? 0;
  if (spent !== undefined && total > 0 && current > 0) {
    if (current >= total) return { basis: "progress", seconds: 0 };
    return { basis: "progress", seconds: Math.round((spent / current) * (total - current)) };
  }
  const typical = stage.typicalSeconds;
  if (typical === undefined || !Number.isFinite(typical) || typical <= 0)
    return { basis: "unknown" };
  const left = typical - (spent ?? 0);
  return left > 0 ? { basis: "history", seconds: Math.round(left) } : { basis: "overdue" };
}

// "about 4 min left", "under a minute left", "about 1 h 10 min left", "finishing up",
// "taking longer than usual", "time left unknown".
export function etaLabel(eta: Eta): string {
  if (eta.basis === "unknown") return "time left unknown";
  if (eta.basis === "overdue") return "taking longer than usual";
  const seconds = eta.seconds ?? 0;
  if (seconds <= 0) return "finishing up";
  if (seconds < 60) return "under a minute left";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `about ${String(minutes)} min left`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0
    ? `about ${String(hours)} h left`
    : `about ${String(hours)} h ${String(rest)} min left`;
}

// Which provider and model a stage runs on, from the run's settings, so a Codex image job is
// compared with Codex image jobs and not with a 4-second API image. Local steps (the video,
// the document) have none: every such step is like every other.
export interface ModelChoices {
  readonly llm?: { readonly provider: string; readonly model: string } | undefined;
  readonly audio?: { readonly provider: string; readonly model: string } | undefined;
  readonly images?: { readonly provider: string; readonly model: string } | undefined;
}

export function modelKeyOf(kind: StageKind, config: ModelChoices): string | undefined {
  const choice =
    kind === "research" || kind === "article"
      ? config.llm
      : kind === "audio"
        ? config.audio
        : kind === "images" || kind === "thumbnail"
          ? config.images
          : undefined;
  // A hand-edited config may hold anything here.
  if (typeof choice?.provider !== "string" || typeof choice.model !== "string") return undefined;
  return `${choice.provider}/${choice.model}`;
}
