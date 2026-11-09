import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { describe, expect, it } from "vitest";

// The web package runs in a browser: nothing it imports for its values may reach a `node:`
// builtin. A server module that slips in takes its whole graph with it, and the screen dies
// the moment it calls one — 4.3.1 shipped Edit settings crashing on `createHash is not a
// function`, because a form read its pronunciation count from a module that hashes with
// `node:crypto`. Types are erased, so `import type` is free; values are not.

const webRoot = "packages/web/src";
const appRoot = "packages/app/src";

// Screens reached from the router, which is every screen the app can open.
const entries = ["packages/web/src/main.tsx", "packages/web/src/router.tsx"];

const importStatement = /import\s+(type\s+)?([\s\S]*?)\s*from\s*"([^"]+)"/g;

function resolveModule(from: string, specifier: string): string | undefined {
  const base = specifier.startsWith("@app/")
    ? join(appRoot, specifier.slice("@app/".length))
    : specifier.startsWith("@/")
      ? join(webRoot, specifier.slice("@/".length))
      : specifier.startsWith(".")
        ? normalize(join(dirname(from), specifier))
        : undefined;
  if (base === undefined) return undefined;
  const withoutJs = base.endsWith(".js") ? base.slice(0, -".js".length) : base;
  for (const candidate of [
    base,
    `${withoutJs}.ts`,
    `${withoutJs}.tsx`,
    `${base}.ts`,
    `${base}.tsx`,
  ])
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  return undefined;
}

// A clause whose every specifier is `type X` is type-only too, the same as `import type`.
function typeOnly(isTypeImport: string | undefined, clause: string): boolean {
  if (isTypeImport !== undefined) return true;
  const specifiers = clause
    .trim()
    .replace(/^\{|\}$/g, "")
    .split(",")
    .map((one) => one.trim())
    .filter((one) => one !== "");
  return specifiers.length > 0 && specifiers.every((one) => one.startsWith("type "));
}

function nodeImportChains(): readonly string[] {
  const chains: string[] = [];
  const seen = new Set<string>();
  const walk = (file: string, path: readonly string[]): void => {
    if (seen.has(file)) return;
    seen.add(file);
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(importStatement)) {
      const [, isTypeImport, clause = "", specifier = ""] = match;
      if (typeOnly(isTypeImport, clause)) continue;
      if (specifier.startsWith("node:")) {
        chains.push([...path, file, specifier].join("\n    -> "));
        continue;
      }
      const next = resolveModule(file, specifier);
      if (next !== undefined && !next.includes(".test.")) walk(next, [...path, file]);
    }
  };
  for (const entry of entries) walk(entry, []);
  return chains;
}

describe("the web bundle", () => {
  it("never imports a node: builtin for its values", () => {
    expect(nodeImportChains()).toEqual([]);
  });
});
