import { browserApi } from "./browser.js";
import { siteOrigins } from "./social/matches.js";

// A hidden page of the extension's own, which the Studio page loads in a frame to get the
// video file. Messages between the worker and the page are JSON, which can't carry a 2 GB
// file, but a frame can hand its parent a File in one postMessage: the browser passes a
// reference to the downloaded file, not its bytes. Fetching from here is the extension's own
// request, with the pairing token, so Slopify serves it as it serves the thumbnails.
//
// It answers only Studio, and only for a file of the waiting upload pack: Slopify refuses any
// other asset. The sites the extension posts on use it too, for a post's video: each asks only
// for its posts' files (`kind: "social"`), which Slopify serves only for a post's own media.

const studio = "https://studio.youtube.com";
const api = browserApi();
// Who may ask, and for which kind of file.
export const frameOrigins: Readonly<Record<string, "studio" | "social">> = {
  [studio]: "studio",
  ...Object.fromEntries(siteOrigins.map((origin) => [origin, "social" as const])),
};

export interface VideoRequest {
  readonly type: "slopify-video";
  readonly id: string;
  readonly projectId: string;
  readonly asset: string;
  readonly filename: string;
  readonly contentType: string;
  // A post's file (`/api/social/ext/files`) rather than an upload's; `asset` is then the
  // post's file name.
  readonly kind?: "social";
}

export type VideoAnswer =
  | { readonly type: "slopify-video-file"; readonly id: string; readonly file: File }
  | { readonly type: "slopify-video-error"; readonly id: string; readonly message: string };

async function load(request: VideoRequest): Promise<File> {
  const stored = await api.storage.local.get(["base", "token"]);
  if (typeof stored.base !== "string" || typeof stored.token !== "string")
    throw new Error(
      "The extension isn't paired with Slopify yet. Open the extension's options, paste the pairing token from Slopify's Settings → YouTube Studio and press Pair.",
    );
  let response: Response;
  try {
    const route = request.kind === "social" ? "social" : "studio";
    response = await fetch(
      `${stored.base}/api/${route}/ext/files/${encodeURIComponent(request.projectId)}/${encodeURIComponent(request.asset)}`,
      { headers: { authorization: `Bearer ${stored.token}` } },
    );
  } catch {
    throw new Error(
      `Couldn't reach Slopify at ${stored.base} for the video. Start Slopify, then add the video again.`,
    );
  }
  if (!response.ok) {
    let detail = `Slopify answered ${String(response.status)} when asked for the video.`;
    try {
      const body = (await response.json()) as { detail?: unknown };
      if (typeof body.detail === "string") detail = body.detail;
    } catch {
      // Not JSON: keep the sentence above.
    }
    throw new Error(detail);
  }
  // A large body is kept on disk by the browser, not in memory.
  const blob = await response.blob();
  return new File([blob], request.filename, { type: request.contentType });
}

window.addEventListener("message", (event: MessageEvent) => {
  const from = frameOrigins[event.origin];
  if (from === undefined || event.source !== window.parent) return;
  const request = event.data as Partial<VideoRequest> | null;
  if (request?.type !== "slopify-video" || typeof request.id !== "string") return;
  // Studio asks for uploads, the posting sites for posts: never the other way round.
  if ((request.kind === "social") !== (from === "social")) return;
  const reply = event.origin;
  const id = request.id;
  void load(request as VideoRequest).then(
    (file) => {
      window.parent.postMessage(
        { type: "slopify-video-file", id, file } satisfies VideoAnswer,
        reply,
      );
    },
    (error: unknown) => {
      window.parent.postMessage(
        {
          type: "slopify-video-error",
          id,
          message: error instanceof Error ? error.message : String(error),
        } satisfies VideoAnswer,
        reply,
      );
    },
  );
});

// Ready to take a request: said to each allowed origin, and only the parent's receives it.
for (const origin of Object.keys(frameOrigins))
  window.parent.postMessage({ type: "slopify-video-ready" }, origin);
