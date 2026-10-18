import type { ReportedState, SocialPlatform } from "./types.js";

// What the posting pages and the options page ask the background worker (`worker.ts`), beside
// YouTube Studio's `WorkerRequest`s.
export type SocialRequest =
  // The site's next waiting post (Slopify marks it filling, so another tab doesn't take it).
  | { readonly type: "social-next"; readonly platform: SocialPlatform }
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

// What the address of a page the worker opened carries after `#`.
export const dueHash = "slopify-post";
export const findHash = "slopify-find";

export interface LookupHash {
  readonly projectId: string;
  readonly platform: SocialPlatform;
  readonly start: string;
}
