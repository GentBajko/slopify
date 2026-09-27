import { describe, expect, it } from "vitest";
import { applyOpenRouterListing, combineChanges, mergeCatalogue, modelKey } from "./merge.js";
import type { Catalogue } from "./schema.js";
import { parseOpenRouterListing } from "./store.js";

const llm = (id: string, input: number, extra: object = {}) => ({
  provider: "openrouter",
  id,
  name: id,
  enabled: true,
  deprecated: false,
  source: "https://openrouter.ai/api/v1/models",
  keywords: [],
  pricing: { inputPerMillionTokens: input, outputPerMillionTokens: input * 4 },
  llm: { webSearch: false },
  ...extra,
});
const tts = (id: string, maxCharacters: number) => ({
  provider: "inworld",
  id,
  name: id,
  enabled: true,
  deprecated: false,
  source: "https://docs.inworld.ai",
  keywords: [],
  pricing: {},
  tts: { maxCharacters, streaming: true },
});
function catalogue(parts: Partial<Catalogue>): Catalogue {
  return {
    schemaVersion: 1,
    updatedAt: "2026-09-01",
    providers: { openrouter: { maxConcurrent: 3 }, inworld: { maxConcurrent: 5 } },
    llm: [],
    image: [],
    tts: [],
    ...parts,
  };
}

describe("merging the published catalogue", () => {
  it("adds new models, reprices changed ones and flags ones the published list dropped", () => {
    const local = catalogue({ llm: [llm("a", 1), llm("gone", 2), llm("mine", 3)] });
    const published = catalogue({
      updatedAt: "2026-09-20",
      llm: [llm("a", 1.5), llm("new", 4)],
    });
    const known = new Set([
      modelKey("llm", "openrouter", "a"),
      modelKey("llm", "openrouter", "gone"),
    ]);
    const { catalogue: merged, changes, known: next } = mergeCatalogue(local, published, known);
    expect(merged.updatedAt).toBe("2026-09-20");
    expect(merged.llm.map((row) => [row.id, row.deprecated])).toEqual([
      ["a", false],
      ["new", false],
      ["gone", true],
      // Never published: the user's own row stays usable.
      ["mine", false],
    ]);
    expect(changes.added.map((row) => row.id)).toEqual(["new"]);
    expect(changes.retired.map((row) => row.id)).toEqual(["gone"]);
    expect(changes.priced).toEqual([
      expect.objectContaining({
        id: "a",
        before: expect.objectContaining({ inputPerMillionTokens: 1 }),
        after: expect.objectContaining({ inputPerMillionTokens: 1.5 }),
      }),
    ]);
    expect(next.has(modelKey("llm", "openrouter", "new"))).toBe(true);
  });

  it("flags a model the published list marks deprecated, keeps a switched-off model off and a voice model's limit", () => {
    const local = catalogue({
      llm: [llm("old", 1), llm("off", 1, { enabled: false })],
      tts: [tts("voice", 2000)],
    });
    const published = catalogue({
      llm: [llm("old", 1, { deprecated: true }), llm("off", 1)],
      tts: [tts("voice", 5000)],
    });
    const { catalogue: merged, changes } = mergeCatalogue(local, published, new Set());
    expect(changes.retired.map((row) => row.id)).toEqual(["old"]);
    expect(merged.llm.find((row) => row.id === "off")?.enabled).toBe(false);
    expect(merged.tts[0]?.tts.maxCharacters).toBe(2000);
    expect(changes.priced).toEqual([]);
    // A second run over the result changes nothing more.
    const again = mergeCatalogue(merged, published, new Set());
    expect(again.changes).toEqual({ added: [], retired: [], priced: [] });
  });
});

describe("OpenRouter's live list", () => {
  it("reads per-token string prices, skipping variable (-1) prices and malformed rows", () => {
    expect(
      parseOpenRouterListing({
        data: [
          { id: "a", pricing: { prompt: "0.000002", completion: "0.000008" } },
          { id: "router", pricing: { prompt: "-1", completion: "-1" } },
          { pricing: { prompt: "1" } },
          "junk",
        ],
      }),
    ).toEqual([
      { id: "a", promptPerToken: 0.000002, completionPerToken: 0.000008 },
      { id: "router", promptPerToken: undefined, completionPerToken: undefined },
    ]);
    expect(parseOpenRouterListing({ nope: [] })).toEqual([]);
  });

  it("reprices listed models, flags ones OpenRouter no longer serves, and ignores an empty list", () => {
    const local = catalogue({ llm: [llm("a", 1), llm("dropped", 1)] });
    const { catalogue: next, changes } = applyOpenRouterListing(local, [
      { id: "a", promptPerToken: 0.000002, completionPerToken: 0.000004 },
    ]);
    expect(next.llm[0]?.pricing).toMatchObject({
      inputPerMillionTokens: 2,
      outputPerMillionTokens: 4,
    });
    expect(next.llm[1]?.deprecated).toBe(true);
    expect(changes.retired.map((row) => row.id)).toEqual(["dropped"]);
    expect(applyOpenRouterListing(local, []).catalogue).toBe(local);
  });

  it("reports one price change per model across both steps, from the first price to the last", () => {
    const first = { family: "llm" as const, provider: "openrouter", id: "a", name: "a" };
    const combined = combineChanges(
      {
        added: [],
        retired: [],
        priced: [{ ...first, before: { perImage: 1 }, after: { perImage: 2 } }],
      },
      {
        added: [],
        retired: [],
        priced: [{ ...first, before: { perImage: 2 }, after: { perImage: 3 } }],
      },
    );
    expect(combined.priced).toEqual([
      { ...first, before: { perImage: 1 }, after: { perImage: 3 } },
    ]);
  });
});
