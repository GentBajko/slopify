import type { ProjectState } from "../../kernel/pipeline.js";
import type { Actor } from "../agents/model.js";

// The run notifications' rules, shared by the server's Notification URL and the SPA's browser
// notifications so both say the same thing about the same transition. Pure: the web bundle
// imports this file.

export type RunNotice = "ready" | "partial" | "failed" | "waiting";

// Only a run seen running can finish, fail or stop to wait: a project first seen already done
// was done before anyone was watching. Paused and canceled are what the user just pressed, so
// they say nothing. `pending` after `running` is the runner finding nothing it may start: a
// review checkpoint holding the next step, or held work waiting for Resume.
export function noticeOf(
  previous: ProjectState | undefined,
  next: ProjectState,
): RunNotice | undefined {
  if (previous !== "running") return undefined;
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
  // Prepared ahead by a schedule and held now by its own Before Video hold, waiting for its day
  // (`reviews/holds.ts`).
  readonly prepared?: boolean | undefined;
}

// A run parked on an agent's review waits for nobody: the agent answers, or the review passes
// at its deadline and says so then. A prepared one waits for its scheduled day. Every other
// notice goes out.
export function announces(
  kind: RunNotice,
  subject: Pick<NoticeSubject, "waitingForAgent" | "prepared">,
): boolean {
  return kind !== "waiting" || (subject.waitingForAgent !== true && subject.prepared !== true);
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
