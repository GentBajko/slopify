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

export function codexGeneratedImage(
  env: Readonly<NodeJS.ProcessEnv>,
  threadId: string | undefined,
  startedAt: number,
): GeneratedImage {
  if (!z.uuid().safeParse(threadId).success || threadId === undefined)
    throw unavailable("the image job could not be identified");
  const root = join(
    resolve(env.CODEX_HOME || join(env.HOME || homedir(), ".codex")),
    "generated_images",
  );
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
    // generated_images/<thread.started ID>/<sanitized tool call ID>.png.
    const dir = opendirSync(directory);
    let name: string;
    try {
      const entry = dir.readSync();
      if (entry === null) throw unavailable("no image was saved");
      if (dir.readSync() !== null) throw unavailable("more than one file was saved");
      if (!entry.isFile() || !/^[a-zA-Z0-9_-]+\.png$/.test(entry.name))
        throw unavailable("the saved file is not a plain image file");
      name = entry.name;
    } finally {
      dir.closeSync();
    }
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
