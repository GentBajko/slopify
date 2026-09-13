import { expect, it, vi } from "vitest";
import { createMutationLifecycle, drainMutationsWithDeadline } from "./mutations.js";

it("stops new HTTP mutations and drains every request admitted before shutdown", async () => {
  const mutations = createMutationLifecycle();
  const releaseFirst = mutations.begin();
  const releaseSecond = mutations.begin();
  expect(releaseFirst).toBeTypeOf("function");
  expect(releaseSecond).toBeTypeOf("function");

  let drained = false;
  const stopping = mutations.stop().then(() => {
    drained = true;
  });
  expect(mutations.begin()).toBeUndefined();
  await Promise.resolve();
  expect(drained).toBe(false);

  releaseFirst?.();
  releaseFirst?.();
  await Promise.resolve();
  expect(drained).toBe(false);
  releaseSecond?.();
  await stopping;
  expect(drained).toBe(true);
  await expect(mutations.stop()).resolves.toBeUndefined();
});

it("force-closes stalled request sockets after the graceful drain deadline", async () => {
  vi.useFakeTimers();
  try {
    let release: (() => void) | undefined;
    const drained = new Promise<void>((resolve) => {
      release = resolve;
    });
    const terminate = vi.fn();
    let finished = false;
    const stopping = drainMutationsWithDeadline(drained, terminate, 5_000).then(() => {
      finished = true;
    });

    await vi.advanceTimersByTimeAsync(4_999);
    expect(terminate).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(terminate).toHaveBeenCalledOnce();
    expect(finished).toBe(false);

    release?.();
    await stopping;
    expect(finished).toBe(true);
  } finally {
    vi.useRealTimers();
  }
});
