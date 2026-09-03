import type { Output } from "./model.js";

// The asset name in `/files/:projectId/:asset`. It sits apart from `downloads.ts` because
// the project page builds the same URL for every image, player and download link it
// draws, and `downloads.ts` reads the disk: importing it into the SPA would drag
// `node:fs` and the zip encoder into the browser bundle. Nothing here touches IO.

// An output's role is its asset name; images add their place in the slideshow, and the
// instructions add their stage, those being the two roles a project holds more than one of
// (logic/06 step 4 and logic/07 step 4 both store what the stage sent).
export function assetOf(output: Output): string {
  const asset = output.role.replaceAll("_", "-");
  if (output.role === "instructions") {
    return `${output.stageKind}-${asset}`;
  }
  return output.role === "image" && output.meta.index !== undefined
    ? `${asset}-${String(output.meta.index)}`
    : asset;
}
