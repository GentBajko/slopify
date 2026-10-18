import { describe, expect, it } from "vitest";
import type { ProjectEvent } from "../../kernel/events.js";
import type { Log, LogFields, LogLevel } from "../../kernel/log.js";
import type { ProjectState } from "../../kernel/pipeline.js";
import { projectLink } from "./address.js";
import type { RunNotifierDeps } from "./notifier.js";
import { createRunNotifier } from "./notifier.js";
import {
  autoPassNoticeText,
  reviewItemName,
  reviewNoticeText,
  runNotices,
  type StepFailure,
} from "./rules.js";
import type { SendNotification, SendResult } from "./send.js";

interface Posted {
  readonly url: string;
  readonly body: string;
}

function harness(
  options: {
    readonly url?: string | null;
    readonly answer?: () => Promise<SendResult>;
    readonly makesVideo?: boolean;
    readonly link?: boolean;
    readonly startedBy?: "person" | "agent";
    readonly waitingForAgent?: boolean;
    readonly atItsDay?: boolean;
    // What the project says of a failed step as each notice goes out.
    readonly failing?: () => {
      readonly stepFailedWhileWaiting?: boolean;
      readonly status?: ProjectState;
      readonly failures?: readonly StepFailure[];
    };
  } = {},
) {
  const posted: Posted[] = [];
  const lines: string[] = [];
  const send: SendNotification = (url, body) => {
    posted.push({ url, body });
    return options.answer?.() ?? Promise.resolve({ ok: true });
  };
  const log: Log = {
    write: (level: LogLevel, event: string, fields?: LogFields): void => {
      lines.push(`${level} ${event} ${fields?.projectId ?? ""} ${fields?.detail ?? ""}`);
    },
  };
  const deps: RunNotifierDeps = {
    url: () => (options.url === undefined ? "https://ntfy.example/topic" : options.url),
    subject: (projectId) =>
      projectId === "p1"
        ? {
            title: "Black holes",
            makesVideo: options.makesVideo ?? true,
            ...(options.startedBy === undefined ? {} : { startedBy: options.startedBy }),
            ...(options.waitingForAgent === true ? { waitingForAgent: true } : {}),
            ...(options.atItsDay === true ? { atItsDay: true } : {}),
            ...options.failing?.(),
          }
        : undefined,
    ...(options.link === true
      ? { link: (projectId: string) => projectLink("0.0.0.0", 6969, projectId) }
      : {}),
    send,
    log,
  };
  return { notifier: createRunNotifier(deps), posted, lines };
}

const state = (value: ProjectState, projectId = "p1"): ProjectEvent => ({
  type: "project.state",
  projectId,
  state: value,
});

const stage = (
  kind: "audio" | "images" | "thumbnail" | "video",
  value: "running" | "failed",
  failureReason?: string,
): ProjectEvent => ({
  type: "stage.state",
  projectId: "p1",
  stage: kind,
  state: value,
  ...(failureReason === undefined ? {} : { failureReason }),
});

// A failed step by its id ("kind@finishedAt"), with the provider's reason.
const failed = (id: string, reason?: string): StepFailure => ({
  id,
  kind: "audio",
  ...(reason === undefined ? {} : { reason }),
});

const firstLines = (posted: readonly Posted[]): string[] =>
  posted.map((one) => one.body.split("\n")[0] ?? "");

// The person's decision (2026-10-10): a step that fails while another waits for the agent, the
// person or its day is told right away, and the run that later ends Failed on it isn't told
// again.
describe("a step failed beside a wait", () => {
  it("is told right away beside an agent's review, and not again when the run fails", async () => {
    let failure = failed("audio@2026-10-10T10:00:00.000Z", "The narration was refused.");
    const { notifier, posted } = harness({
      waitingForAgent: true,
      failing: () => ({ stepFailedWhileWaiting: true, failures: [failure] }),
    });
    notifier.observe(state("running"));
    notifier.observe(state("pending"));
    notifier.observe(state("running"));
    notifier.observe(state("failed"));
    await notifier.settled();
    expect(firstLines(posted)).toEqual(["Step failed: Black holes — The narration was refused."]);
    // Tried again, it failed again: another failure, told when the run ends on it.
    failure = failed("audio@2026-10-10T11:00:00.000Z", "Refused again.");
    notifier.observe(state("running"));
    notifier.observe(state("failed"));
    await notifier.settled();
    expect(firstLines(posted).at(-1)).toBe("Run failed: Black holes — Refused again.");
  });

  it("is told beside the person's checkpoint as well as the wait", async () => {
    const { notifier, posted } = harness({
      failing: () => ({ stepFailedWhileWaiting: true, failures: [failed("audio@t", "Refused.")] }),
    });
    notifier.observe(state("running"));
    notifier.observe(state("pending"));
    notifier.observe(state("running"));
    notifier.observe(state("pending"));
    await notifier.settled();
    expect(firstLines(posted)).toEqual([
      "Waiting for you: Black holes",
      "Step failed: Black holes — Refused.",
      "Waiting for you: Black holes",
    ]);
  });

  it("is told beside a prepared run's own hold for its day", async () => {
    const { notifier, posted } = harness({
      atItsDay: true,
      failing: () => ({
        stepFailedWhileWaiting: true,
        failures: [failed("thumbnail@t", "Refused.")],
      }),
    });
    notifier.observe(state("running"));
    notifier.observe(state("pending"));
    await notifier.settled();
    expect(firstLines(posted)).toEqual(["Step failed: Black holes — Refused."]);
  });
});

