import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { catalog } from "./catalog.js";

// happy-dom gives `import.meta.url` a non-file scheme; the directory is still the real one.
const helpDir = import.meta.dirname;
const src = join(helpDir, "..");

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((item) => {
    const path = join(dir, item.name);
    if (item.isDirectory()) return path === helpDir ? [] : sources(path);
    return /\.tsx?$/.test(item.name) && !/\.test\.tsx?$/.test(item.name) ? [path] : [];
  });
}

const files = sources(src).map((path) => ({
  path: relative(src, path),
  text: readFileSync(path, "utf8"),
}));

// A help id is written as a literal where it is used: `tip="play.voice"`, `info="…"`,
// `<InfoTip id="…"`, or `tip: "…"` in a table of rows. Ids built from pieces would hide from
// this test, so there are none.
const usePattern =
  /(?:\btip|\binfo|<InfoTip[^>]*?\bid)\s*[=:]\s*\{?\s*"([a-z][\w-]*(?:\.[\w-]+)+)"/g;

function usedIds(): Map<string, string[]> {
  const used = new Map<string, string[]>();
  for (const file of files) {
    for (const match of file.text.matchAll(usePattern)) {
      const id = match[1] as string;
      used.set(id, [...(used.get(id) ?? []), file.path]);
    }
  }
  return used;
}

describe("the help catalogue", () => {
  it("has every id a screen uses", () => {
    const missing = [...usedIds()]
      .filter(([id]) => !(id in catalog))
      .map(([id, where]) => `${id} (${where.join(", ")})`);
    expect(missing).toEqual([]);
  });

  it("has no entry a screen never uses", () => {
    const everything = files.map((file) => file.text).join("\n");
    const unused = Object.keys(catalog).filter((id) => !everything.includes(`"${id}"`));
    expect(unused).toEqual([]);
  });

  it("keeps every entry short and plain", () => {
    const problems = Object.entries(catalog).flatMap(([id, entry]) => {
      const words = entry.body.split(/\s+/).filter(Boolean).length;
      const found: string[] = [];
      if (entry.title.trim() === "") found.push(`${id}: no title`);
      if (words < 8) found.push(`${id}: ${words} words is too little to explain anything`);
      if (words > 75) found.push(`${id}: ${words} words; keep it near 60`);
      if (/!/.test(entry.body)) found.push(`${id}: no exclamation marks`);
      if (/\bI\b/.test(entry.body)) found.push(`${id}: the app never says "I"`);
      return found;
    });
    expect(problems).toEqual([]);
  });
});
