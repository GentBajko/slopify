import type { ProjectEvent, ScheduleTopicsEvent } from "../../kernel/events.js";
import type { Log } from "../../kernel/log.js";
import { redact } from "../../kernel/log.js";
import type { ProjectState } from "../../kernel/pipeline.js";
import type { NoticeSubject, NoticeText } from "./rules.js";
import { noticeOf, noticeText, topicsNoticeText, webhookBody } from "./rules.js";
import type { SendNotification } from "./send.js";
import { sendFailureText } from "./send.js";

export interface RunNotifierDeps {
  // Read at the moment of the transition, so a URL saved mid-run is the one used.
  readonly url: () => string | null;
  readonly subject: (projectId: string) => Omit<NoticeSubject, "reason"> | undefined;
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

export function createRunNotifier(deps: RunNotifierDeps): RunNotifier {
  // ceiling: one entry per project seen since boot, a few dozen bytes each.
  const states = new Map<string, ProjectState>();
  const reasons = new Map<string, string>();
  const inflight = new Set<Promise<void>>();
  let closed = false;

  const notify = (projectId: string, kind: NonNullable<ReturnType<typeof noticeOf>>): void => {
    const url = deps.url();
    if (url === null) return;
    const subject = deps.subject(projectId);
    if (subject === undefined) return;
    const text = noticeText(kind, { ...subject, reason: reasons.get(projectId) });
    post(url, text, kind, { projectId });
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
          if (event.state === "failed" && event.failureReason !== undefined)
            reasons.set(event.projectId, event.failureReason);
          else if (event.state === "running") reasons.delete(event.projectId);
          return;
        }
        if (event.type !== "project.state") return;
        const previous = states.get(event.projectId);
        if (previous === event.state) return;
        states.set(event.projectId, event.state);
        const kind = noticeOf(previous, event.state);
        if (kind !== undefined) notify(event.projectId, kind);
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
