import { describe, expect, it } from "vitest";
import { createProviderQueue } from "./queue.js";

describe("provider queue", () => {
  it("caps all providers at twelve across projects", async () => {
    const queue = createProviderQueue(() => 8);
    let active = 0;
    let peak = 0;
    const releases: (() => void)[] = [];
    const jobs = Array.from({ length: 30 }, (_, index) =>
      queue.run(index % 2 ? "inworld" : "other", new AbortController().signal, async () => {
        active++;
        peak = Math.max(peak, active);
        await new Promise<void>((resolve) => releases.push(resolve));
        active--;
      }),
    );
    await Promise.resolve();
    expect(active).toBe(12);

    while (releases.length) {
      releases.shift()?.();
      await new Promise<void>((r) => setImmediate(r));
    }
    await Promise.all(jobs);
    expect(peak).toBe(12);
  });
  // Codex drawing pictures at its own limit used to take every slot of the old cap of five,
  // so narration and the picture checks waited for hours behind it.
  it("keeps room for narration and checks while pictures run at their limit", async () => {
    const limits: Record<string, number> = { "codex-image": 4, "claude-code": 3, inworld: 5 };
    const queue = createProviderQueue((provider) => limits[provider] ?? 1);
    const running: Record<string, number> = {};
    const releases: (() => void)[] = [];
    const job = (provider: string) =>
      queue.run(provider, new AbortController().signal, async () => {
        running[provider] = (running[provider] ?? 0) + 1;
        await new Promise<void>((resolve) => releases.push(resolve));
      });
    const jobs = [
      ...Array.from({ length: 10 }, () => job("codex-image")),
      ...Array.from({ length: 5 }, () => job("claude-code")),
      ...Array.from({ length: 6 }, () => job("inworld")),
    ];
    await Promise.resolve();
    expect(running).toEqual({ "codex-image": 4, "claude-code": 3, inworld: 5 });
    while (releases.length) {
      releases.shift()?.();
      await new Promise<void>((r) => setImmediate(r));
    }
    await Promise.all(jobs);
  });
  it("lets one provider run at most eight at once", async () => {
    const queue = createProviderQueue(() => 20);
    let active = 0;
    const releases: (() => void)[] = [];
    const jobs = Array.from({ length: 10 }, () =>
      queue.run("p", new AbortController().signal, async () => {
        active++;
        await new Promise<void>((resolve) => releases.push(resolve));
      }),
    );
    await Promise.resolve();
    expect(active).toBe(8);
    while (releases.length) {
      releases.shift()?.();
      await new Promise<void>((r) => setImmediate(r));
    }
    await Promise.all(jobs);
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
  // Two videos share the Claude CLI: the one that queued 240 picture checks first must not hold
  // the next video's research behind all of them.
  it("shares a provider between projects instead of serving one project's backlog first", async () => {
    const queue = createProviderQueue(() => 2);
    const order: string[] = [];
    const releases: (() => void)[] = [];
    const job = (owner: string, name: string) =>
      queue.run(
        "claude-code",
        new AbortController().signal,
        async () => {
          order.push(name);
          await new Promise<void>((resolve) => releases.push(resolve));
        },
        owner,
      );
    const jobs = [
      ...Array.from({ length: 6 }, (_, at) => job("checks", `check-${String(at)}`)),
      job("research", "research-0"),
      job("research", "research-1"),
    ];
    await Promise.resolve();
    expect(order).toEqual(["check-0", "check-1"]);
    releases.shift()?.();
    await new Promise<void>((r) => setImmediate(r));
    expect(order[2]).toBe("research-0");
    releases.shift()?.();
    await new Promise<void>((r) => setImmediate(r));
    // Each project now has one call running: the slot goes to the one with fewer, then in turn.
    expect(order[3]).toBe("check-2");
    while (releases.length) {
      releases.shift()?.();
      await new Promise<void>((r) => setImmediate(r));
    }
    await Promise.all(jobs);
    expect(order).toHaveLength(8);
  });
});
