import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { catalogue } from "../slices/model-checks/catalogue.fake.js";
import { lifecycleReplacement, parseLifecycle, retirementOf } from "./lifecycle.js";

const lifecycle = parseLifecycle(`
schemaVersion: 1
models:
  - family: llm
    provider: openrouter
    id: dear
    retiresOn: "2026-11-30"
    replacement: cheap
  - family: llm
    provider: openrouter
    id: unpriced
    retiresOn: "2026-12-01"
    replacement: gone
    note: a field a later version added
`);

describe("models-lifecycle.yaml", () => {
  it("ships an empty, valid file", () => {
    const bundled = readFileSync(
      new URL("../assets/models-lifecycle.yaml", import.meta.url),
      "utf8",
    );
    expect(parseLifecycle(bundled)).toEqual({ schemaVersion: 1, models: [] });
  });

  it("refuses another schema version and a malformed date, and ignores unknown fields", () => {
    expect(() => parseLifecycle("schemaVersion: 2\nmodels: []")).toThrow();
    expect(() =>
      parseLifecycle(
        "schemaVersion: 1\nmodels:\n  - {family: llm, provider: x, id: y, retiresOn: soon}",
      ),
    ).toThrow();
    expect(lifecycle.models[1]).not.toHaveProperty("note");
  });

  it("says when a model retires and names a live replacement", () => {
    expect(
      retirementOf(lifecycle, catalogue, { family: "llm", provider: "openrouter", model: "dear" }),
    ).toEqual({
      on: "2026-11-30",
      replacement: { id: "cheap", name: "Cheap" },
    });
    expect(
      retirementOf(lifecycle, catalogue, {
        family: "llm",
        provider: "openrouter",
        model: "unpriced",
      }),
    ).toEqual({
      on: "2026-12-01",
      replacement: null,
    });
    expect(
      retirementOf(lifecycle, catalogue, { family: "llm", provider: "openrouter", model: "cheap" }),
    ).toBeUndefined();
  });

  it("is quiet about a model the catalogue already retired", () => {
    const retired = {
      ...catalogue,
      llm: catalogue.llm.map((row) => (row.id === "dear" ? { ...row, deprecated: true } : row)),
    };
    expect(
      retirementOf(lifecycle, retired, { family: "llm", provider: "openrouter", model: "dear" }),
    ).toBeUndefined();
  });

  it("offers the named replacement only when it is live", () => {
    const at = (model: string) => ({ family: "llm", provider: "openrouter", model }) as const;
    expect(lifecycleReplacement(lifecycle, catalogue, at("dear"))).toEqual({
      id: "cheap",
      name: "Cheap",
    });
    expect(lifecycleReplacement(lifecycle, catalogue, at("unpriced"))).toBeUndefined();
    expect(lifecycleReplacement(undefined, catalogue, at("dear"))).toBeUndefined();
  });
});
