import type { ProjectState, StageKind, StageState } from "../../kernel/pipeline.js";
import type { Actor } from "../agents/model.js";
import type { CheckpointHold } from "../reviews/holds.js";

// The run notifications' rules, shared by the server's Notification URL and the SPA's browser
// notifications so both say the same thing about the same transition. Pure: the web bundle
// imports this file.

// `step-failed`: a step failed while another waits for the agent, the person or its day, told
// as it fails or when the run stops to wait beside it (`runNotices`).
export type RunNotice = "ready" | "partial" | "failed" | "waiting" | "step-failed";

// Only a run seen running or waiting can finish, fail or stop to wait: a project first seen
// already done was done before anyone was watching. Paused and canceled are what the user just
// pressed, so they say nothing. `pending` after `running` is the runner finding nothing it may
// start: a review checkpoint holding the next step, or held work waiting for Resume. A run seen
// waiting can end without being seen running again: an answered review's step may finish in
// the tick that releases it, or a failed step beside it may leave nothing else to go on.
export function noticeOf(
  previous: ProjectState | undefined,
  next: ProjectState,
): RunNotice | undefined {
  if (previous !== "running" && previous !== "pending") return undefined;
  if (previous === "pending" && next === "pending") return undefined;
  switch (next) {
    case "done":
      return "ready";
    case "partial":
      return "partial";
    case "failed":
      return "failed";
    case "pending":
      return "waiting";
    default:
      return undefined;
  }
}

export interface NoticeText {
  readonly headline: string;
  readonly detail: string;
  // The project's address in Slopify, when the server knows where it is reachable.
  readonly link?: string | undefined;
}

// An automatic review flagged an item and kept it (`review.flagged`): the run goes on, the
// item waits for Overrule or Redo on the project page.
export interface ReviewNoticeSubject {
  readonly title: string;
  // `reviews/model.ts` reviewStages.
  readonly stage: string;
  readonly reason?: string | undefined;
  readonly byAgent?: boolean | undefined;
}

const reviewItemNames: Readonly<Record<string, string>> = {
  article: "the article",
  images: "an image",
  narration: "the narration",
  thumbnail: "the thumbnail",
  shorts: "a short",
};

export function reviewNoticeText(subject: ReviewNoticeSubject): NoticeText {
  const title = subject.title.trim() === "" ? "Untitled project" : subject.title.trim();
  const reason = shortReason(subject.reason);
  const item = reviewItemNames[subject.stage] ?? "an item";
  const headline = `Review needs a decision: ${title}`;
  return {
    headline: `${reason === undefined ? headline : `${headline} — ${reason}`}${subject.byAgent === true ? " · by agent" : ""}`,
    detail: `${subject.byAgent === true ? "An agent's review" : "The automatic review"} flagged ${item} and kept it. Open the project and press Overrule to keep it or Redo to make it again.`,
  };
}

// A reviewed item by the name the project page gives it: an image by its place in the image
// order ("image 3"), a short or a thumbnail variant by its number. Undefined for keys that are
// no reviewed item.
export function reviewItemName(itemKey: string, imageOrder: readonly string[]): string | undefined {
  if (itemKey === "article:body") return "the article";
  if (itemKey === "narration") return "the narration";
  if (itemKey === "thumbnail:image") return "the thumbnail";
  const variant = /^thumbnail:image:(\d+)$/.exec(itemKey);
  if (variant !== null) return `thumbnail ${variant[1] ?? ""}`;
  const short = /^shorts:(\d+)$/.exec(itemKey);
  if (short !== null) return `short ${short[1] ?? ""}`;
  if (!itemKey.startsWith("image:")) return undefined;
  const at = imageOrder.indexOf(itemKey.slice("image:".length));
  return at === -1 ? "an image" : `image ${String(at + 1)}`;
}

// An external review's two hours ran out with no agent's verdict (`review.auto-passed`).
export function autoPassNoticeText(subject: {
  readonly title: string;
  readonly stage: string;
  // `reviewItemName`, when the event carries it.
  readonly item?: string | undefined;
}): NoticeText {
  const title = subject.title.trim() === "" ? "Untitled project" : subject.title.trim();
  const item = subject.item ?? reviewItemNames[subject.stage] ?? "an item";
  return {
    headline: "Passed without review: no agent answered in 2 h",
    detail: `${title}: ${item} went ahead unreviewed. Open the project to look at it, or check that your agent's routine is running.`,
  };
}

