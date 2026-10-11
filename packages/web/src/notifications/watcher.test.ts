import type { ProjectState } from "@app/kernel/pipeline.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { claimOnce, storedTold } from "./browser.js";
import {
  createRunWatcher,
  type RunWatcherDeps,
  type ShownNotice,
  type ShownReviewNotice,
  type ShownStartNotice,
  type ShownTopicsNotice,
} from "./watcher.js";

// Each failure by its id, with the provider's reason.
const failing = (said: {
  readonly stepFailed?: boolean;
  readonly status?: ProjectState;
  readonly failures?: readonly string[];
}) => ({
  ...(said.stepFailed === true ? { stepFailed: true } : {}),
  ...(said.status === undefined ? {} : { status: said.status }),
  failures: (said.failures ?? []).map((id) => ({
    id,
    kind: "audio" as const,
    reason: "Quota exceeded",
  })),
});

function harness(
  options: {
    readonly enabled?: boolean;
    readonly seeded?: readonly { id: string; status: ProjectState }[];
    readonly claim?: RunWatcherDeps["claim"];
    readonly told?: RunWatcherDeps["told"];
    // What a project says of a failed step as each notice goes out.
    readonly failing?: () => {
      readonly stepFailed?: boolean;
      readonly status?: ProjectState;
      readonly failures?: readonly string[];
    };
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
              : {
                  title: `Project ${projectId}`,
                  makesVideo: true,
                  ...(projectId === "agent" ? { waitingForAgent: true } : {}),
                  ...(projectId === "prepared" ? { atItsDay: true } : {}),
                  ...failing(options.failing?.() ?? { failures: ["audio@t0"] }),
                },
          ),
    claim: options.claim ?? (() => Promise.resolve(true)),
    ...(options.told === undefined ? {} : { told: options.told }),
    show: (notice) => {
      shown.push(notice);
    },
    report: (error) => {
      reported.push(error);
    },
  });
  return { watcher, shown, reported };
}

// The person's decision (2026-10-10): a step that fails while another waits is told right away,
// and the run that later ends Failed on it isn't told again.
describe("a step failed beside a wait", () => {
  it("is told right away beside an agent's review, and once", async () => {
    let failure = "audio@t1";
    const claimed: string[] = [];
    const { watcher, shown } = harness({
      failing: () => ({ stepFailed: true, failures: [failure] }),
      claim: (key) => {
        claimed.push(key);
        return Promise.resolve(true);
      },
    });
    for (const state of ["running", "pending", "running", "pending", "running", "failed"] as const)
      watcher.observe({ projectId: "agent", state });
    await watcher.settled();
    expect(shown.map((notice) => [notice.kind, notice.text.headline])).toEqual([
      ["step-failed", "Step failed: Project agent — Quota exceeded"],
    ]);
    expect(claimed).toContain("agent:step-failed:audio@t1");
    // Tried again, it failed again: another failure, told when the run ends on it.
    failure = "audio@t2";
    watcher.observe({ projectId: "agent", state: "running" });
    watcher.observe({ projectId: "agent", state: "failed" });
    await watcher.settled();
    expect(shown.map((notice) => notice.kind)).toEqual(["step-failed", "failed"]);
  });

  it("is told after Waiting for you beside the person's checkpoint", async () => {
    const { watcher, shown } = harness({
      failing: () => ({ stepFailed: true, failures: ["audio@t1"] }),
    });
    watcher.observe({ projectId: "p1", state: "running" });
    watcher.observe({ projectId: "p1", state: "pending" });
    await watcher.settled();
    expect(shown.map((notice) => notice.kind)).toEqual(["waiting", "step-failed"]);
  });

  it("is told beside a prepared run's own hold for its day", async () => {
    const { watcher, shown } = harness({
      failing: () => ({ stepFailed: true, failures: ["thumbnail@t1"] }),
    });
    watcher.observe({ projectId: "prepared", state: "running" });
    watcher.observe({ projectId: "prepared", state: "pending" });
    await watcher.settled();
    expect(shown.map((notice) => notice.kind)).toEqual(["step-failed"]);
  });
});

