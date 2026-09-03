import type { StageKind } from "../../kernel/pipeline.js";
import type { TelemetryEvent, TelemetryPayload } from "./model.js";

// What the Usage screen shows: this install's all-time totals per counter, computed from
// the local event log alone and independent of delivery, so the page's totals always equal
// the sum of that log. Nothing here reads a project, a stage or a file - the same rows the
// collector receives are the only source, so what the page shows and what slopify.stream
// aggregates cannot drift apart.

// The five counters of the tally board, in the marketing page's own words: videos made,
// audio hours, images made, tokens used, projects. Seconds rather than hours, because
// rounding to hours is the screen's business and this is the sum of the log.
export interface UsageCounters {
  readonly videosMade: number;
  readonly audioSeconds: number;
  readonly imagesMade: number;
  readonly tokensUsed: number;
  readonly projects: number;
}

// One row of the "Tokens by stage" table: Stage, Provider · model, Tokens in, Tokens out.
export interface StageTokens {
  readonly stage: StageKind;
  readonly provider: string;
  readonly model: string | null;
  readonly tokensIn: number;
  readonly tokensOut: number;
}

export interface Usage {
  // Null until the first-run notice is dismissed, which is when the id is made. The screen
  // shows it at the bottom beside the app version.
  readonly machineId: string | null;
  readonly appVersion: string;
  readonly counters: UsageCounters;
  readonly byStage: readonly StageTokens[];
}

export interface UsageInput {
  readonly events: readonly TelemetryEvent[];
  readonly machineId: string | null;
  readonly appVersion: string;
}

export function usageOf(input: UsageInput): Usage {
  return {
    machineId: input.machineId,
    appVersion: input.appVersion,
    counters: counters(input.events),
    byStage: byStage(input.events),
  };
}

function counters(events: readonly TelemetryEvent[]): UsageCounters {
  let videosMade = 0;
  let audioSeconds = 0;
  let imagesMade = 0;
  let tokensUsed = 0;
  let projects = 0;
  for (const event of events) {
    if (event.type === "project.created") {
      projects += 1;
    }
    // One event per completed render, which is the same rule the collector counts `videos_made`
    // by, so the local page and the public board agree.
    if (event.payload.stage === "video") {
      videosMade += 1;
    }
    audioSeconds += event.payload.audioSeconds ?? 0;
    imagesMade += event.payload.images ?? 0;
    tokensUsed += (event.payload.tokensIn ?? 0) + (event.payload.tokensOut ?? 0);
  }
  return { videosMade, audioSeconds, imagesMade, tokensUsed, projects };
}

// Tokens are counted with provider and model names per stage, so the table groups by all
// three. Rows with no tokens are left out: the two number columns would both read zero, and
// the render and image calls that produce them report no usage at all.
//
// ceiling: this is a per-stage table, not a per-model one. The user deferred the per-model
// breakdown on the public counters on 2026-09-03; the payload already carries the provider
// and the model, so it stays a grouping change when it is asked for.
function byStage(events: readonly TelemetryEvent[]): readonly StageTokens[] {
  const rows = new Map<string, StageTokens>();
  for (const event of events) {
    const row = tokensOf(event.payload);
    if (row === undefined) {
      continue;
    }
    // JSON rather than a joined string: a model id is the provider's own and may hold
    // any character, and two different rows must never collide into one.
    const key = JSON.stringify([row.stage, row.provider, row.model]);
    const seen = rows.get(key);
    rows.set(
      key,
      seen === undefined
        ? row
        : {
            ...seen,
            tokensIn: seen.tokensIn + row.tokensIn,
            tokensOut: seen.tokensOut + row.tokensOut,
          },
    );
  }
  // Sorted by tokens out, as the screen asks. The tiebreaks below it are there so the same
  // log always produces the same table: a rundown that reshuffles between reads is
  // unreadable, and Map insertion order would follow whichever stage happened to finish
  // first in a fan-out.
  return [...rows.values()].toSorted(
    (left, right) =>
      right.tokensOut - left.tokensOut ||
      right.tokensIn - left.tokensIn ||
      left.stage.localeCompare(right.stage) ||
      left.provider.localeCompare(right.provider) ||
      (left.model ?? "").localeCompare(right.model ?? ""),
  );
}

function tokensOf(payload: TelemetryPayload): StageTokens | undefined {
  const tokensIn = payload.tokensIn ?? 0;
  const tokensOut = payload.tokensOut ?? 0;
  if (payload.stage === undefined || payload.provider === undefined) {
    return undefined;
  }
  if (tokensIn + tokensOut === 0) {
    return undefined;
  }
  return {
    stage: payload.stage,
    provider: payload.provider,
    model: payload.model ?? null,
    tokensIn,
    tokensOut,
  };
}
