import { browserApi } from "./browser.js";
import type { WorkerAnswer } from "./pack.js";
import { fromBase64, postFiles } from "./social/files.js";
import type { SocialRequest } from "./social/messages.js";
import { runSocialPage } from "./social/runner.js";
import { siteFor } from "./social/sites/index.js";
import type { PostMedia, PostPack } from "./social/types.js";
import { toast } from "./ui.js";
import type { VideoAnswer, VideoRequest } from "./video-frame.js";

// Runs on the sites the person allowed posting on (registered at run time by `social/grant.ts`,
// never in the manifest): X, LinkedIn, Instagram, TikTok, Reddit and Bluesky. One script for all
// six, picking the site's adapter by the page's host (`social/runner.ts` does the work).

const api = browserApi();

const send = <T>(request: SocialRequest) =>
  api.runtime.sendMessage(request) as Promise<WorkerAnswer<T>>;

// A video through the extension's hidden frame, which hands back the downloaded File.
function viaFrame(pack: PostPack, media: PostMedia): Promise<File> {
  const frame = document.createElement("iframe");
  frame.src = api.runtime.getURL("video-frame.html");
  frame.hidden = true;
  const id = crypto.randomUUID();
  const origin = new URL(frame.src).origin;
  return new Promise<File>((resolve, reject) => {
    // A page whose rules block the frame never hears from it.
    const timer = setTimeout(() => {
      window.removeEventListener("message", listen);
      reject(new Error("the page didn't let the extension's frame load"));
    }, 15_000);
    const listen = (event: MessageEvent): void => {
      if (event.origin !== origin || event.source !== frame.contentWindow) return;
      const data = event.data as { type?: unknown } | VideoAnswer;
      if (data.type === "slopify-video-ready") {
        frame.contentWindow?.postMessage(
          {
            type: "slopify-video",
            id,
            projectId: pack.projectId,
            asset: media.file,
            filename: media.filename,
            contentType: media.contentType,
            kind: "social",
          } satisfies VideoRequest,
          origin,
        );
        return;
      }
      if (!("id" in data) || data.id !== id) return;
      clearTimeout(timer);
      window.removeEventListener("message", listen);
      if (data.type === "slopify-video-file") resolve(data.file);
      else reject(new Error(data.message));
    };
    window.addEventListener("message", listen);
    document.body.append(frame);
  }).finally(() => frame.remove());
}

async function viaWorker(pack: PostPack, media: PostMedia): Promise<File> {
  const answer = await send<string>({
    type: "social-file",
    projectId: pack.projectId,
    file: media.file,
  });
  if (!answer.ok) throw new Error(answer.message);
  return fromBase64(answer.value, media);
}

const site = siteFor(location.hostname);
if (site !== undefined)
  void runSocialPage(site, document, {
    send,
    files: (pack) =>
      postFiles(pack.media, {
        viaFrame: (media) => viaFrame(pack, media),
        viaWorker: (media) => viaWorker(pack, media),
      }),
    toast,
    navigate: (url) => location.assign(url),
    href: () => location.href,
    storage: (() => {
      try {
        return sessionStorage;
      } catch {
        return undefined;
      }
    })(),
  });
