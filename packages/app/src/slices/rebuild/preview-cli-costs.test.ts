import { describe, expect, it } from "vitest";
import type { Catalogue } from "../../catalog/schema.js";
import type { RunConfig } from "../admission/model.js";
import { estimateRequests } from "../estimate/index.js";
import type { RevisionContent } from "../revisions/model.js";
import { planDependencies } from "./dependencies.js";
import { buildRecipes } from "./recipe-build.js";
import { config, content, emptyView } from "./recipe-fixture.js";
import { priceRecipes } from "./recipe-work.js";

// A rebuild on command-line providers: every step runs on the user's plan, so the rebuild
// review must show $0 with the API figure beside it, never "unknown cost", as Play's review
// does for the same steps.
const cli: RunConfig = {
  ...config,
  sources: {
    ...config.sources,
    article: "generate",
    thumbnail: "prompt_by_llm",
  },
  llm: { provider: "claude-code", model: "sonnet" },
  images: { provider: "codex-image", model: "codex-imagegen" },
  thumbnailPrompt: "Thumbnail",
  rendered: { article: "Write an article.", thumbnailPrompt: "A thumbnail for {{Topic}}." },
};
const drawn: RevisionContent = { ...content, articleMarkdown: undefined };
// The API models a CLI row is priced against; the execution snapshot leaves them out.
const catalogue: Catalogue = {
  schemaVersion: 1,
  updatedAt: "2026-09-27",
  providers: {},
  llm: [
    {
      provider: "openrouter",
      id: "anthropic/claude-sonnet-4.5",
      name: "Claude Sonnet 4.5",
      enabled: true,
      deprecated: false,
      source: "https://example.test",
      keywords: [],
      pricing: { inputPerMillionTokens: 3, outputPerMillionTokens: 15 },
      llm: { webSearch: false },
    },
  ],
  tts: [],
  image: [],
};

function priced(c: RunConfig) {
  const view = emptyView(c, drawn);
  const recipes = buildRecipes({
    config: c,
    content: drawn,
    manifest: view,
    resolved: { articleMarkdown: null, researchNotes: null },
  });
  return planDependencies(recipes, []).flatMap((work) =>
    priceRecipes(
      work,
      recipes.find((recipe) => recipe.key === work.key),
      c,
    ),
  );
}

describe("rebuild estimate on CLI providers", () => {
  it("prices a step built only when it runs on the plan, never as unknown", () => {
    const requests = priced(cli);
    const deferred = requests.find((row) => row.stage === "thumbnail:image");
    expect(deferred).toMatchObject({ kind: "image", provider: "codex-image" });
    const estimate = estimateRequests(requests, catalogue);
    expect(estimate.unknown).toBe(0);
    for (const row of estimate.rows.filter((one) => one.onPlan === true)) {
      expect(row.low).toBe(0);
      expect(row.high).toBe(0);
    }
    const prompt = estimate.rows.find((row) => row.stage === "thumbnail:prompt");
    expect(prompt).toMatchObject({ onPlan: true, low: 0, high: 0 });
    // The Claude Code call carries what the same tokens cost through the API.
    expect(prompt?.apiLow).toBeGreaterThan(0);
    expect(estimate.low).toBe(0);
    expect(estimate.high).toBe(0);
  });

  it("keeps a keyed provider's step it cannot size as unknown", () => {
    const keyed: RunConfig = {
      ...cli,
      llm: { provider: "text", model: "text-model" },
      images: { provider: "fal", model: "image-model" },
    };
    const estimate = estimateRequests(priced(keyed), catalogue);
    expect(estimate.unknown).toBeGreaterThan(0);
    expect(estimate.rows.some((row) => row.onPlan === true)).toBe(false);
  });

  it("gives Narration Preparation on a CLI no API figure, since its calls are not counted yet", () => {
    const narrated: RunConfig = {
      ...cli,
      sources: { ...cli.sources, audio: "generate" },
      audio: { provider: "voice", model: "tts", voice: "v1" },
      narrationPrompt: "Prepare",
      rendered: { ...cli.rendered, narration: "Prepare the narration." },
    };
    const estimate = estimateRequests(priced(narrated), catalogue);
    const rows = estimate.rows.filter((row) => row.detail.includes("Narration Preparation"));
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expect(row).toMatchObject({ onPlan: true, low: 0, apiLow: null });
  });
});
