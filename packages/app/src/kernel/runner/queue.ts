export interface ProviderQueue {
  readonly run: <T>(
    provider: string,
    signal: AbortSignal,
    work: () => Promise<T>,
    // Whose call this is (a project): a provider's slots go first to the owner with fewest of
    // them running, so one project's backlog never holds another's calls behind all of it.
    owner?: string,
  ) => Promise<T>;
}
interface Waiter {
  readonly provider: string;
  readonly owner: string;
  readonly signal: AbortSignal;
  readonly start: () => void;
  readonly cancel: () => void;
}
// One app-wide queue: no more than twelve calls, each provider up to its own limit (eight at
// most). The cap was five, so Codex drawing four or five pictures at once left one slot or none
// for narration and the picture checks, which then waited for hours.
// Waiting does not start an attempt or its idle timer. FIFO among eligible calls.
const totalLimit = 12;
const providerLimit = 8;
export function createProviderQueue(limitFor: (provider: string) => number): ProviderQueue {
  const active = new Map<string, number>();
  const owned = new Map<string, number>();
  const ownerKey = (w: { provider: string; owner: string }) => `${w.provider}\u0000${w.owner}`;
  const waiting: Waiter[] = [];
  let total = 0;
  function drain(): void {
    while (total < totalLimit) {
      // Among the calls whose provider has room, the owner with fewest running goes first;
      // ties keep the order they came in.
      let at = -1;
      let fewest = Number.POSITIVE_INFINITY;
      for (const [index, w] of waiting.entries()) {
        const room =
          (active.get(w.provider) ?? 0) <
          Math.max(1, Math.min(providerLimit, Math.floor(limitFor(w.provider)) || 1));
        if (!room) continue;
        const running = owned.get(ownerKey(w)) ?? 0;
        if (running < fewest) {
          fewest = running;
          at = index;
        }
      }
      if (at < 0) return;
      const next = waiting.splice(at, 1)[0];
      if (!next) return;
      next.signal.removeEventListener("abort", next.cancel);
      if (next.signal.aborted) {
        next.cancel();
        continue;
      }
      total++;
      active.set(next.provider, (active.get(next.provider) ?? 0) + 1);
      owned.set(ownerKey(next), (owned.get(ownerKey(next)) ?? 0) + 1);
      next.start();
    }
  }
  return {
    run: <T>(
      provider: string,
      signal: AbortSignal,
      work: () => Promise<T>,
      owner = "",
    ): Promise<T> => {
      if (signal.aborted) return Promise.reject(signal.reason);
      return new Promise<T>((resolve, reject) => {
        const waiter: Waiter = {
          provider,
          owner,
          signal,
          cancel: () => {
            const at = waiting.indexOf(waiter);
            if (at >= 0) waiting.splice(at, 1);
            signal.removeEventListener("abort", waiter.cancel);
            reject(signal.reason);
          },
          start: () => {
            void Promise.resolve()
              .then(() => {
                signal.throwIfAborted();
                return work();
              })
              .then(resolve, reject)
              .finally(() => {
                total--;
                const mine = (owned.get(ownerKey(waiter)) ?? 1) - 1;
                if (mine) owned.set(ownerKey(waiter), mine);
                else owned.delete(ownerKey(waiter));
                const left = (active.get(provider) ?? 1) - 1;
                if (left) active.set(provider, left);
                else active.delete(provider);
                drain();
              });
          },
        };
        waiting.push(waiter);
        signal.addEventListener("abort", waiter.cancel, { once: true });
        drain();
      });
    },
  };
}
