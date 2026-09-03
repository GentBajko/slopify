import { z } from "zod";
import type { StageKind } from "../../kernel/pipeline.js";
import { stageKinds } from "../../kernel/pipeline.js";

// logic/16 step 2: one install event, one per project created, one per stage completing.
export const telemetryEventTypes = ["install", "project.created", "stage.completed"] as const;
export type TelemetryEventType = (typeof telemetryEventTypes)[number];

// logic/16 step 2 counts audio per segment, so a completed audio stage produces one event
// per segment rather than one for the stage.
export const audioSegments = ["body", "intro", "outro"] as const;
export type AudioSegment = (typeof audioSegments)[number];

// The whole privacy surface. logic/16 step 4 bars API keys, prompt bodies, keyword
// values, titles, article and research text, files, filenames, OS, locale and hardware
// from a payload, and mockup/02-first-run-notice promises the user exactly that. The
// schema below is strict, so a caller that hands `record` anything not named here is
// rejected before the row is written; model.test.ts pins the set and record.test.ts
// sweeps every event type against it.
export const payloadSchema = z.strictObject({
  appVersion: z.string().max(40),
  stage: z.enum(stageKinds).optional(),
  segment: z.enum(audioSegments).optional(),
  // ceiling: provider and model are length-capped, not matched against an allow-list,
  // because model ids are the providers' own and change weekly. The cap is what stops a
  // caller from smuggling prose through the one free-text pair the payload has.
  provider: z.string().max(40).optional(),
  model: z.string().max(120).optional(),
  tokensIn: z.number().int().nonnegative().optional(),
  tokensOut: z.number().int().nonnegative().optional(),
  audioSeconds: z.number().nonnegative().finite().optional(),
  images: z.number().int().nonnegative().optional(),
  thumbnails: z.number().int().nonnegative().optional(),
});

export interface TelemetryCounters {
  readonly stage?: StageKind | undefined;
  readonly segment?: AudioSegment | undefined;
  readonly provider?: string | undefined;
  readonly model?: string | undefined;
  readonly tokensIn?: number | undefined;
  readonly tokensOut?: number | undefined;
  readonly audioSeconds?: number | undefined;
  readonly images?: number | undefined;
  readonly thumbnails?: number | undefined;
}

// logic/16 §Q129: every event carries the app version beside its counters.
export interface TelemetryPayload extends TelemetryCounters {
  readonly appVersion: string;
}

export interface TelemetryEvent {
  readonly id: string;
  readonly type: TelemetryEventType;
  readonly payload: TelemetryPayload;
  readonly createdAt: string;
  readonly deliveredAt: string | null;
}

// The single row of the `machine` table. No account, no login: a random UUID made once,
// when the first-run notice is dismissed (logic/16 step 1).
export interface Machine {
  readonly machineId: string;
  readonly noticeSeenAt: string | null;
  readonly appVersion: string;
}
