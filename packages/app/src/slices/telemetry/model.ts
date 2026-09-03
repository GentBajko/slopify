import { z } from "zod";
import type { StageKind } from "../../kernel/pipeline.js";
import { stageKinds } from "../../kernel/pipeline.js";
import type { Usage } from "../../kernel/ports/llm.js";

// One install event, one per project created, one per stage completing.
export const telemetryEventTypes = ["install", "project.created", "stage.completed"] as const;
export type TelemetryEventType = (typeof telemetryEventTypes)[number];

// Counting is finer than a stage: one event per research, article, intro/outro text, audio
// segment (body, intro, outro), images, thumbnail and video. The three that are not whole
// stages are named by `segment` beside the stage that produced them - the article stage
// writes the intro and outro texts, the audio stage narrates all three - so the event type
// stays `stage.completed` and the pair (stage, segment) says which unit it is.
export const audioSegments = ["body", "intro", "outro"] as const;
export type AudioSegment = (typeof audioSegments)[number];

// What a stage slice is handed instead of the telemetry module: one call, already inside
// the swallow of `record`, so a slice can neither widen the payload nor fail a pipeline by
// counting it. The composition root closes over the deps and the flusher (main.ts).
export type RecordEvent = (type: TelemetryEventType, counters: TelemetryCounters) => void;

// Tokens in and out as the provider reports them, 0 when unreported. Never estimated, so a
// provider that reports nothing adds nothing.
export interface Tokens {
  readonly tokensIn: number;
  readonly tokensOut: number;
}

export const noTokens: Tokens = { tokensIn: 0, tokensOut: 0 };

export function plusUsage(tokens: Tokens, usage: Usage | null): Tokens {
  return {
    tokensIn: tokens.tokensIn + (usage?.inputTokens ?? 0),
    tokensOut: tokens.tokensOut + (usage?.outputTokens ?? 0),
  };
}

// The whole privacy surface. API keys, prompt bodies, keyword values, titles, article and
// research text, files, filenames, OS, locale and hardware are all barred from a payload,
// which is exactly what the first-run notice promises. The schema below is strict, so a
// caller that hands `record` anything not named here is rejected before the row is written;
// model.test.ts pins the set and record.test.ts sweeps every event type against it.
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

// Every event carries the app version beside its counters.
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
// when the first-run notice is dismissed.
export interface Machine {
  readonly machineId: string;
  readonly noticeSeenAt: string | null;
  readonly appVersion: string;
}
