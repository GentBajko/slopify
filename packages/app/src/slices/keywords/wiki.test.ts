import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { keywordSpecs, legacyNames } from "./specs.js";

// The wiki page every keyword's help links to (docs/wiki), which must explain each one.
const page = readFileSync(
  new URL("../../../../../docs/wiki/Keywords-Slopify-Fills.md", import.meta.url),
  "utf8",
);

it("explains every keyword Slopify fills, and the two old names", () => {
  for (const spec of keywordSpecs) expect(page).toContain(`{{${spec.name}}}`);
  for (const name of legacyNames) expect(page).toContain(`{{${name}}}`);
});
