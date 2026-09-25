import type { StageProgressEvent } from "../events.js";

// The most progress a single stage invocation reports per second. A stage may call emit on
// every chunk it reads (a 95 MB download is ~6,000 of them) and each report writes the
// database and reaches every open page; nobody can read a meter faster than this.
export const progressIntervalMs = 500;

export interface ProgressGate {
  readonly offer: (event: StageProgressEvent) => void;
  // Sends a held report at once, so a stage that finishes leaves its meter on its last value.
  readonly flush: () => void;
  // Drops a held report: the stage failed or stopped and its state event says the rest.
  readonly close: () => void;
}

// Repeats of the last value are dropped. The first report of a window goes out at once and
// the newest one offered inside it goes out when the window ends, so a meter never sits on
// a stale value longer than one interval.
export function progressGate(
  send: (event: StageProgressEvent) => void,
  intervalMs = progressIntervalMs,
): ProgressGate {
  let last: StageProgressEvent | undefined;
  let held: StageProgressEvent | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let closed = false;

  const same = (a: StageProgressEvent | undefined, b: StageProgressEvent): boolean =>
    a !== undefined && a.current === b.current && a.total === b.total;

  const deliver = (event: StageProgressEvent): void => {
    last = event;
    send(event);
    timer = setTimeout(() => {
      timer = undefined;
      const next = held;
      held = undefined;
      if (next !== undefined && !closed && !same(last, next)) deliver(next);
    }, intervalMs);
    timer.unref?.();
  };

  return {
    offer: (event) => {
      if (closed) return;
      if (timer !== undefined) {
        held = event;
        return;
      }
      if (!same(last, event)) deliver(event);
    },
    flush: () => {
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
      const next = held;
      held = undefined;
      if (next !== undefined && !closed && !same(last, next)) {
        last = next;
        send(next);
      }
    },
    close: () => {
      closed = true;
      held = undefined;
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
    },
  };
}
