import { describe, expect, it } from "vitest";
import { createProviderQueue } from "./queue.js";

describe("provider queue", () => {
  it("caps all providers at five across projects", async () => {
    const queue = createProviderQueue(() => 5);
    let active = 0;
    let peak = 0;
    const releases: (() => void)[] = [];
    const jobs = Array.from({ length: 12 }, (_, index) =>
      queue.run(index % 2 ? "inworld" : "other", new AbortController().signal, async () => {
        active++;
        peak = Math.max(peak, active);
        await new Promise<void>((resolve) => releases.push(resolve));
        active--;
      }),
    );
    await Promise.resolve();
    expect(active).toBe(5);

    while (releases.length) {
      releases.shift()?.();
      await new Promise<void>((r) => setImmediate(r));
    }
    await Promise.all(jobs);
    expect(peak).toBe(5);
  });
  it("lets another provider use capacity when a provider reaches its lower limit", async () => {
    const queue = createProviderQueue(() => 1);
    let release = (): void => {};
    const held = queue.run(
      "one",
      new AbortController().signal,
      () =>
        new Promise<void>((r) => {
          release = r;
        }),
    );
    const blocked = queue.run("one", new AbortController().signal, async () => 2);
    expect(await queue.run("two", new AbortController().signal, async () => 3)).toBe(3);
    release();
    await held;
    expect(await blocked).toBe(2);
  });
  it("removes canceled waiters without sending a request or leaking a slot", async () => {
    const queue = createProviderQueue(() => 1);
    let release = (): void => {};
    const first = queue.run(
      "p",
      new AbortController().signal,
      () =>
        new Promise<void>((r) => {
          release = r;
        }),
    );
    const cancel = new AbortController();
    let called = false;
    const waiting = queue.run("p", cancel.signal, async () => {
      called = true;
    });
    cancel.abort(new Error("paused"));
    await expect(waiting).rejects.toThrow("paused");
    release();
    await first;
    expect(called).toBe(false);
    expect(await queue.run("p", new AbortController().signal, async () => 3)).toBe(3);
  });
});
