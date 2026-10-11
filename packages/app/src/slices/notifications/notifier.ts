import type {
  ProjectEvent,
  ReviewAutoPassedEvent,
  ReviewFlaggedEvent,
  ScheduleTopicsEvent,
} from "../../kernel/events.js";
import type { Log } from "../../kernel/log.js";
import { redact } from "../../kernel/log.js";
import type { ProjectState } from "../../kernel/pipeline.js";
import type { NoticeSubject, NoticeText, RunNotice } from "./rules.js";
import {
  autoPassNoticeText,
  noticeOf,
  noticeText,
  reviewNoticeText,
  runNotices,
  topicsNoticeText,
  webhookBody,
} from "./rules.js";
import type { SendNotification } from "./send.js";
import { sendFailureText } from "./send.js";

export interface RunNotifierDeps {
  // Read at the moment of the transition, so a URL saved mid-run is the one used.
  readonly url: () => string | null;
  readonly subject: (projectId: string) => Omit<NoticeSubject, "reason"> | undefined;
  // The project's address for the notification's last line; absent leaves the line out.
  readonly link?: (projectId: string) => string | undefined;
  readonly send: SendNotification;
  readonly log: Log;
}

export interface RunNotifier {
  // Sees every event the hub is handed. Returns at once and never throws: a run never waits
  // on, or fails because of, a notification.
  readonly observe: (event: ProjectEvent) => void;
  // A schedule held generated topics for approval. Same promises as `observe`.
  readonly observeTopics: (event: ScheduleTopicsEvent) => void;
  // Resolves once every POST started so far has answered or timed out. Tests and shutdown.
  readonly settled: () => Promise<void>;
  // Shutdown: every stage is about to be aborted, which is not news, and the database is
  // about to close under `subject`.
  readonly close: () => void;
}

const ends: ReadonlySet<ProjectState> = new Set(["done", "partial", "failed", "canceled"]);

export function createRunNotifier(deps: RunNotifierDeps): RunNotifier {
  // ceiling: one entry per project seen since boot, a few dozen bytes each.
  const states = new Map<string, ProjectState>();
  const reasons = new Map<string, string>();
  const inflight = new Set<Promise<void>>();
  let closed = false;

  // The failure each project's "Step failed" said (`failureOf`).
  // ceiling: one entry per project with a step failed beside a wait since boot.
  const told = new Map<string, string>();

  const notify = (projectId: string, kind: RunNotice): void => {
    const url = deps.url();
    if (url === null) return;
    const subject = deps.subject(projectId);
    if (subject === undefined) return;
    const now = runNotices(kind, subject, told.get(projectId));
    if (now.told === undefined) told.delete(projectId);
    else told.set(projectId, now.told);
    for (const one of now.notices) {
      const text = noticeText(one, { ...subject, reason: reasons.get(projectId) });
      post(url, { ...text, link: deps.link?.(projectId) }, one, { projectId });
    }
  };

  // Once per verdict: a review asked again for the same item replaces its verdict in place.
  // ceiling: one id per flagged verdict since boot.
  const flagged = new Set<string>();
  const notifyReview = (event: ReviewFlaggedEvent): void => {
    if (flagged.has(event.verdictId)) return;
    flagged.add(event.verdictId);
    const url = deps.url();
    if (url === null) return;
    const subject = deps.subject(event.projectId);
    if (subject === undefined) return;
    const text = reviewNoticeText({
      title: subject.title,
      stage: event.stage,
      reason: event.reason,
      ...(event.byAgent === true ? { byAgent: true } : {}),
    });
    post(url, { ...text, link: deps.link?.(event.projectId) }, "review", {
      projectId: event.projectId,
    });
  };

  // Once per review. ceiling: one id per auto-passed review since boot.
  const passed = new Set<string>();
  const notifyAutoPass = (event: ReviewAutoPassedEvent): void => {
    if (passed.has(event.reviewId)) return;
    passed.add(event.reviewId);
    const url = deps.url();
    if (url === null) return;
    const subject = deps.subject(event.projectId);
    if (subject === undefined) return;
    const text = autoPassNoticeText({
      title: subject.title,
      stage: event.stage,
      item: event.item,
    });
    post(url, { ...text, link: deps.link?.(event.projectId) }, "auto-pass", {
      projectId: event.projectId,
    });
  };

  const post = (
    url: string,
    text: NoticeText,
    kind: string,
    about: { readonly projectId?: string },
  ): void => {
    const body = redact(webhookBody(text));
    const sending = deps
      .send(url, body)
      .then((result) => {
        if (!result.ok)
          deps.log.write("warn", "notification.failed", {
            ...about,
            detail: `${kind} notification not delivered: ${sendFailureText(result)}`,
          });
      })
      .catch((error: unknown) => {
        deps.log.write("warn", "notification.failed", {
          ...about,
          detail: `${kind} notification not delivered: ${error instanceof Error ? error.message : String(error)}`,
        });
      })
      .finally(() => {
        inflight.delete(sending);
      });
    inflight.add(sending);
  };

  return {
    observe: (event) => {
      if (closed) return;
      try {
        if (event.type === "stage.state") {
          // Kept until the run ends: the steps that go on after it are no reason to forget it.
          if (event.state !== "failed") return;
          if (event.failureReason === undefined) reasons.delete(event.projectId);
          else reasons.set(event.projectId, event.failureReason);
          return;
        }
        if (event.type === "review.flagged") {
          notifyReview(event);
          return;
        }
        if (event.type === "review.auto-passed") {
          notifyAutoPass(event);
          return;
        }
        if (event.type !== "project.state") return;
        const previous = states.get(event.projectId);
        if (previous === event.state) return;
        states.set(event.projectId, event.state);
        const kind = noticeOf(previous, event.state);
        if (kind !== undefined) notify(event.projectId, kind);
        if (ends.has(event.state)) {
          reasons.delete(event.projectId);
          told.delete(event.projectId);
        }
      } catch (error) {
        deps.log.write("warn", "notification.failed", {
          projectId: event.projectId,
          detail: `notification skipped: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    },
    observeTopics: (event) => {
      if (closed || event.added === 0) return;
      try {
        const url = deps.url();
        if (url === null) return;
        post(url, topicsNoticeText(event), "topics", {});
      } catch (error) {
        deps.log.write("warn", "notification.failed", {
          detail: `topics notification skipped: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    },
    close: () => {
      closed = true;
    },
    settled: async () => {
      while (inflight.size > 0) await Promise.all([...inflight]);
    },
  };
}
