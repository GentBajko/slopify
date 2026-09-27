import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

// The action rules of docs/design-system.md, held by the kit so a new screen can't drift:
// buttons come from components/kit/button, a link wears a button's look only through
// components/kit/link, and a row or card is one target. The kit itself is where the raw
// classes and elements live, so it is the one place allowed to write them.
const src = import.meta.dirname;
const kit = join("components", "kit");

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((item) => {
    const path = join(dir, item.name);
    if (item.isDirectory()) return sources(path);
    return /\.tsx?$/.test(item.name) && !/\.test\.tsx?$/.test(item.name) ? [path] : [];
  });
}

const screens = sources(src)
  .map((path) => ({
    file: relative(src, path).split(sep).join("/"),
    text: readFileSync(path, "utf8"),
  }))
  .filter((one) => !one.file.startsWith(`${kit.split(sep).join("/")}/`));

// Each JSX opening tag of `name`, whole: attributes may hold `=>` and nested braces.
function openingTags(text: string, name: string): string[] {
  const found: string[] = [];
  const start = new RegExp(`<${name}(?=[\\s>/])`, "g");
  for (const match of text.matchAll(start)) {
    let depth = 0;
    let quote: string | undefined;
    let at = match.index + match[0].length;
    for (; at < text.length; at += 1) {
      const char = text[at];
      if (quote !== undefined) {
        if (char === quote) quote = undefined;
      } else if (char === '"' || char === "`") quote = char;
      else if (char === "{") depth += 1;
      else if (char === "}") depth -= 1;
      else if (char === ">" && depth === 0) break;
    }
    found.push(text.slice(match.index, at + 1));
  }
  return found;
}

function offenders(test: (text: string) => readonly string[]): string[] {
  return screens.flatMap(({ file, text }) => test(text).map((what) => `${file}: ${what}`));
}

describe("the kit's action rules", () => {
  it("imports buttons and dialogs from the kit, never the 2.x ui/ versions", () => {
    expect(
      offenders((text) =>
        [...text.matchAll(/from "@\/components\/ui\/(button|dialog)"/g)].map((m) => m[0]),
      ),
    ).toEqual([]);
  });

  it("writes no button class by hand: sl-btn, sl-key and buttonClass() belong to the kit", () => {
    expect(
      offenders((text) =>
        [...text.matchAll(/\bsl-(?:btn|key)\b[\w-]*|\bbuttonClass\(/g)].map((m) => m[0]),
      ),
    ).toEqual([]);
  });

  it("gives no anchor an onClick: an action is a Button, a link goes somewhere", () => {
    expect(
      offenders((text) => openingTags(text, "a").filter((tag) => /\sonClick=/.test(tag))),
    ).toEqual([]);
  });

  it("builds no raw <button> outside the kit, apart from the shell's search field", () => {
    const allowed = new Set(["components/shell.tsx"]);
    expect(
      offenders((text) => openingTags(text, "button")).filter(
        (line) => !allowed.has(line.slice(0, line.indexOf(":"))),
      ),
    ).toEqual([]);
    // The one allowed: the search field in the rail, which looks like a field, not a button.
    const shell = screens.find((one) => one.file === "components/shell.tsx")?.text ?? "";
    expect(openingTags(shell, "button")).toEqual([
      expect.stringContaining('className="sl-searchbtn"'),
    ]);
  });

  it("selects a ListRow through onSelect, not a button hand-made into its title", () => {
    expect(
      offenders((text) =>
        openingTags(text, "ListRow").filter((tag) => /title=\{\s*<(button|Button)\b/.test(tag)),
      ),
    ).toEqual([]);
  });

  it("puts no click handler on a row or card element: the row's link or button is its target", () => {
    expect(
      offenders((text) =>
        ["li", "tr", "article", "figure"].flatMap((name) =>
          openingTags(text, name).filter((tag) => /\sonClick=/.test(tag)),
        ),
      ),
    ).toEqual([]);
  });

  it("reads whole tags, arrows and nested braces included", () => {
    expect(openingTags('<a href="x" onClick={() => go({ a: 1 })}>go</a>', "a")).toEqual([
      '<a href="x" onClick={() => go({ a: 1 })}>',
    ]);
    expect(openingTags("<abbr title='x'>", "a")).toEqual([]);
  });
});
