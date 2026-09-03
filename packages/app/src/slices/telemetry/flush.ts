import type { DatabaseSync } from "node:sqlite";
import type { Clock } from "../../kernel/clock.js";
import type { Log } from "../../kernel/log.js";
import type { CollectorEvent, PostEvents } from "./collector-client.js";
import type { TelemetryEvent } from "./model.js";
import { machineOf, markDelivered, undeliveredEvents } from "./repo.js";

export interface FlushDeps {
  readonly db: DatabaseSync;
  readonly clock: Clock;
  readonly log: Log;
  readonly post: PostEvents;
}

export interface FlushResult {
  readonly delivered: number;
  readonly dropped: number;
}

export interface Flusher {
  readonly soon: () => void;
  readonly stop: () => void;
}

// ceiling: 200 events per request against the collector's cap of 500, and at most 25
// requests per flush. A queue longer than 5000 undelivered events drains over several
// flushes rather than in one burst, which is the back-pressure an unbounded queue
// needs against a collector that has been away for months.
export const batchSize = 200;
const maxBatchesPerFlush = 25;

// The queue is flushed at app start and after each new event. Nothing
// here touches a pipeline, and an unreachable collector costs one refused socket.
export async function flush(deps: FlushDeps): Promise<FlushResult> {
  const machine = machineOf(deps.db);
  if (machine === undefined) {
    // Before the notice is dismissed there is no machine id to send events under, and
    // nothing leaves the machine until then.
    return { delivered: 0, dropped: 0 };
  }
  let delivered = 0;
  let dropped = 0;
  for (let batch = 0; batch < maxBatchesPerFlush; batch += 1) {
    const events = undeliveredEvents(deps.db, batchSize);
    if (events.length === 0) {
      break;
    }
    const outcome = await deps.post(events.map((event) => envelope(event, machine.machineId)));
    const ids = events.map((event) => event.id);
    if (outcome.ok) {
      markDelivered(deps.db, ids, deps.clock.now().toISOString());
      delivered += ids.length;
      continue;
    }
    if (outcome.retriable) {
      // Offline, or the collector is having a bad day. The events stay queued and the
      // user is told nothing.
      deps.log.write("info", "telemetry.deferred", {
        detail: `${ids.length} events stay queued: ${outcome.reason}`,
      });
      break;
    }
    // The collector refused the batch itself. Retrying it would refuse it again and park
    // every later event behind it, so it is marked delivered and lost on purpose.
    markDelivered(deps.db, ids, deps.clock.now().toISOString());
    dropped += ids.length;
    deps.log.write("warn", "telemetry.dropped", {
      detail: `${ids.length} events were refused and discarded: ${outcome.reason}`,
    });
    break;
  }
  return { delivered, dropped };
}

// The flush schedule, debounced: a fan-out that finishes four stages at once sends one
// request, not four. Every timer is unref'd, so a queued flush never keeps the process
// alive.
export function createFlusher(deps: FlushDeps, delayMs: number): Flusher {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = false;
  let again = false;
  let stopped = false;

  const soon = (): void => {
    if (stopped || timer !== undefined) {
      return;
    }
    if (running) {
      // Events recorded while a flush is in flight would otherwise wait for the next
      // one, and on a short run there is no next one.
      again = true;
      return;
    }
    timer = setTimeout(run, delayMs);
    timer.unref();
  };

  const run = (): void => {
    timer = undefined;
    running = true;
    flush(deps)
      .catch((error: unknown) => {
        // The timer has no caller to fail: a broken flush is logged and the next one
        // tries again.
        deps.log.write("warn", "telemetry.flush", { detail: messageOf(error) });
      })
      .finally(() => {
        running = false;
        if (again) {
          again = false;
          soon();
        }
      });
  };

  return {
    soon,
    stop: (): void => {
      stopped = true;
      again = false;
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
    },
  };
}

function envelope(event: TelemetryEvent, machineId: string): CollectorEvent {
  return {
    id: event.id,
    machineId,
    type: event.type,
    payload: event.payload,
    createdAt: event.createdAt,
  };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
