import { browserApi } from "./browser.js";

// A hidden page of the extension's own, which the Studio page loads in a frame to get the
// video file. Messages between the worker and the page are JSON, which can't carry a 2 GB
// file, but a frame can hand its parent a File in one postMessage: the browser passes a
// reference to the downloaded file, not its bytes. Fetching from here is the extension's own
// request, with the pairing token, so Slopify serves it as it serves the thumbnails.
//
// It answers only Studio, and only for a file of the waiting upload pack: Slopify refuses any
// other asset.

const studio = "https://studio.youtube.com";
const api = browserApi();

export interface VideoRequest {
  readonly type: "slopify-video";
  readonly id: string;
  readonly projectId: string;
  readonly asset: string;
  readonly filename: string;
  readonly contentType: string;
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
    response = await fetch(
      `${stored.base}/api/studio/ext/files/${encodeURIComponent(request.projectId)}/${encodeURIComponent(request.asset)}`,
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
  if (event.origin !== studio || event.source !== window.parent) return;
  const request = event.data as Partial<VideoRequest> | null;
  if (request?.type !== "slopify-video" || typeof request.id !== "string") return;
  const id = request.id;
  void load(request as VideoRequest).then(
    (file) => {
      window.parent.postMessage(
        { type: "slopify-video-file", id, file } satisfies VideoAnswer,
        studio,
      );
    },
    (error: unknown) => {
      window.parent.postMessage(
        {
          type: "slopify-video-error",
          id,
          message: error instanceof Error ? error.message : String(error),
        } satisfies VideoAnswer,
        studio,
      );
    },
  );
});

// Ready to take a request.
window.parent.postMessage({ type: "slopify-video-ready" }, studio);