// Each failure is told once by its own identity: fixing one failed step doesn't make another,
// already told, news again.
it("never tells an already told failure again once another failed step is fixed", async () => {
  let failures: readonly StepFailure[] = [];
  const { notifier, posted } = harness({
    failing: () => ({ stepFailedWhileWaiting: true, failures }),
  });
  notifier.observe(state("running"));
  failures = [failed("thumbnail@1")];
  notifier.observe(state("pending"));
  notifier.observe(state("running"));
  failures = [failed("thumbnail@1"), failed("images@2")];
  notifier.observe(state("pending"));
  notifier.observe(state("running"));
  // Images tried again and made: the thumbnail's failure, told already, is all that is left.
  failures = [failed("thumbnail@1")];
  notifier.observe(state("pending"));
  await notifier.settled();
  expect(firstLines(posted).filter((line) => line.startsWith("Step failed"))).toHaveLength(2);
});

// The person's decision (2026-10-11): a step that fails in an ordinary run, with nothing waiting
// beside it, says nothing mid-run; the run's own end notice tells it. One that fails while another
// step waits for the agent, the person or its day is told as it fails, once, and the run that
// then ends Failed on it is not told again; one that fails as the run ends is the run's own notice.
describe("a step failed while the run goes on", () => {
  it("says nothing mid-run with nothing waiting, and Run failed when the run ends", async () => {
    let now: { readonly status: ProjectState; readonly failures: readonly StepFailure[] } = {
      status: "running",
      failures: [],
    };
    const { notifier, posted } = harness({ failing: () => now });
    notifier.observe(state("running"));
    // The narration fails while the images still run.
    now = { status: "running", failures: [failed("audio@1", "Refused.")] };
    notifier.observe(stage("audio", "failed"));
    await notifier.settled();
    expect(firstLines(posted)).toEqual([]);
    now = { status: "failed", failures: now.failures };
    notifier.observe(state("failed"));
    await notifier.settled();
    expect(firstLines(posted)).toEqual(["Run failed: Black holes — Refused."]);
  });

  it("is told as it fails beside a wait, once, and not again when the run ends Failed on it", async () => {
    let now: {
      readonly stepFailedWhileWaiting?: boolean;
      readonly status: ProjectState;
      readonly failures: readonly StepFailure[];
    } = { status: "running", failures: [] };
    const { notifier, posted } = harness({ failing: () => now });
    notifier.observe(state("running"));
    now = {
      stepFailedWhileWaiting: true,
      status: "running",
      failures: [failed("audio@1", "Refused.")],
    };
    notifier.observe(stage("audio", "failed"));
    notifier.observe(stage("audio", "failed"));
    // Another step's failure is that step's news, not the audio's again.
    notifier.observe(stage("images", "failed"));
    await notifier.settled();
    expect(firstLines(posted)).toEqual(["Step failed: Black holes — Refused."]);
    now = { status: "failed", failures: now.failures };
    notifier.observe(state("failed"));
    await notifier.settled();
    expect(firstLines(posted)).toHaveLength(1);
  });

  // A step failed earlier with nothing waiting is the run's end notice to tell; the one that
  // fails now beside a wait is the news.
  it("names in Step failed the step that just failed, not an earlier one still untold", async () => {
    let now: {
      readonly stepFailedWhileWaiting?: boolean;
      readonly status: ProjectState;
      readonly failures: readonly StepFailure[];
    } = {
      status: "running",
      failures: [{ id: "thumbnail@1", kind: "thumbnail", reason: "Cover refused." }],
    };
    const { notifier, posted } = harness({ failing: () => now });
    notifier.observe(state("running"));
    notifier.observe(stage("thumbnail", "failed"));
    now = {
      stepFailedWhileWaiting: true,
      status: "running",
      failures: [...now.failures, failed("audio@2", "Narration refused.")],
    };
    notifier.observe(stage("audio", "failed"));
    await notifier.settled();
    expect(firstLines(posted)).toEqual(["Step failed: Black holes — Narration refused."]);
  });

  it("leaves a step that fails as the run stops or ends to the run's own notice", async () => {
    let now: { readonly status: ProjectState; readonly failures: readonly StepFailure[] } = {
      status: "failed",
      failures: [failed("audio@1", "Refused.")],
    };
    const { notifier, posted } = harness({
      failing: () => ({ stepFailedWhileWaiting: true, ...now }),
    });
    notifier.observe(state("running"));
    notifier.observe(stage("audio", "failed"));
    notifier.observe(state("failed"));
    await notifier.settled();
    expect(firstLines(posted)).toEqual(["Run failed: Black holes — Refused."]);
    now = { status: "pending", failures: [failed("audio@2", "Again.")] };
    notifier.observe(state("running"));
    notifier.observe(stage("audio", "failed"));
    notifier.observe(state("pending"));
    await notifier.settled();
    expect(firstLines(posted).slice(1)).toEqual([
      "Waiting for you: Black holes",
      "Step failed: Black holes — Again.",
    ]);
  });
});