export interface NoticeSubject {
  readonly title: string;
  // Whether the run makes a video at all: an audio-only run is "finished", not "ready".
  readonly makesVideo: boolean;
  readonly reason?: string | undefined;
  // Who started the run; an agent's run says so.
  readonly startedBy?: Actor | null | undefined;
  // The run is parked on an External agent's review (`reviews/holds.ts`).
  readonly waitingForAgent?: boolean | undefined;
  // Held now by its schedule's own Before Video hold, waiting for its day (`reviews/holds.ts`).
  readonly atItsDay?: boolean | undefined;
  // A step failed while another waits for the agent, the person or its day, the run running or
  // reading by that wait (`admission/state-words.ts` stepFailedWhileWaiting).
  readonly stepFailed?: boolean | undefined;
  // The run's state as the Projects list reads it now.
  readonly status?: ProjectState | undefined;
  // The failures the run has now (`failuresOf`), so each is told once.
  readonly failures?: readonly StepFailure[] | undefined;
}

// A failed step, by when it failed: a step that fails again after Try again is another failure.
export interface StepFailure {
  readonly id: string;
  readonly kind: StageKind;
  readonly reason?: string | undefined;
}

// A failure's identity: its step and when it failed.
export function failureId(kind: StageKind, finishedAt: string | null): string {
  return `${kind}@${finishedAt ?? ""}`;
}

// The failed steps of a run now, in the run's order: the first is the one a run's notice names.
export function failuresOf(
  stages: readonly {
    readonly kind: StageKind;
    readonly state: StageState;
    readonly finishedAt: string | null;
    readonly failureReason: string | null;
  }[],
): readonly StepFailure[] {
  return stages
    .filter((stage) => stage.state === "failed")
    .map((stage) => ({
      id: failureId(stage.kind, stage.finishedAt),
      kind: stage.kind,
      ...(stage.failureReason === null ? {} : { reason: stage.failureReason }),
    }));
}

// One notice to send, with the reason of the failure it names.
export interface RunNoticeOut {
  readonly kind: RunNotice;
  readonly reason: string | undefined;
}

export interface RunNotices {
  // In the order they go out: a project's notifications share a tag, so the last one stays.
  readonly notices: readonly RunNoticeOut[];
  // The failures told for the project from now on: those it still has that a notice named.
  readonly told: ReadonlySet<string>;
  // The failures "Step failed" names now, when it goes out.
  readonly news: readonly string[];
}

// What a project's notices answer: its run's transition (`noticeOf`), or one of its steps failing.
export type NoticeCause = { readonly kind: RunNotice } | { readonly stepFailed: StageKind };

// What a project's notices say, for the server's Notification URL and the browser alike, given
// the failures already told for the project. A step that fails while another waits for the
// agent, the person or its day is said right away ("Step failed"): as it fails while a third
// step still runs, or when the run stops to wait beside it; once per failure. One that fails
// with nothing waiting is told only by the run's end notice. A run that ends on its failures names them all; one that
// ends Failed only on failures already said is not told again. Each notice names the reason of
// a step failed now: the run's first, or the first "Step failed" tells.
export function runNotices(
  cause: NoticeCause,
  subject: Pick<
    NoticeSubject,
    "waitingForAgent" | "atItsDay" | "stepFailed" | "status" | "failures"
  >,
  told: ReadonlySet<string>,
): RunNotices {
  const failures = subject.failures ?? [];
  const untold = failures.filter((failure) => !told.has(failure.id));
  const notices: RunNoticeOut[] = [];
  // The failures "Step failed" names now.
  let stepNews: readonly StepFailure[] = [];
  if ("kind" in cause) {
    const { kind } = cause;
    const repeat = kind === "failed" && failures.length > 0 && untold.length === 0;
    if (!repeat && announces(kind, subject)) notices.push({ kind, reason: failures[0]?.reason });
    if (kind === "waiting" && subject.stepFailed === true) stepNews = untold;
  } else if (subject.status === "running" && subject.stepFailed === true)
    // Stopped to wait or ended, the run's own transition tells it.
    stepNews = untold.filter((failure) => failure.kind === cause.stepFailed);
  if (stepNews.length > 0) notices.push({ kind: "step-failed", reason: stepNews[0]?.reason });
  const ended = notices.some((one) => one.kind === "failed" || one.kind === "partial");
  return {
    notices,
    told: new Set(
      failures
        .filter((failure) => ended || told.has(failure.id) || stepNews.includes(failure))
        .map((failure) => failure.id),
    ),
    news: stepNews.map((failure) => failure.id),
  };
}

// Whether a prepared run's own Before Video hold is what holds it now (`atItsDay`), from the
// project's `prepared` and `holding` (`reviews/holds.ts`): the notifier and the browser both ask.
export function atItsDay(
  prepared: boolean,
  holding: readonly Pick<CheckpointHold, "waitsFor">[],
): boolean {
  return prepared && holding.some((hold) => hold.waitsFor === "day");
}

// A run parked on an agent's review waits for nobody: the agent answers, or the review passes
// at its deadline and says so then. One at its day's hold waits for its scheduled day. Every
// other notice goes out.
function announces(
  kind: RunNotice,
  subject: Pick<NoticeSubject, "waitingForAgent" | "atItsDay">,
): boolean {
  return kind !== "waiting" || (subject.waitingForAgent !== true && subject.atItsDay !== true);
}

