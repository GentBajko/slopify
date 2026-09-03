import type { Clock } from "./clock.js";

// Test support, not shipped: `tsconfig.build.json` keeps `*.fake.ts` out of `dist`. The
// clock is injectable so retries and timestamps are deterministic.

// A clock that never moves and never waits, for the code that only stamps a row.
export function fixedClock(iso: string): Clock {
  return {
    now: (): Date => new Date(iso),
    sleep: (): Promise<void> => Promise.resolve(),
  };
}

export interface ManualClock extends Clock {
  // Every duration asked of `sleep`, in order, so a test can read the backoff schedule off
  // the clock instead of guessing at wall time.
  readonly waits: readonly number[];
  // Runs the pending timers, earliest first, until `work` settles. Time only moves here.
  readonly settle: <T>(work: Promise<T>) => Promise<T>;
  readonly pending: () => number;
}

interface Timer {
  readonly due: number;
  readonly wake: () => void;
}

export function manualClock(startIso = "2026-09-02T10:00:00.000Z"): ManualClock {
  let current = new Date(startIso).getTime();
  const timers = new Set<Timer>();
  const waits: number[] = [];

  const sleep = (ms: number, signal?: AbortSignal): Promise<void> => {
    waits.push(ms);
    if (signal?.aborted === true) {
      return Promise.reject(signal.reason);
    }
    return new Promise<void>((resolve, reject) => {
      const timer: Timer = { due: current + ms, wake: resolve };
      timers.add(timer);
      signal?.addEventListener(
        "abort",
        () => {
          timers.delete(timer);
          reject(signal.reason);
        },
        { once: true },
      );
    });
  };

  const earliest = (): Timer | undefined => {
    let found: Timer | undefined;
    for (const timer of timers) {
      if (found === undefined || timer.due < found.due) {
        found = timer;
      }
    }
    return found;
  };

  return {
    waits,
    now: (): Date => new Date(current),
    sleep,
    pending: (): number => timers.size,
    settle: async <T>(work: Promise<T>): Promise<T> => {
      let done = false;
      const tracked = work.then(
        (value) => {
          done = true;
          return value;
        },
        (error: unknown) => {
          done = true;
          throw error;
        },
      );
      // The rejection is delivered by the return below; this only stops Node reporting it
      // as unhandled in between.
      tracked.catch((): void => {});
      // ceiling: a thousand firings is far past any real schedule (four attempts wait
      // three times) and turns a hung test into a message instead of a timeout.
      for (let guard = 0; guard < 1000; guard += 1) {
        await flush();
        if (done) {
          return await tracked;
        }
        const next = earliest();
        if (next === undefined) {
          throw new Error("the manual clock has no timer pending and the work has not settled");
        }
        timers.delete(next);
        current = Math.max(current, next.due);
        next.wake();
      }
      throw new Error("the manual clock fired a thousand timers and the work never settled");
    },
  };
}

// One macrotask turn drains every microtask queued behind it; three covers work that hops
// the queue again on the way.
async function flush(): Promise<void> {
  for (let turn = 0; turn < 3; turn += 1) {
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });
  }
}