// "Step failed" told one failure; the run then ends Failed on another with no end between.
describe("a run that ends Failed after a step failed beside a wait", () => {
  for (const [label, ending] of [
    ["on a different failure", [failed("images@2")]],
    ["on the told failure and another", [failed("thumbnail@1"), failed("images@2")]],
  ] as const)
    it(`is told ${label}`, async () => {
      let failures: readonly StepFailure[] = [failed("thumbnail@1")];
      const { notifier, posted } = harness({
        waitingForAgent: true,
        failing: () => ({ stepFailedWhileWaiting: true, failures }),
      });
      notifier.observe(state("running"));
      notifier.observe(state("pending"));
      notifier.observe(state("running"));
      failures = ending;
      notifier.observe(state("failed"));
      await notifier.settled();
      expect(firstLines(posted)).toEqual(["Step failed: Black holes", "Run failed: Black holes"]);
    });

  it("is not told again when it ends on the failure already told", async () => {
    const { notifier, posted } = harness({
      waitingForAgent: true,
      failing: () => ({ stepFailedWhileWaiting: true, failures: [failed("thumbnail@1")] }),
    });
    for (const one of ["running", "pending", "running", "failed"] as const)
      notifier.observe(state(one));
    await notifier.settled();
    expect(firstLines(posted)).toEqual(["Step failed: Black holes"]);
  });
});

// Every notice names a step failed now, as the browser does: one retried and made is no longer
// the run's reason.
it("names the step failed now, not the last one to fail", async () => {
  let failures: readonly StepFailure[] = [];
  const { notifier, posted } = harness({ failing: () => ({ failures }) });
  notifier.observe(state("running"));
  notifier.observe(stage("thumbnail", "failed", "The cover was refused."));
  notifier.observe(stage("images", "failed", "The images broke."));
  notifier.observe(stage("images", "running"));
  failures = [failed("thumbnail@1", "The cover was refused.")];
  notifier.observe(state("partial"));
  await notifier.settled();
  expect(firstLines(posted)).toEqual([
    "Video ready with problems: Black holes — The cover was refused.",
  ]);
});

// "Step failed" names the failure it tells, not the first one the run has.
it("names in Step failed the failure it tells", async () => {
  let failures: readonly StepFailure[] = [failed("thumbnail@1", "A broke.")];
  const { notifier, posted } = harness({
    failing: () => ({ stepFailedWhileWaiting: true, failures }),
  });
  notifier.observe(state("running"));
  notifier.observe(state("pending"));
  notifier.observe(state("running"));
  failures = [...failures, failed("images@2", "C broke.")];
  notifier.observe(state("pending"));
  await notifier.settled();
  expect(firstLines(posted).filter((line) => line.startsWith("Step failed"))).toEqual([
    "Step failed: Black holes — A broke.",
    "Step failed: Black holes — C broke.",
  ]);
});

