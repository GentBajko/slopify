import type { ConfigEnv } from "../../kernel/config/index.js";
import type { TelemetryEventType, TelemetryPayload } from "./model.js";

// One queued event as the collector receives it: the local row plus the machine id,
// which is held in the `machine` table and never duplicated into a payload.
export interface CollectorEvent {
  readonly id: string;
  readonly machineId: string;
  readonly type: TelemetryEventType;
  readonly payload: TelemetryPayload;
  readonly createdAt: string;
}

export type PostOutcome =
  | { readonly ok: true }
  // `retriable` decides whether the events stay queued. A batch the collector refuses
  // will be refused again forever, and the queue is unbounded (logic/16 §Q134), so
  // retrying it would park every later event behind it.
  | { readonly ok: false; readonly retriable: boolean; readonly reason: string };

export type PostEvents = (events: readonly CollectorEvent[]) => Promise<PostOutcome>;

// 07-operations: the collector URL is built into the release and is not user
// configurable. The environment variable below is a test seam, not a documented knob:
// packages/app/test/telemetry-flush.test.ts points it at a fake collector.
export const defaultCollectorUrl = "https://collector.slopify.stream";

export function collectorEndpoint(env: ConfigEnv): string {
  const override = env.SLOPIFY_COLLECTOR_URL?.trim();
  if (override === undefined || override === "") {
    return defaultCollectorUrl;
  }
  const parsed = URL.parse(override);
  if (parsed === null || (parsed.protocol !== "http:" && parsed.protocol !== "https:")) {
    return defaultCollectorUrl;
  }
  return override.replace(/\/+$/, "");
}

export function httpPostEvents(endpoint: string, timeoutMs: number): PostEvents {
  return async (events: readonly CollectorEvent[]): Promise<PostOutcome> => {
    if (events.length === 0) {
      return { ok: true };
    }
    try {
      const response = await fetch(`${endpoint}/events`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ events }),
        // Without this an unanswering collector would hold a socket open for as long as
        // the app runs, and the shutdown would wait on it.
        signal: AbortSignal.timeout(timeoutMs),
      });
      // Nothing here reads the answer, and undici holds the connection open until a body
      // is consumed or cancelled.
      await response.body?.cancel();
      if (response.ok) {
        return { ok: true };
      }
      return {
        ok: false,
        retriable: response.status >= 500 || response.status === 429,
        reason: `the collector answered ${response.status}`,
      };
    } catch (error) {
      // Offline is the ordinary case, not a fault: the events stay queued and the user is
      // told nothing (logic/16 step 5).
      return { ok: false, retriable: true, reason: messageOf(error) };
    }
  };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
