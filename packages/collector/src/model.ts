import { z } from "zod";

// The slice of D1 this Worker uses. `D1Database` satisfies it structurally, so the
// binding goes straight in and a test hands in a stand-in over node:sqlite without a
// cast. @cloudflare/workers-types is not installed for it: its global Request and
// Response declarations collide with the @types/node ones this workspace typechecks
// against. `npm run schema:local && npm run dev` in this package runs the Worker on real
// local D1, which is the check that the four methods below are the right ones.
export interface CollectorStatement {
  readonly bind: (...values: readonly unknown[]) => CollectorStatement;
  readonly run: () => Promise<{ readonly meta: { readonly changes: number } }>;
  readonly all: <T>() => Promise<{ readonly results: T[] }>;
}

export interface CollectorDb {
  readonly prepare: (query: string) => CollectorStatement;
}

// The totals the marketing page reads. logic/16 step 3 names the counters; the page
// shows five of them and the other two are kept because the same step counts them.
export const aggregateKeys = [
  "installs",
  "projects_created",
  "videos_made",
  "images_made",
  "thumbnails_made",
  "audio_seconds",
  "tokens_used",
] as const;
export type AggregateKey = (typeof aggregateKeys)[number];
export type Aggregates = Readonly<Record<AggregateKey, number>>;

// ceiling: 500 events and 256 KiB per request, matched by the app's own batch of 200.
// This is a public unauthenticated endpoint, so both are enforced before anything is
// parsed and again by the schema below.
export const maxEventsPerRequest = 500;
export const maxBodyBytes = 256 * 1024;
const maxPayloadKeys = 20;

// The payload is not pinned to the app's current counter set: an install running a newer
// version must not have its events refused by an older collector. What is pinned is the
// shape - flat, small, and made of strings, numbers and booleans - so a payload can never
// carry a document, and unknown keys simply contribute to no aggregate.
const payloadValue = z.union([z.string().max(200), z.number().finite(), z.boolean()]);

export const collectorEventSchema = z.object({
  id: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[0-9A-Za-z_-]+$/),
  machineId: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[0-9A-Za-z_-]+$/),
  type: z
    .string()
    .min(1)
    .max(40)
    .regex(/^[a-z][a-z.]*$/),
  payload: z
    .record(z.string().max(40), payloadValue)
    .refine((payload) => Object.keys(payload).length <= maxPayloadKeys, {
      message: `a payload carries at most ${maxPayloadKeys} keys`,
    }),
  createdAt: z.iso.datetime(),
});

export type CollectorEvent = z.infer<typeof collectorEventSchema>;

export const ingestSchema = z.object({
  events: z
    .array(collectorEventSchema)
    .min(1)
    .max(maxEventsPerRequest)
    // One post carries one machine's events, because an install has exactly one machine
    // id. It keeps the rate limit to a single query per request and stops one post from
    // spending five hundred machines' allowances.
    .refine((events) => new Set(events.map((event) => event.machineId)).size === 1, {
      message: "every event in a request belongs to the same machine",
    }),
});

// What one accepted event adds. One event means one install, one project, one video or
// one thumbnail; the counters that vary per event are summed out of the payload.
export function deltasFor(event: CollectorEvent): readonly (readonly [AggregateKey, number])[] {
  const deltas: (readonly [AggregateKey, number])[] = [];
  if (event.type === "install") {
    deltas.push(["installs", 1]);
  }
  if (event.type === "project.created") {
    deltas.push(["projects_created", 1]);
  }
  if (event.type === "stage.completed") {
    const stage = event.payload.stage;
    if (stage === "video") {
      deltas.push(["videos_made", 1]);
    }
    if (stage === "thumbnail") {
      deltas.push(["thumbnails_made", 1]);
    }
    deltas.push(["images_made", count(event.payload.images)]);
  }
  // Seconds are rounded per event; the page shows hours, so the drift is invisible and
  // the column stays an integer.
  deltas.push(["audio_seconds", Math.round(count(event.payload.audioSeconds))]);
  deltas.push(["tokens_used", count(event.payload.tokensIn) + count(event.payload.tokensOut)]);
  return deltas.filter(([, delta]) => delta > 0);
}

// Written out rather than derived from the key list: the return type makes the compiler
// demand every key, and the page can rely on all of them being present at zero.
export function emptyAggregates(): Aggregates {
  return {
    installs: 0,
    projects_created: 0,
    videos_made: 0,
    images_made: 0,
    thumbnails_made: 0,
    audio_seconds: 0,
    tokens_used: 0,
  };
}

export function isAggregateKey(key: string): key is AggregateKey {
  return (aggregateKeys as readonly string[]).includes(key);
}

// A payload value the app never sends, or sends as text, counts as nothing rather than
// as NaN: the aggregates are the only thing an unvalidated key can reach, and they must
// stay integers.
function count(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}
