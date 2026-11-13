import { closeSync, openSync, readSync } from "node:fs";
import { errorText } from "../../kernel/errors.js";
import type { Log } from "../../kernel/log.js";
import { pictureSize } from "../designs/picture-size.js";
import type { Shot } from "./edit-list.js";
import type { StillSize, StillSizes } from "./move.js";

// A PNG states its size in its first 24 bytes; a JPEG after its metadata, which a camera's
// thumbnail and colour profile can make a few hundred kilobytes.
const headBytes = 512 * 1024;

// Each still's own size, from the start of its file: a still with no more pixels than the
// frame is sampled from a smaller base (`move.ts`). One whose size cannot be read is left
// out and treated as a large one, which loses nothing and only costs time.
export function stillSizes(shots: readonly Shot[], log: Log): StillSizes {
  const sizes = new Map<string, StillSize>();
  const seen = new Set<string>();
  const head = Buffer.alloc(headBytes);
  for (const { source } of shots) {
    if (source.kind !== "image" || seen.has(source.path)) continue;
    seen.add(source.path);
    try {
      const file = openSync(source.path, "r");
      try {
        const size = pictureSize(head.subarray(0, readSync(file, head, 0, head.length, 0)));
        if (size !== undefined) sizes.set(source.path, size);
      } finally {
        closeSync(file);
      }
    } catch (error) {
      // The render refuses a still it cannot open, in ffmpeg's own words; this only notes it.
      log.write("warn", "video.still", {
        detail: `could not read the size of ${source.path}: ${errorText(error)}`,
      });
    }
  }
  return sizes;
}
