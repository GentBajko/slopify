import { expect, it, vi } from "vitest";
import { installSignalShutdown, type ShutdownSignal } from "./signal-shutdown.js";

it("drains the first signal and treats a second signal as an immediate forced exit", async () => {
  const listeners = new Map<ShutdownSignal, () => void>();
  let finish: (() => void) | undefined;
  const stop = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const exit = vi.fn();
  installSignalShutdown({
    on: (signal, listener) => listeners.set(signal, listener),
    stop,
    exit,
  });

  listeners.get("SIGTERM")?.();
  listeners.get("SIGINT")?.();
  await Promise.resolve();
  expect(stop).toHaveBeenCalledOnce();
  expect(exit).toHaveBeenCalledWith(1);

  finish?.();
  await Promise.resolve();
  await Promise.resolve();
  expect(exit).toHaveBeenCalledOnce();
});

it("exits unsuccessfully after cleanup fails", async () => {
  const listeners = new Map<ShutdownSignal, () => void>();
  const exit = vi.fn();
  installSignalShutdown({
    on: (signal, listener) => listeners.set(signal, listener),
    stop: () => Promise.reject(new Error("cleanup failed")),
    exit,
  });

  listeners.get("SIGTERM")?.();
  await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(1));
});
