import type { ProjectState } from "@app/kernel/pipeline.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { claimOnce } from "./browser.js";
import { createRunWatcher, type RunWatcherDeps, type ShownNotice } from "./watcher.js";

function harness(
  options: {
    readonly enabled?: boolean;
    readonly seeded?: readonly { id: string; status: ProjectState }[];
    readonly claim?: RunWatcherDeps["claim"];
  } = {},
) {
  const shown: ShownNotice[] = [];
  const reported: unknown[] = [];
  const watcher = createRunWatcher({
    enabled: () => options.enabled ?? true,
    seed: () => Promise.resolve(options.seeded ?? []),
    subject: (projectId) =>
      projectId === "broken"
        ? Promise.reject(new Error("offline"))
        : Promise.resolve(
            projectId === "gone"
              ? undefined
              : { title: `Project ${projectId}`, makesVideo: true, reason: "Quota exceeded" },
          ),
    claim: options.claim ?? (() => Promise.resolve(true)),
    show: (notice) => {
      shown.push(notice);
    },
    report: (error) => {
      reported.push(error);
    },
  });
  return { watcher, shown, reported };
}

describe("createRunWatcher", () => {
  it("notifies when a run already going at page load finishes", async () => {
    const { watcher, shown } = harness({ seeded: [{ id: "p1", status: "running" }] });
    await watcher.seed();
    watcher.observe({ projectId: "p1", state: "done" });
    await watcher.settled();
    expect(shown.map((notice) => notice.text.headline)).toEqual(["Video ready: Project p1"]);
  });

  it("says nothing for a project that was already done when the page loaded", async () => {
    const { watcher, shown } = harness({ seeded: [{ id: "p1", status: "done" }] });
    await watcher.seed();
    watcher.observe({ projectId: "p1", state: "done" });
    watcher.observe({ projectId: "p2", state: "failed" });
    await watcher.settled();
    expect(shown).toEqual([]);
  });

  it("names the failure and the wait", async () => {
    const { watcher, shown } = harness();
    watcher.observe({ projectId: "p1", state: "running" });
    watcher.observe({ projectId: "p1", state: "failed" });
    watcher.observe({ projectId: "p2", state: "running" });
    watcher.observe({ projectId: "p2", state: "pending" });
    await watcher.settled();
    expect(shown.map((notice) => [notice.kind, notice.text.headline])).toEqual([
      ["failed", "Run failed: Project p1 — Quota exceeded"],
      ["waiting", "Waiting for you: Project p2"],
    ]);
  });

  it("stays quiet while turned off, and for pause and cancel", async () => {
    const off = harness({ enabled: false });
    off.watcher.observe({ projectId: "p1", state: "running" });
    off.watcher.observe({ projectId: "p1", state: "done" });
    const on = harness();
    on.watcher.observe({ projectId: "p1", state: "running" });
    on.watcher.observe({ projectId: "p1", state: "paused" });
    on.watcher.observe({ projectId: "p1", state: "running" });
    on.watcher.observe({ projectId: "p1", state: "canceled" });
    await Promise.all([off.watcher.settled(), on.watcher.settled()]);
    expect([...off.shown, ...on.shown]).toEqual([]);
  });

  it("never overwrites a state an event already told it with the seeded one", async () => {
    const { watcher, shown } = harness({ seeded: [{ id: "p1", status: "done" }] });
    watcher.observe({ projectId: "p1", state: "running" });
    await watcher.seed();
    watcher.observe({ projectId: "p1", state: "done" });
    await watcher.settled();
    expect(shown).toHaveLength(1);
  });

  it("leaves the notification to the tab that claimed it", async () => {
    const { watcher, shown } = harness({ claim: () => Promise.resolve(false) });
    watcher.observe({ projectId: "p1", state: "running" });
    watcher.observe({ projectId: "p1", state: "done" });
    await watcher.settled();
    expect(shown).toEqual([]);
  });

  it("skips a deleted project and reports one it couldn't read, without throwing", async () => {
    const { watcher, shown, reported } = harness();
    for (const projectId of ["gone", "broken"]) {
      watcher.observe({ projectId, state: "running" });
      expect(() => watcher.observe({ projectId, state: "done" })).not.toThrow();
    }
    await watcher.settled();
    expect(shown).toEqual([]);
    expect(reported).toEqual([new Error("offline")]);
  });
});

describe("claimOnce", () => {
  const original = Object.getOwnPropertyDescriptor(window, "localStorage");
  beforeEach(() => {
    const items = new Map<string, string>();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => items.get(key) ?? null,
        setItem: (key: string, value: string) => items.set(key, value),
        removeItem: (key: string) => items.delete(key),
      },
    });
  });
  afterEach(() => {
    if (original) Object.defineProperty(window, "localStorage", original);
    else Object.defineProperty(window, "localStorage", { configurable: true, value: undefined });
  });

  it("lets one tab of many claim a transition, and the same one again after a minute", async () => {
    let now = 1_000_000;
    const clock = () => now;
    expect(await claimOnce("p1:done", clock)).toBe(true);
    expect(await claimOnce("p1:done", clock)).toBe(false);
    expect(await claimOnce("p2:done", clock)).toBe(true);
    now += 61_000;
    expect(await claimOnce("p1:done", clock)).toBe(true);
  });

  it("claims when storage is missing altogether", async () => {
    Object.defineProperty(window, "localStorage", { configurable: true, value: undefined });
    expect(await claimOnce("p1:done")).toBe(true);
  });

  it("claims anyway when storage holds something unreadable", async () => {
    window.localStorage.setItem("slopify.notifications.sent", "{not json");
    expect(await claimOnce("p1:done")).toBe(true);
  });
});
