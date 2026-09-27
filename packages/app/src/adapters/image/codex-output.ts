import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  opendirSync,
  openSync,
  readSync,
  realpathSync,
} from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { z } from "zod";
import type { GeneratedImage } from "../../kernel/ports/image.js";
import { isProviderError, providerError } from "../../kernel/ports/model.js";
import { sniffImage } from "./bytes.js";

const maxOutputBytes = 32 * 1024 * 1024;

function unavailable(detail: string): Error {
  return providerError({
    kind: "unavailable",
    message: `The Codex CLI finished, but Slopify could not collect the image: ${detail}. Use Retry stage to make it again (this uses your Codex quota again).`,
  });
}

// A thread that drew more than this is not an image job any more.
const maxImagesPerThread = 50;
const imageName = /^[a-zA-Z0-9_-]+\.png$/;

function imagesRoot(env: Readonly<NodeJS.ProcessEnv>): string {
  return join(resolve(env.CODEX_HOME || join(env.HOME || homedir(), ".codex")), "generated_images");
}

function latestImage(directory: string): string {
  const dir = opendirSync(directory);
  let latest: { readonly name: string; readonly at: number } | undefined;
  let count = 0;
  try {
    for (let entry = dir.readSync(); entry !== null; entry = dir.readSync()) {
      if (++count > maxImagesPerThread) throw unavailable("far too many files were saved");
      if (!entry.isFile() || !imageName.test(entry.name))
        throw unavailable("the saved file is not a plain image file");
      const at = lstatSync(join(directory, entry.name)).mtimeMs;
      if (latest === undefined || at > latest.at || (at === latest.at && entry.name > latest.name))
        latest = { name: entry.name, at };
    }
  } finally {
    dir.closeSync();
  }
  if (latest === undefined) throw unavailable("no image was saved");
  return latest.name;
}

// How many images this job's thread has drawn so far, for its progress line. Never throws:
// a folder not made yet, or one being written, counts what it can.
export function codexImageCount(env: Readonly<NodeJS.ProcessEnv>, threadId: string): number {
  if (!z.uuid().safeParse(threadId).success) return 0;
  try {
    const directory = join(imagesRoot(env), threadId);
    const entry = lstatSync(directory);
    if (!entry.isDirectory() || entry.isSymbolicLink()) return 0;
    const dir = opendirSync(directory);
    let count = 0;
    try {
      for (let one = dir.readSync(); one !== null; one = dir.readSync())
        if (imageName.test(one.name)) count++;
    } finally {
      dir.closeSync();
    }
    return count;
  } catch {
    return 0;
  }
}

export function codexGeneratedImage(
  env: Readonly<NodeJS.ProcessEnv>,
  threadId: string | undefined,
  startedAt: number,
): GeneratedImage {
  if (!z.uuid().safeParse(threadId).success || threadId === undefined)
    throw unavailable("the image job could not be identified");
  const root = imagesRoot(env);
  const directory = join(root, threadId);
  try {
    for (const path of [root, directory]) {
      const entry = lstatSync(path);
      if (!entry.isDirectory() || entry.isSymbolicLink())
        throw unavailable("Codex's image folder is not a plain folder");
    }
    const canonical = realpathSync(directory);
    if (canonical !== join(realpathSync(root), threadId))
      throw unavailable("Codex's image folder moved while it was being read");
    // Codex 0.155.1 omits image items from exec JSONL. Its artifact contract is
    // generated_images/<thread.started ID>/<sanitized tool call ID>.png. An agent that reviews
    // its work may draw several in its one thread; the last one it drew is its answer, so the
    // newest file wins (the name breaks a tie, the call IDs being in no useful order).
    const name = latestImage(directory);
    const path = join(directory, name);
    const before = lstatSync(path);
    if (!before.isFile() || before.isSymbolicLink() || realpathSync(path) !== join(canonical, name))
      throw unavailable("the saved file is not a plain image file");
    const fd = openSync(
      path,
      constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0),
    );
    try {
      const stat = fstatSync(fd);
      if (
        !stat.isFile() ||
        stat.nlink !== 1 ||
        stat.dev !== before.dev ||
        stat.ino !== before.ino ||
        stat.size === 0 ||
        stat.size > maxOutputBytes ||
        stat.mtimeMs < Math.floor(startedAt / 1000) * 1000
      )
        throw unavailable(
          "the saved file is empty, too large, older than this job, or not a plain file",
        );
      const bytes = Buffer.alloc(stat.size + 1);
      let length = 0;
      while (length < bytes.length) {
        const count = readSync(fd, bytes, length, bytes.length - length, length);
        if (count === 0) break;
        length += count;
      }
      const after = fstatSync(fd);
      if (
        length !== stat.size ||
        after.size !== stat.size ||
        after.mtimeMs !== stat.mtimeMs ||
        after.ctimeMs !== stat.ctimeMs ||
        realpathSync(directory) !== canonical
      )
        throw unavailable("the file changed while it was being read");
      const image = bytes.subarray(0, length);
      const mime = sniffImage(image);
      if (mime === undefined) throw unavailable("the saved file is not a PNG or JPEG image");
      return { bytes: image, mime };
    } finally {
      closeSync(fd);
    }
  } catch (error) {
    if (isProviderError(error)) throw error;
    throw unavailable("the saved file could not be read");
  }
}
