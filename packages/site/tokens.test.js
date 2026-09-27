import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// slopify.stream and the app are one product, so the site's :root copies the app's tokens.
// The app's sheet (packages/web/src/styles/index.css) is the source of truth; the site names
// the same tokens without Tailwind's namespace (`--color-ground` is `--ground`). This fails
// when a copied value drifts, so a change to the app's palette cannot miss the site.
const site = readFileSync(new URL("./public/styles.css", import.meta.url), "utf8");
const app = readFileSync(new URL("../web/src/styles/index.css", import.meta.url), "utf8");

/** The custom properties declared directly inside the block that opens with `start`. */
function block(css, start) {
  const from = css.indexOf(start);
  expect(from, start).toBeGreaterThanOrEqual(0);
  const open = from + start.length;
  const body = css.slice(open, css.indexOf("}", open)).replace(/\/\*[\s\S]*?\*\//g, "");
  return new Map(
    [...body.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((match) => [match[1], match[2]]),
  );
}

/** The app's tokens under the site's names: `--color-` drops away, everything else stays. */
function unprefixed(tokens) {
  return new Map([...tokens].map(([name, value]) => [name.replace(/^--color-/, "--"), value]));
}

/** Spelling differences that are not value differences: quotes, spaces, `12%` for `0.12`. */
function normal(value) {
  return value
    .replace(/var\(--color-/g, "var(--")
    .replace(/"/g, "")
    .replace(/\/\s*(\d+)%/g, (_, percent) => `/ ${Number(percent) / 100}`)
    .replace(/\s+/g, " ")
    .trim();
}

// Site-only helpers, not design tokens.
const siteOnly = new Set(["--step"]);

function compare(siteTokens, appTokens) {
  expect(siteTokens.size).toBeGreaterThan(10);
  for (const [name, value] of siteTokens) {
    if (siteOnly.has(name)) continue;
    expect(appTokens.has(name), `${name} is not an app token`).toBe(true);
    expect(normal(value), name).toBe(normal(appTokens.get(name)));
  }
}

describe("the site's tokens", () => {
  it("match the app's dark (default) tokens", () => {
    const appDark = new Map([
      ...unprefixed(block(app, "@theme static {")),
      ...block(app, "\n:root {"),
    ]);
    compare(block(site, "\n:root {"), appDark);
  });

  it("match the app's light tokens", () => {
    const appLight = unprefixed(block(app, ':root[data-theme="light"] {'));
    compare(block(site, "@media (prefers-color-scheme: light) {\n  :root {"), appLight);
  });
});
