import { execFileSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseLifecycle } from "./lifecycle.js";
import { catalogueSchema } from "./schema.js";
import { parseCatalogue } from "./store.js";

// The daily GitHub Action's script, run as the workflow runs it, against a saved OpenRouter
// listing: no network.
const app = fileURLToPath(new URL("../..", import.meta.url));
const fixture = fileURLToPath(new URL("./fixtures/openrouter-models.json", import.meta.url));

function run(assets: string): string {
  return execFileSync(
    process.execPath,
    [
      "--import",
      join(app, "scripts/ts-resolve.mjs"),
      join(app, "scripts/catalogue-build.ts"),
      "--openrouter",
      fixture,
      "--today",
      "2026-10-18",
      "--assets",
      assets,
    ],
    { encoding: "utf8" },
  ).trim();
}

describe("catalogue-build script", () => {
  it("proposes from a saved listing, writes files every installed version can read, and settles", () => {
    const assets = mkdtempSync(join(tmpdir(), "slopify-catalogue-build-"));
    for (const name of ["models.yaml", "models-lifecycle.yaml"])
      copyFileSync(join(app, "src/assets", name), join(assets, name));
    expect(run(assets)).toBe("Models: 1 new, 1 retired, 5 price changes");
    const written = readFileSync(join(assets, "models.yaml"), "utf8");
    expect(written.startsWith("# Curated adapter-compatible models.")).toBe(true);
    const catalogue = catalogueSchema.parse(parseCatalogue(written));
    expect(catalogue.updatedAt).toBe("2026-10-18");
    expect(catalogue.llm.find((row) => row.id === "google/gemini-3.9-flash")?.name).toBe(
      "Google: Gemini 3.9 Flash",
    );
    expect(
      catalogue.llm.find((row) => row.id === "google/gemini-3.1-pro-preview")?.deprecated,
    ).toBe(true);
    expect(catalogue.llm.some((row) => row.id === "someone/else")).toBe(false);
    expect(parseLifecycle(readFileSync(join(assets, "models-lifecycle.yaml"), "utf8"))).toEqual({
      schemaVersion: 1,
      models: [],
    });
    expect(run(assets)).toBe("Models: no changes");
  }, 60_000);
});
