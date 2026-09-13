export type ShutdownSignal = "SIGINT" | "SIGTERM";

export function installSignalShutdown(deps: {
  readonly on: (signal: ShutdownSignal, listener: () => void) => void;
  readonly stop: () => Promise<void>;
  readonly exit: (code: number) => void;
}): void {
  let stopping: Promise<void> | undefined;
  let forced = false;
  const shutdown = (): void => {
    // A second explicit signal is the operator's escape hatch if an external resource
    // ignores every graceful cancellation path.
    if (stopping !== undefined) {
      forced = true;
      deps.exit(1);
      return;
    }
    stopping = Promise.resolve().then(deps.stop);
    void stopping.then(
      () => {
        if (!forced) deps.exit(0);
      },
      () => {
        if (!forced) deps.exit(1);
      },
    );
  };
  deps.on("SIGINT", shutdown);
  deps.on("SIGTERM", shutdown);
}
