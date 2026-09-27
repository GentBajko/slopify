import { describe, expect, it } from "vitest";
import type { ProjectEvent } from "../../kernel/events.js";
import type { Log, LogFields, LogLevel } from "../../kernel/log.js";
import type { ProjectState } from "../../kernel/pipeline.js";
import type { RunNotifierDeps } from "./notifier.js";
import { createRunNotifier } from "./notifier.js";
import { projectLink } from "./rules.js";
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
        ? { title: "Black holes", makesVideo: options.makesVideo ?? true }
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
    const { notifier, posted } = harness();
    notifier.observe(state("running"));
    notifier.observe({
      type: "stage.state",
      projectId: "p1",
      stage: "audio",
      state: "failed",
      failureReason: "The provider refused the request: quota exceeded\nsecond line",
    });
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
});
