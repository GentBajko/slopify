import type { PostMedia } from "./types.js";

// A post's media files, as `File`s for the site's file input. A video comes through the
// extension's hidden frame (`video-frame.ts`), which hands the page the downloaded file in one
// message; pictures, and a video the site's page won't let the frame load, come through the
// worker as base64 (JSON messages), up to `workerMax` bytes.

export const workerMax = 50 * 1024 * 1024;

export interface FileSources {
  readonly viaFrame: (media: PostMedia) => Promise<File>;
  readonly viaWorker: (media: PostMedia) => Promise<File>;
}

const isVideo = (media: PostMedia) => media.kind === "video" || media.kind === "short";

export async function postFiles(
  media: readonly PostMedia[],
  sources: FileSources,
): Promise<readonly File[]> {
  const files: File[] = [];
  for (const one of media) {
    if (!isVideo(one)) {
      files.push(await sources.viaWorker(one));
      continue;
    }
    try {
      files.push(await sources.viaFrame(one));
    } catch (error) {
      if (one.bytes !== null && one.bytes > workerMax)
        throw new Error(
          `Slopify couldn't hand ${one.filename} to this page (${error instanceof Error ? error.message : String(error)}). Download it from Slopify's Copy for YouTube Studio and add it to the post yourself.`,
        );
      files.push(await sources.viaWorker(one));
    }
  }
  return files;
}

export function fromBase64(base64: string, media: PostMedia): File {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let at = 0; at < binary.length; at++) bytes[at] = binary.charCodeAt(at);
  return new File([bytes], media.filename, { type: media.contentType });
}
