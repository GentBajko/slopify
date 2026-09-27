import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// Everything sits on one grid: spacing comes from the scale (`--space-1` to `--space-8`, or
// Tailwind's numbered steps, which line up with it), never a hand-set pixel value. The kit
// owns the few optical exceptions, so it is the one place allowed to write them.
const src = join(import.meta.dirname, "..");

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((item) => {
    const path = join(dir, item.name);
    if (item.isDirectory()) return sources(path);
    return /\.tsx?$/.test(item.name) && !/\.test\.tsx?$/.test(item.name) ? [path] : [];
  });
}

const spacing =
  /(?<=^|[\s"'`:!(])-?(?:p|px|py|pt|pb|pl|pr|ps|pe|m|mx|my|mt|mb|ml|mr|ms|me|gap|gap-x|gap-y|space-x|space-y)-\[\d+(?:\.\d+)?px\]/g;

describe("the grid", () => {
  it("has no arbitrary pixel spacing outside components/kit", () => {
    const offGrid = sources(src)
      .filter((path) => !relative(src, path).startsWith(join("components", "kit")))
      .flatMap((path) =>
        [...readFileSync(path, "utf8").matchAll(spacing)].map(
          (match) => `${relative(src, path)}: ${match[0]}`,
        ),
      );
    expect(offGrid).toEqual([]);
  });

  it("catches the spellings it is meant to", () => {
    expect("px-[10px] sm:gap-[6px] -mx-[18px] bottom-[68px]".match(spacing)).toEqual([
      "px-[10px]",
      "gap-[6px]",
      "-mx-[18px]",
    ]);
  });
});
