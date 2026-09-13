export interface MutationLifecycle {
  readonly begin: () => (() => void) | undefined;
  readonly stop: () => Promise<void>;
}

/** Tracks admitted HTTP writes so shutdown can stop admission, then drain them. */
export function createMutationLifecycle(): MutationLifecycle {
  let accepting = true;
  let active = 0;
  let drained: Promise<void> | undefined;
  let resolveDrain: (() => void) | undefined;

  return {
    begin: () => {
      if (!accepting) return undefined;
      active++;
      let released = false;
      return () => {
        if (released) return;
        released = true;
        active--;
        if (!accepting && active === 0) resolveDrain?.();
      };
    },
    stop: () => {
      accepting = false;
      if (active === 0) return Promise.resolve();
      drained ??= new Promise<void>((resolve) => {
        resolveDrain = resolve;
      });
      return drained;
    },
  };
}

/** Give admitted requests a grace period, then close their sockets and wait for their
 * middleware `finally` blocks to release the database lease. */
export async function drainMutationsWithDeadline(
  drained: Promise<void>,
  terminateConnections: () => void,
  timeoutMs: number,
): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const outcome = await Promise.race([
    drained.then(() => "drained" as const),
    new Promise<"expired">((resolve) => {
      timer = setTimeout(() => resolve("expired"), timeoutMs);
    }),
  ]);
  if (timer !== undefined) clearTimeout(timer);
  if (outcome === "drained") return;
  terminateConnections();
  await drained;
}
