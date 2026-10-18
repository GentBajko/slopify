import type { ReportedState, SocialPlatform } from "./types.js";

// What the posting pages and the options page ask the background worker (`worker.ts`), beside
// YouTube Studio's `WorkerRequest`s.
export type SocialRequest =
  // The waiting post of the project whose tab Slopify opened (Slopify marks it filling, so
  // another tab doesn't take it).
  | { readonly type: "social-next"; readonly platform: SocialPlatform; readonly projectId: string }
  // One media file's bytes as base64, for a page the hidden frame can't serve.
  | {
      readonly type: "social-file";
      readonly projectId: string;
      readonly file: string;
    }
  // What the fill did, or the site's sign that it posted; `due` for a fill the worker opened at
  // release time (the person is notified), `lookup` for a profile page opened to find a link.
  | {
      readonly type: "social-result";
      readonly projectId: string;
      readonly platform: SocialPlatform;
      readonly item?: number;
      readonly state: ReportedState;
      readonly url?: string;
      readonly message?: string;
      readonly due?: boolean;
      readonly late?: boolean;
      readonly title?: string;
      readonly lookup?: boolean;
    }
  // A profile page found nothing: the worker closes it.
  | { readonly type: "social-lookup-done" }
  // The options page changed a site's access: re-register the content scripts and tell Slopify.
  | { readonly type: "social-sites" };

export function isSocialRequest(request: { readonly type?: unknown }): request is SocialRequest {
  return typeof request.type === "string" && request.type.startsWith("social-");
}

// The mark after `#` on a post form Slopify opened: by Fill in <site> (the app's `fillUrl` in
// `slices/social/limits.ts` writes it) or by the worker's alarm at release time (with `&due=1`).
// "slopify-post=<projectId>:<platform>". A post form without it is the person's own and is never
// filled or touched.
export const postHash = "slopify-post";

export interface PostMark {
  readonly projectId: string;
  readonly due: boolean;
  readonly late: boolean;
}

export function markedUrl(
  url: string,
  projectId: string,
  platform: SocialPlatform,
  flags: { readonly due?: boolean; readonly late?: boolean } = {},
): string {
  const extra = `${flags.due === true ? "&due=1" : ""}${flags.late === true ? "&late=1" : ""}`;
  return `${url.replace(/#.*$/, "")}#${postHash}=${encodeURIComponent(projectId)}:${platform}${extra}`;
}

// The mark on `href` for `platform`'s post form, or undefined when there is none (or it names
// another site).
export function postMarkOf(href: string, platform: SocialPlatform): PostMark | undefined {
  const params = new URLSearchParams(new URL(href).hash.replace(/^#/, ""));
  const raw = params.get(postHash);
  if (raw === null) return undefined;
  const split = raw.lastIndexOf(":");
  if (split <= 0 || raw.slice(split + 1) !== platform) return undefined;
  return {
    projectId: raw.slice(0, split),
    due: params.get("due") === "1",
    late: params.get("late") === "1",
  };
}

export const findHash = "slopify-find";

export interface LookupHash {
  readonly projectId: string;
  readonly platform: SocialPlatform;
  readonly start: string;
}