// Each failure is told once by its own identity, and a run that then ends Failed on another
// failure, with no end between, is told.
describe("failures told beside a wait", () => {
  it("never tells an already told failure again once another failed step is fixed", async () => {
    let failures: readonly string[] = [];
    const { watcher, shown } = harness({ failing: () => ({ stepFailed: true, failures }) });
    const step = async (state: ProjectState, now?: readonly string[]) => {
      if (now !== undefined) failures = now;
      watcher.observe({ projectId: "p1", state });
      await watcher.settled();
    };
    await step("running");
    await step("pending", ["thumbnail@1"]);
    await step("running");
    await step("pending", ["thumbnail@1", "images@2"]);
    await step("running");
    await step("pending", ["thumbnail@1"]);
    expect(shown.filter((notice) => notice.kind === "step-failed")).toHaveLength(2);
  });

  it("tells Run failed for a different failure, and not for the one already told", async () => {
    let failures: readonly string[] = ["thumbnail@1"];
    const { watcher, shown } = harness({ failing: () => ({ stepFailed: true, failures }) });
    const step = async (projectId: string, state: ProjectState) => {
      watcher.observe({ projectId, state });
      await watcher.settled();
    };
    for (const state of ["running", "pending", "running"] as const) await step("agent", state);
    failures = ["images@2"];
    await step("agent", "failed");
    expect(shown.map((notice) => notice.kind)).toEqual(["step-failed", "failed"]);
    failures = ["thumbnail@1"];
    for (const state of ["running", "pending", "running", "failed"] as const)
      await step("other", state);
    expect(shown.filter((notice) => notice.projectId === "other").map((n) => n.kind)).toEqual([
      "waiting",
      "step-failed",
    ]);
  });
});

// The person's decision (2026-10-11): a step that fails in an ordinary run, with nothing waiting
// beside it, says nothing mid-run; the run's own end notice tells it, with its chime.
it("says nothing mid-run for a step failed with nothing waiting, and Run failed at the end", async () => {
  let status: ProjectState = "running";
  const played: string[] = [];
  const shown: ShownNotice[] = [];
  const watcher = createRunWatcher({
    enabled: () => true,
    sounds: () => true,
    play: (sound) => {
      played.push(sound);
    },
    seed: () => Promise.resolve([]),
    subject: () =>
      Promise.resolve({
        title: "Project p1",
        makesVideo: true,
        ...failing({ status, failures: ["audio@1"] }),
      }),
    claim: () => Promise.resolve(true),
    show: (notice) => {
      shown.push(notice);
    },
    report: () => {},
  });
  watcher.observe({ projectId: "p1", state: "running" });
  watcher.observeStage({ projectId: "p1", stage: "audio", state: "failed" });
  await watcher.settled();
  expect(shown).toEqual([]);
  expect(played).toEqual(["start"]);
  status = "failed";
  watcher.observe({ projectId: "p1", state: "failed" });
  await watcher.settled();
  expect(shown.map((notice) => notice.text.headline)).toEqual([
    "Run failed: Project p1 — Quota exceeded",
  ]);
  expect(played).toEqual(["start", "end"]);
});

// A step that fails while another waits and another still runs is told as it fails, once, and
// the run that then ends Failed on it is not told again.
it("tells a step failed beside a wait while the run goes on as it fails, once", async () => {
  let status: ProjectState = "running";
  const { watcher, shown } = harness({
    failing: () => ({ stepFailed: status === "running", status, failures: ["audio@1"] }),
  });
  watcher.observe({ projectId: "p1", state: "running" });
  watcher.observeStage({ projectId: "p1", stage: "audio", state: "failed" });
  await watcher.settled();
  watcher.observeStage({ projectId: "p1", stage: "audio", state: "failed" });
  watcher.observeStage({ projectId: "p1", stage: "images", state: "done" });
  await watcher.settled();
  expect(shown.map((notice) => [notice.kind, notice.text.headline])).toEqual([
    ["step-failed", "Step failed: Project p1 — Quota exceeded"],
  ]);
  status = "failed";
  watcher.observe({ projectId: "p1", state: "failed" });
  await watcher.settled();
  expect(shown).toHaveLength(1);
});

