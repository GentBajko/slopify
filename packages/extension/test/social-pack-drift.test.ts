import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// `src/social/types.ts` is a hand copy of the app's `slices/social/model.ts` (and its link
// patterns, from `limits.ts`) so the extension builds alone. These checks keep the two from
// drifting: a field added to one must be added to the other.
const here = import.meta.dirname;
const copy = readFileSync(join(here, "../src/social/types.ts"), "utf8");
const app = join(here, "../../app/src/slices/social");
const model = readFileSync(join(app, "model.ts"), "utf8");
const limits = readFileSync(join(app, "limits.ts"), "utf8");

const interfaces = [
  "PostMediaChoice",
  "PostChoice",
  "RedditFields",
  "PostMedia",
  "PostSchedule",
  "PostWarning",
  "PostCount",
  "PostStatus",
  "PostPack",
  "ActivePost",
  "DuePost",
  "LinkLookup",
];
const lists = [
  "socialPlatforms",
  "postTextSources",
  "xTiers",
  "redditPostKinds",
  "postStates",
  "reportedStates",
  "postMediaKinds",
  "mediaShapes",
  "scheduleModes",
];

function keysOf(source: string, name: string): string[] {
  const start = source.indexOf(`export interface ${name} {`);
  if (start < 0) throw new Error(`${name} is missing`);
  const end = source.indexOf("\n}\n", start);
  return source
    .slice(start, end)
    .split("\n")
    .flatMap((line) => /^ {2}readonly (\w+)\??:\s*(.*)$/.exec(line)?.slice(1, 3).join(" ") ?? [])
    .sort();
}

function constOf(source: string, name: string): string {
  const start = source.indexOf(`export const ${name}`);
  if (start < 0) throw new Error(`${name} is missing`);
  return source.slice(start, source.indexOf(";\n", start)).replace(/\s+/g, " ");
}

describe("the extension's copy of the posts", () => {
  for (const name of interfaces)
    it(`${name} has the same fields and types as the app's`, () => {
      const expected = keysOf(model, name);
      expect(expected.length).toBeGreaterThan(1);
      expect(keysOf(copy, name)).toEqual(expected);
    });
  for (const name of lists)
    it(`${name} lists the same values`, () => {
      expect(constOf(copy, name)).toBe(constOf(model, name));
    });
  it("the link patterns are the app's", () => {
    expect(constOf(copy, "linkPatterns")).toBe(constOf(limits, "linkPatterns"));
  });
});