const reasonMax = 140;

// A provider's failure can run to paragraphs; a notification has a line.
export function shortReason(reason: string | null | undefined): string | undefined {
  const line = reason
    ?.split(/\r?\n/)
    .map((part) => part.trim())
    .find((part) => part !== "");
  if (line === undefined) return undefined;
  return line.length <= reasonMax ? line : `${line.slice(0, reasonMax - 1).trimEnd()}…`;
}

export function noticeText(kind: RunNotice, subject: NoticeSubject): NoticeText {
  const text = runNoticeText(kind, subject);
  return subject.startedBy === "agent"
    ? { ...text, headline: `${text.headline} · started by agent` }
    : text;
}

function runNoticeText(kind: RunNotice, subject: NoticeSubject): NoticeText {
  const title = subject.title.trim() === "" ? "Untitled project" : subject.title.trim();
  switch (kind) {
    case "ready":
      return subject.makesVideo
        ? { headline: `Video ready: ${title}`, detail: "Open the project to watch it." }
        : { headline: `Run finished: ${title}`, detail: "Open the project to see its files." };
    case "partial": {
      const reason = shortReason(subject.reason);
      const made = subject.makesVideo
        ? `Video ready with problems: ${title}`
        : `Run finished with problems: ${title}`;
      return {
        headline: reason === undefined ? made : `${made} — ${reason}`,
        detail: "Open the project to see which step failed and the button that fixes it.",
      };
    }
    case "failed": {
      const reason = shortReason(subject.reason);
      return {
        headline:
          reason === undefined ? `Run failed: ${title}` : `Run failed: ${title} — ${reason}`,
        detail: "Open the project to see what stopped it and press Retry.",
      };
    }
    case "step-failed": {
      const reason = shortReason(subject.reason);
      return {
        headline:
          reason === undefined ? `Step failed: ${title}` : `Step failed: ${title} — ${reason}`,
        detail:
          "The run still waits on another step, so it isn't over. Open the project to see which step failed and press Retry.",
      };
    }
    case "waiting":
      return {
        headline: `Waiting for you: ${title}`,
        detail: "Open the project to review the held step or press Continue the run.",
      };
  }
}

// A schedule that holds its generated topics for approval says so once per generation.
export interface TopicsNoticeSubject {
  readonly scheduleName: string;
  readonly added: number;
  readonly waiting: number;
}

export function topicsNoticeText(subject: TopicsNoticeSubject): NoticeText {
  const name =
    subject.scheduleName.trim() === "" ? "Untitled schedule" : subject.scheduleName.trim();
  const count = subject.added;
  const total = subject.waiting > count ? ` ${String(subject.waiting)} are waiting in all.` : "";
  return {
    headline: `${String(count)} new ${count === 1 ? "topic is" : "topics are"} waiting for you`,
    detail: `Open Calendar → Suggested topics → ${name} to queue or reject ${count === 1 ? "it" : "them"}.${total}`,
  };
}

export const testNotice: NoticeText = {
  headline: "Slopify test notification",
  detail:
    "Notifications work. You'll get one when a run finishes, fails or waits for you, and when a review needs your decision.",
};

// The body a Notification URL receives: plain text, which ntfy shows as the message. Nothing
// but the project's title, what happened and the provider's own short reason goes in it.
export function webhookBody(text: NoticeText): string {
  return `${text.headline}\n${text.detail}\n${text.link === undefined ? "" : `${text.link}\n`}`;
}

// Where a project opens in the browser, from the address the server listens on. A wildcard
// (0.0.0.0 in Docker) or loopback address is reached as localhost from the same machine.
export function projectLink(host: string, port: number, projectId: string): string {
  const wildcard = host === "0.0.0.0" || host === "::" || host === "" || host === "127.0.0.1";
  const authority = wildcard ? "localhost" : host.includes(":") ? `[${host}]` : host;
  return `http://${authority}:${String(port)}/projects/${encodeURIComponent(projectId)}`;
}

export const notificationUrlMax = 2048;

// Empty clears the setting. Otherwise one absolute http(s) URL with no user name or password:
// fetch refuses those, and a password in a URL would sit in the database in plain sight.
export function notificationUrlProblem(value: string): string | undefined {
  const trimmed = value.trim();
  if (trimmed === "") return undefined;
  if (trimmed.length > notificationUrlMax)
    return `Keep the Notification URL to ${String(notificationUrlMax)} characters or fewer.`;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return "Enter a full address starting with https:// or http://, for example https://ntfy.sh/your-topic.";
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:")
    return "The Notification URL must start with https:// or http://.";
  if (parsed.username !== "" || parsed.password !== "")
    return "Remove the user name and password from the Notification URL; Slopify can't send them.";
  return undefined;
}
