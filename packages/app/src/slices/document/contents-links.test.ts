import { expect, it } from "vitest";
import { readDocumentAssets } from "./fonts.js";
import { renderDocument } from "./render.js";
import { builtInTheme } from "./theme.js";

// Reads the finished file the way a PDF reader does: the page tree's order gives each page
// object its page number, and each contents link names the page object it jumps to.
function linkTargets(bytes: Uint8Array): readonly number[] {
  const file = Buffer.from(bytes).toString("latin1");
  const kids = /\/Type \/Pages[\s\S]*?\/Kids \[([^\]]*)\]/.exec(file)?.[1] ?? "";
  const pages = [...kids.matchAll(/(\d+) 0 R/g)].map((match) => match[1]);
  return [...file.matchAll(/\/Dest \[(\d+) 0 R/g)].map((match) => pages.indexOf(match[1]) + 1);
}

it("sends every contents entry of the exported PDF to the page its heading is on", () => {
  const sections = Array.from(
    { length: 30 },
    (_, index) =>
      `## Part ${String(index + 1)}\n\n${"Words that fill the page for a while. ".repeat(20 + index)}`,
  ).join("\n\n");
  for (const theme of ["plain", "dicemaster"] as const) {
    const result = renderDocument({
      title: "Tides",
      articleMarkdown: `# Tides\n\n${sections}`,
      researchNotes: null,
      cover: null,
      theme: builtInTheme(theme),
      writtenOn: new Date("2026-10-04T12:00:00Z"),
      assets: readDocumentAssets(),
    });
    const targets = linkTargets(result.bytes);
    expect(targets).toEqual(result.contents.map((entry) => entry.page));
    // Every target is a real page, and the entries run in reading order.
    for (const page of targets) {
      expect(page).toBeGreaterThan(1);
      expect(page).toBeLessThanOrEqual(result.pages);
    }
    expect(result.contents.slice(0, 30).map((entry) => entry.title)).toEqual(
      Array.from({ length: 30 }, (_, index) => `Part ${String(index + 1)}`),
    );
    expect([...targets.slice(0, 30)].sort((a, b) => a - b)).toEqual(targets.slice(0, 30));
  }
});
