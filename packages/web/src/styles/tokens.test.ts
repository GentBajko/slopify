import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// index.css repeats the light theme once under prefers-color-scheme and once under the
// Settings override; plain CSS cannot share the block, so this keeps the copies honest.
const css = readFileSync(join(import.meta.dirname, "index.css"), "utf8");

function block(start: string): Map<string, string> {
  const from = css.indexOf(start);
  expect(from, start).toBeGreaterThanOrEqual(0);
  const open = from + start.length;
  const body = css.slice(open, css.indexOf("}", open));
  return new Map(
    [...body.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((match) => [match[1] ?? "", match[2] ?? ""]),
  );
}

describe("the token sheet", () => {
  it("keeps the two light blocks identical", () => {
    const media = block(':root:not([data-theme="dark"]) {');
    const named = block(':root[data-theme="light"] {');
    expect(media.size).toBeGreaterThan(20);
    expect(named).toEqual(media);
  });

  it("gives every light value a dark default", () => {
    const theme = block("@theme static {");
    for (const name of block(':root[data-theme="light"] {').keys()) {
      expect(theme.has(name), name).toBe(true);
    }
  });

  it("points every deprecated 2.x colour at a 3.0 token or a fixed value", () => {
    const theme = block("@theme static {");
    for (const name of ["--color-bg", "--color-panel", "--color-panel2", "--color-ink2"]) {
      expect(theme.get(name)).toMatch(/^var\(--color-/);
    }
  });
});
