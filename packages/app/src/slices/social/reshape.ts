import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
} from "node:fs";
import { join } from "node:path";
import type { Log } from "../../kernel/log.js";
import type { Paths } from "../../kernel/paths.js";
import { coverCrop } from "../designs/frames.js";
import { pictureSize } from "../designs/picture-size.js";
import type { RenderRun } from "../video/ffmpeg.js";
import type { MediaShape } from "./model.js";

// Pictures cut to a site's shape (Instagram's 4:5), made the first time a post asks for them
// and kept: free, local, in a child ffmpeg off the server's thread. Never a video: re-encoding
// a whole video would take as long as rendering it, so a video keeps its shape and the pack
// warns instead.

// Raised when the cut changes, so every kept copy is made again.
const reshapeVersion = 1;

const frames: Readonly<Record<Exclude<MediaShape, "original">, { width: number; height: number }>> =
  {
    "1:1": { width: 1080, height: 1080 },
    "4:5": { width: 1080, height: 1350 },
    "9:16": { width: 1080, height: 1920 },
    "16:9": { width: 1920, height: 1080 },
  };

export const socialDir = (paths: Pick<Paths, "dataDir">, projectId: string): string =>
  join(paths.dataDir, "social", projectId);

// The ffmpeg arguments: scaled to cover the frame, cut around the centre, saved as a JPEG. A
// picture whose size can't be read is cut by ffmpeg's own cover fit, which centres the same way.
export function reshapeArgs(input: {
  readonly source: string;
  readonly size: { readonly width: number; readonly height: number } | undefined;
  readonly shape: Exclude<MediaShape, "original">;
  readonly output: string;
}): string[] {
  const frame = frames[input.shape];
  const size = `${String(frame.width)}:${String(frame.height)}`;
  const chain =
    input.size === undefined
      ? [`scale=${size}:force_original_aspect_ratio=increase:flags=lanczos`, `crop=${size}`]
      : ((crop) => [
          `scale=${String(crop.scaleWidth)}:${String(crop.scaleHeight)}:flags=lanczos`,
          `crop=${size}:${String(crop.x)}:${String(crop.y)}`,
        ])(coverCrop(input.size, frame, { x: 0.5, y: 0.5 }));
  return [
    ...["-hide_banner", "-nostdin", "-loglevel", "error", "-y", "-i", input.source],
    ...["-vf", [...chain, "format=yuvj420p"].join(","), "-frames:v", "1", "-q:v", "2"],
    input.output,
  ];
}

export interface ReshapeDeps {
  readonly paths: Pick<Paths, "dataDir">;
  readonly ffmpeg: string;
  readonly runFfmpeg: (run: RenderRun) => Promise<void>;
  readonly log: Log;
}

export type Reshaped =
  | { readonly ok: true; readonly path: string }
  | { readonly ok: false; readonly sentence: string };

export interface Reshaper {
  readonly picture: (
    projectId: string,
    source: string,
    shape: Exclude<MediaShape, "original">,
    signal: AbortSignal,
  ) => Promise<Reshaped>;
}

export function createReshaper(deps: ReshapeDeps): Reshaper {
  let queue: Promise<unknown> = Promise.resolve();
  const oneAtATime = <T>(work: () => Promise<T>): Promise<T> => {
    const next = queue.then(work, work);
    queue = next.catch(() => undefined);
    return next;
  };
  return {
    picture: (projectId, source, shape, signal) =>
      oneAtATime(async (): Promise<Reshaped> => {
        const stat = statSync(source, { throwIfNoEntry: false });
        if (stat === undefined || !stat.isFile())
          return {
            ok: false,
            sentence:
              "The picture isn't on disk any more. Reload Prepare upload; if it is still missing, make the project's images again.",
          };
        const key = createHash("sha256")
          .update(JSON.stringify([reshapeVersion, source, stat.size, stat.mtimeMs, shape]))
          .digest("hex")
          .slice(0, 32);
        const dir = socialDir(deps.paths, projectId);
        const target = join(dir, `${key}.jpg`);
        if (existsSync(target)) return { ok: true, path: target };
        mkdirSync(dir, { recursive: true, mode: 0o700 });
        const work = mkdtempSync(join(dir, ".work-"));
        try {
          await deps.runFfmpeg({
            bin: deps.ffmpeg,
            cwd: work,
            args: reshapeArgs({
              source,
              size: pictureSize(readFileSync(source)),
              shape,
              output: "out.jpg",
            }),
            signal,
            log: deps.log,
            onProgress: () => undefined,
          });
          renameSync(join(work, "out.jpg"), target);
          return { ok: true, path: target };
        } catch (error) {
          deps.log.write("warn", "social.reshape", {
            projectId,
            detail: error instanceof Error ? error.message : String(error),
          });
          return {
            ok: false,
            sentence: `The picture couldn't be cut to ${shape} because ffmpeg stopped with an error. Reload Prepare upload to try again; if it fails again, use Download diagnostics in Settings and report it.`,
          };
        } finally {
          rmSync(work, { recursive: true, force: true });
        }
      }),
  };
}

// A project's kept copies, removed with the project.
export function dropReshaped(paths: Pick<Paths, "dataDir">, projectId: string): void {
  rmSync(socialDir(paths, projectId), { recursive: true, force: true });
}
