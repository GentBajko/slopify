// The published walkthrough (public/assets/play-run.*) is recorded from scripts/walkthrough/
// steps.mjs. A step added, dropped or reworded there means the recording is out of date:
// record it again with `npm run record:walkthrough -w @slopify/site -- --publish`
// (docs/walkthrough.md).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { steps } from "./scripts/walkthrough/steps.mjs";

const vtt = readFileSync(new URL("./public/assets/play-run.vtt", import.meta.url), "utf8");

// The cue texts, in order: each cue is a timing line and the caption under it.
function cueTexts(text) {
  return text
    .split(/\n\n+/)
    .slice(1)
    .map((block) => block.split("\n"))
    .filter((lines) => lines[0]?.includes("-->"))
    .map((lines) => lines.slice(1).join("\n").trim());
}

describe("the published walkthrough", () => {
  it("has one caption per step, in the order the steps run", () => {
    expect(cueTexts(vtt)).toEqual(steps.map((step) => step.caption));
  });
});