describe("createRunNotifier", () => {
  it("POSTs once when a running project finishes", async () => {
    const { notifier, posted } = harness();
    notifier.observe(state("running"));
    notifier.observe(state("done"));
    notifier.observe(state("done"));
    await notifier.settled();
    expect(posted).toEqual([
      {
        url: "https://ntfy.example/topic",
        body: "Video ready: Black holes\nOpen the project to watch it.\n",
      },
    ]);
  });

  it("names the failing stage's short reason when a run fails", async () => {
    const { notifier, posted } = harness({
      failing: () => ({
        failures: [
          failed("audio@1", "The provider refused the request: quota exceeded\nsecond line"),
        ],
      }),
    });
    notifier.observe(state("running"));
    notifier.observe(state("failed"));
    await notifier.settled();
    expect(posted.map((post) => post.body.split("\n")[0])).toEqual([
      "Run failed: Black holes — The provider refused the request: quota exceeded",
    ]);
  });

  it("says a run is waiting when it stops with work held", async () => {
    const { notifier, posted } = harness();
    notifier.observe(state("running"));
    notifier.observe(state("pending"));
    await notifier.settled();
    expect(posted[0]?.body.startsWith("Waiting for you: Black holes\n")).toBe(true);
  });

  // An External agent answers it, or it passes at its deadline.
  it("says nothing when the run stops to wait for an agent's review, and still says when it ends", async () => {
    const { notifier, posted } = harness({ waitingForAgent: true });
    notifier.observe(state("running"));
    notifier.observe(state("pending"));
    notifier.observe(state("running"));
    notifier.observe(state("done"));
    await notifier.settled();
    expect(posted.map((one) => one.body.split("\n")[0])).toEqual(["Video ready: Black holes"]);
  });

  it("says nothing when a prepared run stops at its schedule's hold to wait for its day", async () => {
    const { notifier, posted } = harness({ atItsDay: true });
    notifier.observe(state("running"));
    notifier.observe(state("pending"));
    await notifier.settled();
    expect(posted).toEqual([]);
  });

  it("stays quiet for a state first seen terminal, a pause and a cancel", async () => {
    const { notifier, posted } = harness();
    notifier.observe(state("done"));
    notifier.observe(state("running"));
    notifier.observe(state("paused"));
    notifier.observe(state("running"));
    notifier.observe(state("canceled"));
    await notifier.settled();
    expect(posted).toEqual([]);
  });

  it("sends nothing while no Notification URL is saved", async () => {
    const { notifier, posted } = harness({ url: null });
    notifier.observe(state("running"));
    notifier.observe(state("done"));
    await notifier.settled();
    expect(posted).toEqual([]);
  });

  it("logs a refused POST without throwing or retrying", async () => {
    const { notifier, posted, lines } = harness({
      answer: () => Promise.resolve({ ok: false, reason: "refused", status: 404 }),
    });
    notifier.observe(state("running"));
    expect(() => notifier.observe(state("done"))).not.toThrow();
    await notifier.settled();
    expect(posted).toHaveLength(1);
    expect(lines).toEqual([
      "warn notification.failed p1 ready notification not delivered: the Notification URL answered HTTP 404",
    ]);
  });

  it("swallows a sender that rejects and keeps the URL out of the log", async () => {
    const { notifier, posted, lines } = harness({
      answer: () => Promise.reject(new Error("socket hang up")),
    });
    notifier.observe(state("running"));
    notifier.observe(state("failed"));
    await notifier.settled();
    expect(posted).toHaveLength(1);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("socket hang up");
    expect(lines[0]).not.toContain("ntfy.example");
  });

  it("sends nothing once shutdown has begun", async () => {
    const { notifier, posted } = harness();
    notifier.observe(state("running"));
    notifier.close();
    notifier.observe(state("pending"));
    await notifier.settled();
    expect(posted).toEqual([]);
  });

  it("calls an audio-only run finished, not a video", async () => {
    const { notifier, posted } = harness({ makesVideo: false });
    notifier.observe(state("running"));
    notifier.observe(state("done"));
    await notifier.settled();
    expect(posted[0]?.body.split("\n")[0]).toBe("Run finished: Black holes");
  });

  it("says once when a review kept an item flagged, with the project's link", async () => {
    const { notifier, posted } = harness({ link: true });
    const flagged: ProjectEvent = {
      type: "review.flagged",
      projectId: "p1",
      verdictId: "v1",
      stage: "images",
      itemKey: "image:3",
      reason: "The scroll shows a printed barcode.\nAnd a second reason.",
    };
    notifier.observe(flagged);
    notifier.observe(flagged);
    await notifier.settled();
    expect(posted).toEqual([
      {
        url: "https://ntfy.example/topic",
        body: "Review needs a decision: Black holes — The scroll shows a printed barcode.\nThe automatic review flagged an image and kept it. Open the project and press Overrule to keep it or Redo to make it again.\nhttp://localhost:6969/projects/p1\n",
      },
    ]);
  });

  it("sends no review notice without a Notification URL", async () => {
    const { notifier, posted } = harness({ url: null });
    notifier.observe({
      type: "review.flagged",
      projectId: "p1",
      verdictId: "v1",
      stage: "article",
      itemKey: "article:body",
    });
    await notifier.settled();
    expect(posted).toEqual([]);
  });

  it("says how many generated topics wait for approval", async () => {
    const { notifier, posted } = harness();
    notifier.observeTopics({
      type: "schedule.topics",
      scheduleId: "s1",
      scheduleName: "Ancient history",
      added: 5,
      waiting: 7,
    });
    await notifier.settled();
    expect(posted[0]?.body).toBe(
      "5 new topics are waiting for you\nOpen Calendar → Suggested topics → Ancient history to queue or reject them. 7 are waiting in all.\n",
    );
  });

  it("says once that an item passed without review when no agent answered", async () => {
    const { notifier, posted } = harness();
    const passed: ProjectEvent = {
      type: "review.auto-passed",
      projectId: "p1",
      reviewId: "er1",
      stage: "images",
      itemKey: "image:one",
      item: "image 3",
    };
    notifier.observe(passed);
    notifier.observe(passed);
    await notifier.settled();
    expect(posted.map((one) => one.body)).toEqual([
      "Passed without review: no agent answered in 2 h\nBlack holes: image 3 went ahead unreviewed. Open the project to look at it, or check that your agent's routine is running.\n",
    ]);
  });

  it("says a run was started by an agent, and a verdict was an agent's", async () => {
    const { notifier, posted } = harness({ startedBy: "agent" });
    notifier.observe(state("running"));
    notifier.observe(state("done"));
    notifier.observe({
      type: "review.flagged",
      projectId: "p1",
      verdictId: "v9",
      stage: "article",
      itemKey: "article:body",
      reason: "A section repeats another.",
      byAgent: true,
    });
    await notifier.settled();
    expect(posted.map((one) => one.body.split("\n")[0])).toEqual([
      "Video ready: Black holes · started by agent",
      "Review needs a decision: Black holes — A section repeats another. · by agent",
    ]);
  });
});

