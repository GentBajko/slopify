import { existsSync } from "node:fs";
import { basename } from "node:path";
import type { RevisionDeps, RevisionView } from "../revisions/model.js";
import { assetPathOrUndefined } from "../revisions/mutation-assets.js";
import { outputPath } from "../storage/layout.js";

// The file behind a picture the article names (`![alt](maps/relief.png)`): an image uploaded
// to the project under that file name. An article's pictures are otherwise web addresses
// Slopify never fetches, so a figure without its upload is described and drawn from its
// caption alone.
export function articlePicture(
  deps: Pick<RevisionDeps, "db" | "paths">,
  view: RevisionView,
  named: string | undefined,
): string | undefined {
  if (named === undefined) return undefined;
  const name = basename((named.split(/[?#]/)[0] ?? "").replace(/\\/g, "/")).toLowerCase();
  if (name === "") return undefined;
  for (const image of Object.values(view.revision.content.imageDefinitions)) {
    if (image.source !== "provide" || image.assetId === null) continue;
    const path = assetPathOrUndefined(deps, view.revision.projectId, image.assetId);
    if (path === undefined || basename(path).toLowerCase() !== name) continue;
    const file = outputPath(deps.paths, view.revision.projectId, path);
    if (existsSync(file)) return file;
  }
  return undefined;
}
