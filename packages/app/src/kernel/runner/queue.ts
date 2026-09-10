export interface ProviderQueue {
  readonly run: <T>(provider: string, signal: AbortSignal, work: () => Promise<T>) => Promise<T>;
}
interface Waiter {
  readonly provider: string;
  readonly signal: AbortSignal;
  readonly start: () => void;
  readonly cancel: () => void;
}
// One app-wide queue: no more than five calls, with lower provider limits.
// Waiting does not start an attempt or its idle timer. FIFO among eligible calls.
export function createProviderQueue(limitFor: (provider: string) => number): ProviderQueue {
  const active = new Map<string, number>();
  const waiting: Waiter[] = [];
  let total = 0;
  function drain(): void {
    while (total < 5) {
      const at = waiting.findIndex(
        (w) =>
          (active.get(w.provider) ?? 0) <
          Math.max(1, Math.min(5, Math.floor(limitFor(w.provider)) || 1)),
      );
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
      next.start();
    }
  }
  return {
    run: <T>(provider: string, signal: AbortSignal, work: () => Promise<T>): Promise<T> => {
      if (signal.aborted) return Promise.reject(signal.reason);
      return new Promise<T>((resolve, reject) => {
        const waiter: Waiter = {
          provider,
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