it("names a reviewed item the way the project page does", () => {
  const order = ["harbor", "hill"];
  expect(reviewItemName("image:hill", order)).toBe("image 2");
  expect(reviewItemName("image:gone", order)).toBe("an image");
  expect(reviewItemName("article:body", order)).toBe("the article");
  expect(reviewItemName("narration", order)).toBe("the narration");
  expect(reviewItemName("shorts:2", order)).toBe("short 2");
  expect(reviewItemName("thumbnail:image", order)).toBe("the thumbnail");
  expect(reviewItemName("thumbnail:image:3", order)).toBe("thumbnail 3");
  expect(reviewItemName("something:else", order)).toBeUndefined();
  expect(reviewItemName("promise", order)).toBe("the article's opening (promise check)");
});

it("tells a flagged or unanswered promise check by what it read", () => {
  expect(reviewNoticeText({ title: "Rope", stage: "promise", reason: "Slow start." }).detail).toBe(
    "The automatic review flagged the article's opening (promise check) and kept it. Open the project and press Overrule to keep it or Redo to make it again.",
  );
  expect(autoPassNoticeText({ title: "Rope", stage: "promise" }).detail).toBe(
    "Rope: the article's opening (promise check) went ahead unreviewed. Open the project to look at it, or check that your agent's routine is running.",
  );
});

// What is told is kept only while the run has it: a failure fixed, or a run that ended with none
// left, leaves nothing behind (the notifiers' end-of-run cleanup).
it("keeps a told failure only while the run still has it", () => {
  const told = new Set(["thumbnail@1", "images@2"]);
  const thumbnail = failed("thumbnail@1");
  expect(
    runNotices({ kind: "waiting" }, { stepFailedWhileWaiting: true, failures: [thumbnail] }, told)
      .told,
  ).toEqual(new Set(["thumbnail@1"]));
  expect(runNotices({ kind: "ready" }, {}, told).told.size).toBe(0);
  // A run that ends on its failures names them all: told from then on.
  expect(
    runNotices({ kind: "partial" }, { failures: [thumbnail, failed("video@3")] }, new Set()).told,
  ).toEqual(new Set(["thumbnail@1", "video@3"]));
});
