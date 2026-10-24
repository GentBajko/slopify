import { statSync } from "node:fs";
import type { DesignFormat } from "../designs/model.js";
import { findDownload } from "../storage/downloads.js";
import { parseMediaFile } from "./media.js";
import type { PostMedia } from "./model.js";
import { postPacks } from "./pack.js";
import type { Reshaper } from "./reshape.js";
import type { SourceDeps } from "./sources.js";

export interface MediaDeps extends SourceDeps {
  readonly reshaper?: Reshaper | undefined;
  // A design's picture in one format (`designs/render.ts`); absent where designs aren't set up.
  readonly renderDesign?:
    | ((
        designId: string,
        format: DesignFormat,
        signal: AbortSignal,
      ) => Promise<
        | { readonly ok: true; readonly path: string }
        | { readonly ok: false; readonly sentence: string }
      >)
    | undefined;
}

export type ServedMedia =
  | {
      readonly ok: true;
      readonly path: string;
      readonly bytes: number;
      readonly contentType: string;
      readonly filename: string;
    }
  | { readonly ok: false; readonly status: 404 | 503; readonly sentence: string };

const gone =
  "That file isn't in the project's posts any more. Close Copy for YouTube Studio, open it again and press Fill again.";

// One file of a project's posts, only when one of its posts lists it: the asset as it is, a
// picture cut to its site's shape (made now the first time), or a design drawn in its format.
export async function serveMedia(
  deps: MediaDeps,
  projectId: string,
  file: string,
  now: Date,
  signal: AbortSignal,
): Promise<ServedMedia> {
  const result = postPacks(deps, projectId, now);
  const listed: PostMedia | undefined = result.ok
    ? result.packs.packs.flatMap((pack) => pack.media).find((one) => one.file === file)
    : undefined;
  const ref = parseMediaFile(file);
  if (listed === undefined || ref === undefined) return { ok: false, status: 404, sentence: gone };
  const done = (path: string): ServedMedia => {
    const stat = statSync(path, { throwIfNoEntry: false });
    return stat?.isFile() === true
      ? {
          ok: true,
          path,
          bytes: stat.size,
          contentType: listed.contentType,
          filename: listed.filename,
        }
      : { ok: false, status: 404, sentence: gone };
  };
  if (ref.kind === "design") {
    if (deps.renderDesign === undefined)
      return {
        ok: false,
        status: 503,
        sentence:
          "Designs can't be drawn in this copy of Slopify. Restart Slopify; if it stays, use Download diagnostics in Settings and report it.",
      };
    const drawn = await deps.renderDesign(ref.id, ref.format, signal);
    return drawn.ok ? done(drawn.path) : { ok: false, status: 404, sentence: drawn.sentence };
  }
  const found = findDownload(deps, projectId, ref.asset);
  if (!found.ok) return { ok: false, status: 404, sentence: gone };
  if (ref.shape === "original") return done(found.download.path);
  if (deps.reshaper === undefined)
    return {
      ok: false,
      status: 503,
      sentence:
        "Pictures can't be cut to the site's shape in this copy of Slopify. Restart Slopify; if it stays, use Download diagnostics in Settings and report it.",
    };
  const cut = await deps.reshaper.picture(projectId, found.download.path, ref.shape, signal);
  return cut.ok ? done(cut.path) : { ok: false, status: 503, sentence: cut.sentence };
}