// Only a step that failed is news: one that starts again or finishes says nothing, though the
// project still lists its last failure as the page is read.
it("says nothing as a step runs again or finishes beside a wait", async () => {
  const { watcher, shown } = harness({
    failing: () => ({ stepFailed: true, status: "running", failures: ["audio@1"] }),
  });
  watcher.observe({ projectId: "p1", state: "running" });
  watcher.observeStage({ projectId: "p1", stage: "audio", state: "running" });
  watcher.observeStage({ projectId: "p1", stage: "audio", state: "done" });
  await watcher.settled();
  expect(shown).toEqual([]);
});

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

  // The agent answers it, or it passes at its deadline and says so then.
  it("says nothing when a run stops to wait for an agent's review", async () => {
    const { watcher, shown } = harness();
    watcher.observe({ projectId: "agent", state: "running" });
    watcher.observe({ projectId: "agent", state: "pending" });
    await watcher.settled();
    expect(shown).toEqual([]);
  });

  // Its schedule renders the video on its day.
  it("says nothing when a prepared run stops at its schedule's hold", async () => {
    const { watcher, shown } = harness();
    watcher.observe({ projectId: "prepared", state: "running" });
    watcher.observe({ projectId: "prepared", state: "pending" });
    await watcher.settled();
    expect(shown).toEqual([]);
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

describe("suggested topics", () => {
  function topicsHarness(
    enabled: boolean,
    claim: RunWatcherDeps["claim"] = () => Promise.resolve(true),
  ) {
    const shown: ShownTopicsNotice[] = [];
    const watcher = createRunWatcher({
      enabled: () => enabled,
      seed: () => Promise.resolve([]),
      subject: () => Promise.resolve(undefined),
      claim,
      show: () => {},
      showTopics: (notice) => {
        shown.push(notice);
      },
      report: () => {},
    });
    return { watcher, shown };
  }
  const event = { scheduleId: "s1", scheduleName: "Ancient history", added: 5, waiting: 7 };

  it("says how many new topics wait and where to find them", async () => {
    const { watcher, shown } = topicsHarness(true);
    watcher.observeTopics(event);
    await watcher.settled();
    expect(shown).toEqual([
      {
        scheduleId: "s1",
        text: {
          headline: "5 new topics are waiting for you",
          detail:
            "Open Calendar → Suggested topics → Ancient history to queue or reject them. 7 are waiting in all.",
        },
      },
    ]);
  });

  it("stays quiet when notifications are off, nothing was added, or another tab showed it", async () => {
    const off = topicsHarness(false);
    off.watcher.observeTopics(event);
    await off.watcher.settled();
    expect(off.shown).toEqual([]);
    const none = topicsHarness(true);
    none.watcher.observeTopics({ ...event, added: 0 });
    await none.watcher.settled();
    expect(none.shown).toEqual([]);
    const claimed: string[] = [];
    const taken = topicsHarness(true, (key) => {
      claimed.push(key);
      return Promise.resolve(false);
    });
    taken.watcher.observeTopics(event);
    await taken.watcher.settled();
    expect(taken.shown).toEqual([]);
    expect(claimed).toEqual(["topics:s1:7"]);
  });
});

describe("review notices", () => {
  function reviewHarness(enabled: boolean) {
    const shown: ShownReviewNotice[] = [];
    const claimed: string[] = [];
    const watcher = createRunWatcher({
      enabled: () => enabled,
      seed: () => Promise.resolve([]),
      subject: () => Promise.resolve({ title: "Hypatia", makesVideo: true }),
      claim: (key) => {
        claimed.push(key);
        return Promise.resolve(!claimed.slice(0, -1).includes(key));
      },
      show: () => undefined,
      showReview: (notice) => {
        shown.push(notice);
      },
      report: () => undefined,
    });
    return { watcher, shown, claimed };
  }
  const event = { projectId: "p1", verdictId: "v1", stage: "thumbnail", reason: "Blurry." };

  it("says a review needs a decision, once per verdict", async () => {
    const { watcher, shown, claimed } = reviewHarness(true);
    watcher.observeReview(event);
    watcher.observeReview(event);
    await watcher.settled();
    expect(claimed).toEqual(["review:v1", "review:v1"]);
    expect(shown).toEqual([
      {
        projectId: "p1",
        text: {
          headline: "Review needs a decision: Hypatia — Blurry.",
          detail:
            "The automatic review flagged the thumbnail and kept it. Open the project and press Overrule to keep it or Redo to make it again.",
        },
      },
    ]);
  });

  it("stays quiet while browser notifications are off", async () => {
    const { watcher, shown } = reviewHarness(false);
    watcher.observeReview(event);
    await watcher.settled();
    expect(shown).toEqual([]);
  });
});

// A fresh storage for each test, put back afterwards.
function withMemoryStorage(): void {
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
}

// The failures told are kept in the browser: a reload or another tab doesn't tell them again.
describe("told failures", () => {
  withMemoryStorage();

  it("doesn't tell Run failed after a reload for the failure Step failed told", async () => {
    const failures = { stepFailed: true, failures: ["audio@1"] };
    const before = harness({ told: storedTold, failing: () => failures });
    for (const state of ["running", "pending"] as const)
      before.watcher.observe({ projectId: "agent", state });
    await before.watcher.settled();
    expect(before.shown.map((notice) => notice.kind)).toEqual(["step-failed"]);
    const reloaded = harness({
      told: storedTold,
      seeded: [{ id: "agent", status: "pending" }],
      failing: () => failures,
    });
    await reloaded.watcher.seed();
    reloaded.watcher.observe({ projectId: "agent", state: "failed" });
    await reloaded.watcher.settled();
    expect(reloaded.shown).toEqual([]);
  });

  it("keeps a project's failures only while it has them, and survives a damaged value", () => {
    storedTold.write("p1", new Set(["audio@1"]));
    storedTold.write("p2", new Set(["images@1"]));
    expect([...storedTold.read("p1")]).toEqual(["audio@1"]);
    storedTold.write("p1", new Set());
    expect(window.localStorage.getItem("slopify.notifications.told")).toBe(
      JSON.stringify({ p2: ["images@1"] }),
    );
    window.localStorage.setItem("slopify.notifications.told", "{not json");
    expect(storedTold.read("p2").size).toBe(0);
  });
});

describe("claimOnce", () => {
  withMemoryStorage();

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

describe("run sounds", () => {
  function sounding(seeded: readonly { id: string; status: ProjectState }[] = []) {
    const played: string[] = [];
    const starts: string[] = [];
    const shown: ShownNotice[] = [];
    const watcher = createRunWatcher({
      enabled: () => false,
      sounds: () => true,
      play: (sound) => {
        played.push(sound);
      },
      showStart: (notice) => {
        starts.push(notice.title);
      },
      seed: () => Promise.resolve(seeded),
      subject: (projectId) => Promise.resolve({ title: `Project ${projectId}`, makesVideo: true }),
      claim: () => Promise.resolve(true),
      show: (notice) => {
        shown.push(notice);
      },
      report: () => {},
    });
    return { watcher, played, starts, shown };
  }

  it("chimes once when a run starts and differently when it ends, with notifications off", async () => {
    const { watcher, played, starts, shown } = sounding();
    watcher.observe({ projectId: "a", state: "pending" });
    watcher.observe({ projectId: "a", state: "running" });
    // A stop to wait for a review and back is the same run.
    watcher.observe({ projectId: "a", state: "pending" });
    watcher.observe({ projectId: "a", state: "running" });
    watcher.observe({ projectId: "a", state: "done" });
    await watcher.settled();
    expect(played).toEqual(["start", "end", "end"]);
    expect(starts).toEqual([]);
    expect(shown).toEqual([]);
    // Run again: a new start.
    watcher.observe({ projectId: "a", state: "running" });
    await watcher.settled();
    expect(played.at(-1)).toBe("start");
  });

  it("stays quiet for a run that was already going when the page loaded", async () => {
    const { watcher, played } = sounding([{ id: "b", status: "running" }]);
    await watcher.seed();
    watcher.observe({ projectId: "b", state: "running" });
    watcher.observe({ projectId: "b", state: "done" });
    await watcher.settled();
    expect(played).toEqual(["end"]);
  });
});

describe("agent notices", () => {
  function agentHarness() {
    const shown: ShownNotice[] = [];
    const reviews: ShownReviewNotice[] = [];
    const starts: ShownStartNotice[] = [];
    const watcher = createRunWatcher({
      enabled: () => true,
      seed: () => Promise.resolve([]),
      subject: () => Promise.resolve({ title: "Lighthouse", makesVideo: true, startedBy: "agent" }),
      claim: () => Promise.resolve(true),
      show: (notice) => {
        shown.push(notice);
      },
      showReview: (notice) => {
        reviews.push(notice);
      },
      showStart: (notice) => {
        starts.push(notice);
      },
      report: () => undefined,
    });
    return { watcher, shown, reviews, starts };
  }

  it("says a run was started by an agent", async () => {
    const { watcher, shown, starts } = agentHarness();
    watcher.observe({ projectId: "p1", state: "running" });
    watcher.observe({ projectId: "p1", state: "done" });
    await watcher.settled();
    expect(starts).toEqual([{ projectId: "p1", title: "Lighthouse", byAgent: true }]);
    expect(shown.map((notice) => notice.text.headline)).toEqual([
      "Video ready: Lighthouse · started by agent",
    ]);
  });

  it("shows an auto-passed review once, and an agent's flag as the agent's", async () => {
    const { watcher, reviews } = agentHarness();
    const passed = { projectId: "p1", reviewId: "er1", stage: "images", item: "image 3" };
    watcher.observeAutoPass(passed);
    watcher.observeAutoPass(passed);
    watcher.observeReview({
      projectId: "p1",
      verdictId: "v1",
      stage: "article",
      reason: "Too short.",
      byAgent: true,
    });
    await watcher.settled();
    expect(reviews.map((notice) => notice.text.headline)).toEqual([
      "Passed without review: no agent answered in 2 h",
      "Review needs a decision: Lighthouse — Too short. · by agent",
    ]);
    expect(reviews[0]?.text.detail).toContain("image 3 went ahead unreviewed");
  });
});
