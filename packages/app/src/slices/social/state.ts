import { linkExamples, linkPatterns } from "./limits.js";
import {
  type PostState,
  platformLabels,
  type ReportedState,
  type SocialPlatform,
} from "./model.js";

// Where a post stands, and the times it reached each state; what the repo stores.
export interface PostProgress {
  readonly state: PostState;
  readonly waitingAt: string | null;
  readonly filledAt: string | null;
  readonly scheduledAt: string | null;
  readonly postedAt: string | null;
  readonly url: string | null;
  readonly message: string | null;
  readonly by: "extension" | "person" | null;
}

export const noProgress: PostProgress = {
  state: "none",
  waitingAt: null,
  filledAt: null,
  scheduledAt: null,
  postedAt: null,
  url: null,
  message: null,
  by: null,
};

export type Transition =
  | { readonly ok: true; readonly progress: PostProgress }
  | {
      readonly ok: false;
      readonly reason: "posted" | "not-asked" | "bad-link";
      readonly sentence: string;
    };

// Fill in <site>: the post waits for the extension. A post already on the site isn't filled
// again until its link is removed.
export function askFill(current: PostProgress, platform: SocialPlatform, now: Date): Transition {
  if (current.state === "posted")
    return {
      ok: false,
      reason: "posted",
      sentence: `This post is already on ${platformLabels[platform]}. To post it again, remove its link under the post first, then press Fill in ${platformLabels[platform]}.`,
    };
  return {
    ok: true,
    progress: { ...noProgress, state: "waiting", waitingAt: now.toISOString() },
  };
}

// The extension took the post, filled it, saw the site schedule or publish it, or stopped.
export function reportFill(
  current: PostProgress,
  platform: SocialPlatform,
  report: {
    readonly state: ReportedState;
    readonly url?: string | undefined;
    readonly message?: string | undefined;
  },
  now: Date,
): Transition {
  const site = platformLabels[platform];
  if (current.state === "none")
    return {
      ok: false,
      reason: "not-asked",
      sentence: `Nothing was waiting to be filled in ${site} for this project. In Slopify, open the project, press Prepare upload, then Fill in ${site}.`,
    };
  const url = report.url === undefined || report.url === "" ? null : report.url;
  if (url !== null && !linkPatterns[platform].test(url))
    return { ok: false, reason: "bad-link", sentence: badLink(platform) };
  if (current.state === "posted") {
    if (report.state !== "posted")
      return {
        ok: false,
        reason: "posted",
        sentence: `This post is already on ${site}; Slopify keeps it as posted.`,
      };
    return { ok: true, progress: { ...current, url: current.url ?? url } };
  }
  const at = now.toISOString();
  const message = report.message === undefined || report.message === "" ? null : report.message;
  switch (report.state) {
    case "filling":
      return { ok: true, progress: { ...current, state: "filling", message: null } };
    case "filled":
      return {
        ok: true,
        progress: { ...current, state: "filled", filledAt: at, message, by: "extension" },
      };
    case "scheduled":
      return {
        ok: true,
        progress: {
          ...current,
          state: "scheduled",
          filledAt: current.filledAt ?? at,
          scheduledAt: at,
          message,
          by: "extension",
        },
      };
    case "posted":
      return {
        ok: true,
        progress: { ...current, state: "posted", postedAt: at, url, message, by: "extension" },
      };
    case "failed":
      return {
        ok: true,
        progress: {
          ...current,
          state: "failed",
          message:
            message ??
            `The fill in ${site} stopped without saying why. Press Fill in ${site} again.`,
          by: "extension",
        },
      };
  }
}

// The person pasted the post's link (posted by hand or the extension missed it), or removed it.
export function pasteLink(
  current: PostProgress,
  platform: SocialPlatform,
  url: string | null,
  now: Date,
): Transition {
  if (url === null || url.trim() === "") return { ok: true, progress: noProgress };
  const link = url.trim();
  if (!linkPatterns[platform].test(link))
    return { ok: false, reason: "bad-link", sentence: badLink(platform) };
  return {
    ok: true,
    progress: {
      ...current,
      state: "posted",
      postedAt: current.postedAt ?? now.toISOString(),
      url: link,
      message: null,
      by: "person",
    },
  };
}

function badLink(platform: SocialPlatform): string {
  const site = platformLabels[platform];
  return `That isn't a link to a post on ${site}. Open the post on ${site}, copy its address (like ${linkExamples[platform]}) and paste it again.`;
}
