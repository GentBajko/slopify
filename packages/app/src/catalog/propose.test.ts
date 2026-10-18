import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { catalogue as fixture } from "../slices/model-checks/catalogue.fake.js";
import type { Lifecycle } from "./lifecycle.js";
import {
  newPerRun,
  type OpenRouterModel,
  proposalSummary,
  proposeCatalogue,
  readOpenRouterModels,
} from "./propose.js";
import { catalogueSchema } from "./schema.js";
import { parseCatalogue } from "./store.js";

const today = "2026-10-18";
const day = 86_400;
const now = Date.parse(`${today}T00:00:00Z`) / 1000;
const none: Lifecycle = { schemaVersion: 1, models: [] };
// The fixture's OpenRouter ids carry no vendor, so they are given one here.
const catalogue = {
  ...fixture,
  llm: fixture.llm.map((row) => ({ ...row, id: `vendor/${row.id}` })),
};
const listed = (id: string, over: Partial<OpenRouterModel> = {}): OpenRouterModel => ({
  id,
  name: id,
  created: now - 400 * day,
  promptPerToken: 0.000001,
  completionPerToken: 0.000004,
  inputs: ["text"],
  outputs: ["text"],
  ...over,
});
const all = [
  listed("vendor/cheap"),
  listed("vendor/dear", { promptPerToken: 0.000015, completionPerToken: 0.000075 }),
  listed("vendor/unpriced", { promptPerToken: undefined, completionPerToken: undefined }),
];

describe("proposeCatalogue", () => {
  it("changes nothing when OpenRouter says what the list says", () => {
    const proposal = proposeCatalogue({ catalogue, lifecycle: none }, { openRouter: all, today });
    expect(proposal).toMatchObject({ added: [], priced: [], retired: [], changed: false });
    expect(proposal.catalogue).toEqual(catalogue);
  });

  it("follows prices, context, output limit and thinking, and bumps updatedAt", () => {
    const proposal = proposeCatalogue(
      { catalogue, lifecycle: none },
      {
        today,
        openRouter: [
          listed("vendor/cheap", {
            promptPerToken: 0.000002,
            completionPerToken: 0.000008,
            contextLength: 200_000,
            maxOutputTokens: 32_000,
            reasoning: true,
          }),
          ...all.slice(1),
        ],
      },
    );
    const cheap = proposal.catalogue.llm.find((row) => row.id === "vendor/cheap");
    expect(cheap?.pricing).toMatchObject({ inputPerMillionTokens: 2, outputPerMillionTokens: 8 });
    expect(cheap?.pricing.note).toContain("read 2026-10-18");
    expect(cheap?.llm).toMatchObject({
      contextTokens: 200_000,
      maxOutputTokens: 32_000,
      thinking: { low: { effort: "low" } },
    });
    expect(proposal.priced).toEqual(["vendor/cheap"]);
    expect(proposal.catalogue.updatedAt).toBe(today);
    expect(proposal.changed).toBe(true);
  });

  it("proposes new text models of known vendors from the last 60 days, newest first, at most 10", () => {
    const fresh = Array.from({ length: 12 }, (_, n) =>
      listed(`vendor/new-${String(n)}`, { created: now - n * day }),
    );
    const proposal = proposeCatalogue(
      { catalogue, lifecycle: none },
      {
        today,
        openRouter: [
          ...all,
          ...fresh,
          listed("stranger/model", { created: now }),
          listed("vendor/old", { created: now - 61 * day }),
          listed("vendor/free:free", { created: now }),
          listed("vendor/image", { created: now, outputs: ["image"] }),
          listed("vendor/mixed", { created: now, outputs: ["text", "image"] }),
          listed("vendor/unpriced-new", { created: now, promptPerToken: undefined }),
        ],
      },
    );
    expect(proposal.added).toEqual(fresh.slice(0, newPerRun).map((row) => row.id));
    const row = proposal.catalogue.llm.find((one) => one.id === "vendor/new-0");
    expect(row).toMatchObject({
      provider: "openrouter",
      enabled: true,
      deprecated: false,
      keywords: ["llm"],
      llm: { webSearch: false },
    });
  });

  it("retires a model OpenRouter no longer lists, but never on an empty listing", () => {
    expect(
      proposeCatalogue({ catalogue, lifecycle: none }, { openRouter: all.slice(1), today }).retired,
    ).toEqual(["vendor/cheap"]);
    const empty = proposeCatalogue({ catalogue, lifecycle: none }, { openRouter: [], today });
    expect(empty.retired).toEqual([]);
    expect(empty.changed).toBe(false);
  });

  it("retires what the lifecycle list says is due, and drops its entry", () => {
    const lifecycle: Lifecycle = {
      schemaVersion: 1,
      models: [
        { family: "image", provider: "fal", id: "flux", retiresOn: "2026-10-18" },
        { family: "tts", provider: "elevenlabs", id: "v1", retiresOn: "2026-11-01" },
      ],
    };
    const proposal = proposeCatalogue({ catalogue, lifecycle }, { openRouter: all, today });
    expect(proposal.retired).toEqual(["flux"]);
    expect(proposal.catalogue.image.find((row) => row.id === "flux")?.deprecated).toBe(true);
    expect(proposal.lifecycle.models.map((row) => row.id)).toEqual(["v1"]);
  });

  it("keeps the shipped catalogue valid under the v1 schema older installs read", () => {
    const shipped = parseCatalogue(
      readFileSync(new URL("../assets/models.yaml", import.meta.url), "utf8"),
    );
    const proposal = proposeCatalogue(
      { catalogue: shipped, lifecycle: none },
      {
        today,
        openRouter: [
          ...shipped.llm.map((row) =>
            listed(row.id, { contextLength: 100_000, maxOutputTokens: 8000, reasoning: true }),
          ),
          listed("google/gemini-9", { created: now }),
        ],
      },
    );
    expect(() => catalogueSchema.parse(proposal.catalogue)).not.toThrow();
    expect(proposal.added).toEqual(["google/gemini-9"]);
  });
});

describe("the proposal's words and OpenRouter's listing", () => {
  it("summarises like the PR title", () => {
    expect(proposalSummary({ added: ["a", "b", "c"], retired: ["d"], priced: ["e", "f"] })).toBe(
      "Models: 3 new, 1 retired, 2 price changes",
    );
    expect(proposalSummary({ added: [], retired: [], priced: ["e"] })).toBe(
      "Models: 0 new, 0 retired, 1 price change",
    );
  });

  it("reads OpenRouter's full metadata loosely", () => {
    expect(
      readOpenRouterModels({
        data: [
          {
            id: "vendor/x",
            name: "X",
            created: 1700000000,
            context_length: 128000,
            pricing: { prompt: "0.000001", completion: "0.000002", input_cache_read: "0.0000001" },
            architecture: { input_modalities: ["text", "image"], output_modalities: ["text"] },
            top_provider: { max_completion_tokens: 16000 },
            supported_parameters: ["reasoning", "tools"],
          },
          { id: "vendor/y", pricing: { prompt: "-1" } },
          { id: 3 },
          "junk",
        ],
      }),
    ).toEqual([
      {
        id: "vendor/x",
        name: "X",
        created: 1700000000,
        contextLength: 128000,
        maxOutputTokens: 16000,
        promptPerToken: 0.000001,
        completionPerToken: 0.000002,
        cachedPerToken: 0.0000001,
        inputs: ["text", "image"],
        outputs: ["text"],
        reasoning: true,
      },
      { id: "vendor/y", reasoning: false },
    ]);
    expect(readOpenRouterModels("nope")).toEqual([]);
  });
});
