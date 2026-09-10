import { afterEach, expect, it, vi } from "vitest";
import { watchActivation } from "./candidate.js";
import { createUpdater } from "./service.js";

const token = "a".repeat(64);
afterEach(() => vi.useRealTimers());
function fixture() {
  let committed = false;
  let stopped = false;
  const updater = createUpdater({
    currentVersion: "0.6.2",
    now: () => Date.now(),
    busy: () => false,
    candidate: { token, pending: true, committed: async () => committed },
    latest: async () => "0.6.2",
    unsupported: () => undefined,
    install: async () => {},
    report: () => {},
  });
  const stop = watchActivation(
    updater,
    token,
    async () => {
      stopped = true;
    },
    () => {},
  );
  return {
    updater,
    stop,
    commit: () => {
      committed = true;
    },
    stopped: () => stopped,
  };
}
it("recovers a lost worker acknowledgement by observing only its own committed marker", async () => {
  vi.useFakeTimers();
  const h = fixture();
  await vi.advanceTimersByTimeAsync(250);
  expect(h.updater.beginMutation()).toBeUndefined();
  h.commit();
  await vi.advanceTimersByTimeAsync(250);
  const release = h.updater.beginMutation();
  expect(release).toBeTypeOf("function");
  release?.();
  expect(h.stopped()).toBe(false);
  h.stop();
});
it("stops an abandoned uncommitted candidate without ever admitting writes", async () => {
  vi.useFakeTimers();
  const h = fixture();
  await vi.advanceTimersByTimeAsync(120_000);
  expect(h.stopped()).toBe(true);
  expect(h.updater.beginMutation()).toBeUndefined();
  h.stop();
});
