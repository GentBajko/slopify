import { randomUUID } from "node:crypto";
import { mkdirSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Log } from "../../kernel/log.js";
import type { PreviewPicture, PreviewPictures } from "./images.js";
import type { StylePreviewRenderer } from "./render.js";
import { type StylePreviewRequest, stylePreviewSeconds } from "./schema.js";
import { normalizeStylePreview, stylePreviewHash } from "./settings.js";

// Rendered previews are kept in the data folder by the hash of their settings, so a setting
// changed back, or the same style in another project, plays at once. `force` renders again
// anyway. Requests for a preview already being rendered wait for that render instead of
// starting a second one.

export function stylePreviewDir(dataDir: string): string {
  return join(dataDir, "cache", "style-preview");
}

export interface StylePreviewResult {
  readonly hash: string;
  readonly cached: boolean;
  readonly seconds: number;
  // Changes each time the file is rendered, so a player never shows a stale copy.
  readonly version: number;
}

export interface StylePreviews {
  readonly render: (request: StylePreviewRequest) => Promise<StylePreviewResult>;
  // The finished mp4 for a hash, or undefined when there is none.
  readonly file: (
    hash: string,
  ) => { readonly path: string; readonly bytes: number; readonly version: number } | undefined;
}

export interface StylePreviewDeps {
  readonly dir: string;
  readonly render: StylePreviewRenderer;
  readonly log: Log;
  // Finds the picture a request names; without it every preview uses the sample stills.
  readonly pictures?: PreviewPictures | undefined;
  // ceiling: a 6-second low-resolution render takes seconds; two minutes means ffmpeg hung.
  readonly timeoutMs?: number;
  // ceiling: previews are about 100 kB each; the oldest beyond this many are removed.
  readonly keep?: number;
}

const hashPattern = /^[a-f0-9]{64}$/;

export function createStylePreviews(deps: StylePreviewDeps): StylePreviews {
  const inflight = new Map<string, Promise<StylePreviewResult>>();
  const pathOf = (hash: string): string => join(deps.dir, `${hash}.mp4`);
  const file = (hash: string) => {
    if (!hashPattern.test(hash)) return undefined;
    try {
      const stats = statSync(pathOf(hash));
      return stats.isFile() && stats.size > 0
        ? { path: pathOf(hash), bytes: stats.size, version: Math.round(stats.mtimeMs) }
        : undefined;
    } catch {
      return undefined;
    }
  };
  const run = async (
    hash: string,
    settings: ReturnType<typeof normalizeStylePreview>,
    picture: PreviewPicture | undefined,
  ): Promise<StylePreviewResult> => {
    mkdirSync(deps.dir, { recursive: true, mode: 0o700 });
    const work = `${hash}.${randomUUID()}`;
    const part = join(deps.dir, `${work}.part.mp4`);
    // The picture is copied beside the render for its length only, so nothing but the
    // finished previews is kept.
    const still =
      picture === undefined ? undefined : join(deps.dir, `${work}.still${picture.extension}`);
    try {
      if (still !== undefined && picture !== undefined)
        writeFileSync(still, picture.bytes, { mode: 0o600 });
      await deps.render(settings, part, AbortSignal.timeout(deps.timeoutMs ?? 120_000), still);
      renameSync(part, pathOf(hash));
    } finally {
      rmSync(part, { force: true });
      if (still !== undefined) rmSync(still, { force: true });
    }
    prune(deps);
    const saved = file(hash);
    if (saved === undefined)
      throw new Error("The style preview render finished without writing its video.");
    return { hash, cached: false, seconds: stylePreviewSeconds, version: saved.version };
  };
  return {
    file,
    render: (request) => {
      const picture = request.image === undefined ? undefined : deps.pictures?.(request.image);
      const settings = normalizeStylePreview(request, picture?.sha256);
      const hash = stylePreviewHash(settings);
      const running = inflight.get(hash);
      if (running !== undefined) return running;
      const saved = request.force === true ? undefined : file(hash);
      if (saved !== undefined)
        return Promise.resolve({
          hash,
          cached: true,
          seconds: stylePreviewSeconds,
          version: saved.version,
        });
      const started = run(hash, settings, picture).finally(() => {
        inflight.delete(hash);
      });
      inflight.set(hash, started);
      return started;
    },
  };
}

function prune(deps: StylePreviewDeps): void {
  try {
    const kept = readdirSync(deps.dir)
      .filter((name) => /^[a-f0-9]{64}\.mp4$/.test(name))
      .map((name) => ({ name, at: statSync(join(deps.dir, name)).mtimeMs }))
      .toSorted((left, right) => right.at - left.at);
    for (const old of kept.slice(deps.keep ?? 200))
      rmSync(join(deps.dir, old.name), { force: true });
  } catch (error) {
    deps.log.write("warn", "style-preview.prune", {
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}
