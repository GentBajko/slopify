import { setTimeout as delay } from "node:timers/promises";

export interface Clock {
  readonly now: () => Date;
  // Waiting is the clock's business, not the caller's: the retry backoff of `logic/01`
  // §Q4 and the per-attempt timeouts of §Q62 are driven through here, so a test can run
  // forty seconds of retry policy without sleeping. Rejects with the signal's reason
  // when the signal aborts first.
  readonly sleep: (ms: number, signal?: AbortSignal) => Promise<void>;
}

export const systemClock: Clock = {
  now: (): Date => new Date(),
  sleep: async (ms: number, signal?: AbortSignal): Promise<void> => {
    if (signal === undefined) {
      await delay(ms);
      return;
    }
    try {
      await delay(ms, undefined, { signal });
    } catch (error) {
      // node:timers rejects with its own AbortError; the caller asked to be told why the
      // wait was cut short, which is what every other abort path in the app carries.
      throw signal.aborted ? signal.reason : error;
    }
  },
};
