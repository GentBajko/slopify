import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// `src/pack.ts` is a hand copy of the app's `slices/studio/model.ts` so the extension builds
// alone. These keys keep the two from drifting: a field added to one must be added to the
// other, or named here as left out on purpose.
const here = import.meta.dirname;
const copy = readFileSync(join(here, "../src/pack.ts"), "utf8");
const original = readFileSync(join(here, "../../app/src/slices/studio/model.ts"), "utf8");

// The extension never reads these, so the copy leaves them out.
const leftOut: Readonly<Record<string, readonly string[]>> = {
  PackFile: [],
  PackItem: ["pickable"],
};

function keysOf(source: string, name: string): string[] {
  const start = source.indexOf(`export interface ${name} {`);
  if (start < 0) throw new Error(`${name} is missing`);
  const end = source.indexOf("\n}\n", start);
  return source
    .slice(start, end)
    .split("\n")
    .flatMap((line) => /^ {2}readonly (\w+)\??:/.exec(line)?.[1] ?? [])
    .sort();
}

describe("the extension's copy of the upload pack", () => {
  for (const name of Object.keys(leftOut)) {
    it(`${name} has the same fields as the app's`, () => {
      const omitted = leftOut[name] ?? [];
      const expected = keysOf(original, name).filter((key) => !omitted.includes(key));
      expect(expected.length).toBeGreaterThan(4);
      expect(keysOf(copy, name)).toEqual(expected);
    });
  }
});
