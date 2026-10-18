import { describe, expect, it } from "vitest";
import type { RunConfig } from "../admission/model.js";
import type { ManifestPiece, RevisionContent } from "../revisions/model.js";
import { buildRecipes } from "./recipe-build.js";
import { config, content } from "./recipe-fixture.js";
import type { ResolvedWorkRecipe } from "./recipe-model.js";
import { priceRecipe } from "./recipe-work.js";

const digest = {
  Slopify_Summary: "How a city fell.",
  Slopify_Hook: "It was sold.",
  Slopify_Thumbnail_Text: "SOLD",
  Slopify_Key_Facts: "Walls were tall.",
  Slopify_Quote: "Silver buys everything.",
  Slopify_Tags: "lost cities, siege",
};

const base: RunConfig = {
  ...config,
  sources: { ...config.sources, article: "generate", thumbnail: "from_prompt" },
  articlePrompt: "Article",
  thumbnailPrompt: "Thumb",
};
const value = (templates: Readonly<Record<string, string>>): RevisionContent => ({
  ...content,
  promptTemplates: { article: "Write.", ...templates },
});

function plan(
  c: RunConfig,
  v: RevisionContent,
  article: string | null,
  pieces: readonly ManifestPiece[] = [],
): readonly ResolvedWorkRecipe[] {
  return buildRecipes({
    config: c,
    content: v,
    manifest: { outputs: [], pieces },
    resolved: { articleMarkdown: article, researchNotes: null },
  });
}
const find = (recipes: readonly ResolvedWorkRecipe[], key: string): ResolvedWorkRecipe => {
  const found = recipes.find((one) => one.key === key);
  if (found === undefined) throw new Error(`Missing ${key}`);
  return found;
};
function done(key: string, fingerprint: string, payload: unknown): ManifestPiece {
  return {
    key,
    stageKind: "article",
    assetId: null,
    fingerprint,
    piece: {
      id: `piece-${key}`,
      stageId: "article",
      kind: "article_written",
      idx: 1,
      state: "done",
      payload: JSON.stringify(payload),
    },
  };
}

describe("the keyword digest step", () => {
  const templates = value({ thumbnailPrompt: "Bold words: {{Slopify_Thumbnail_Text}}" });

  it("is planned only while a prompt uses a digest keyword where it works", () => {
    expect(
      plan(base, value({ thumbnailPrompt: "plain" }), "Text.").some(
        (one) => one.key === "article:digest",
      ),
    ).toBe(false);
    expect(
      plan(base, value({ article: "{{Slopify_Hook}}" }), "Text.").some(
        (one) => one.key === "article:digest",
      ),
    ).toBe(false);
  });

  it("waits for the article, and the thumbnail waits for it", () => {
    const recipes = plan(base, templates, null);
    const step = find(recipes, "article:digest");
    expect(step.input).toMatchObject({ kind: "deferred", operation: "keyword-digest" });
    expect(step.stage).toBe("article");
    expect(step.dependsOn).toEqual(["article:body"]);
    const thumbnail = find(recipes, "thumbnail:image");
    expect(thumbnail.input.kind).toBe("deferred");
    expect(thumbnail.dependsOn).toContain("article:digest");
  });

  it("reads the article once it is written, then fills the thumbnail from its answer", () => {
    const first = plan(base, templates, "## One\n\nThe city fell.");
    const step = find(first, "article:digest");
    expect(step.input.kind).toBe("llm");
    if (step.input.kind === "llm")
      expect(step.input.messages.at(-1)?.content).toContain("The city fell.");
    expect(find(first, "thumbnail:image").input.kind).toBe("deferred");
    const answered = plan(base, templates, "## One\n\nThe city fell.", [
      done("article:digest", step.fingerprint, { digest, text: "{}" }),
    ]);
    expect(find(answered, "thumbnail:image").input).toMatchObject({
      kind: "image",
      prompt: "Bold words: SOLD",
    });
  });

  it("gives the description its digest once written, and runs it after the digest", () => {
    const c: RunConfig = {
      ...base,
      sources: { ...base.sources, audio: "generate", thumbnail: "off" },
      youtubeDescription: true,
      descriptionPrompt: "Description",
    };
    const v = value({ description: "Open with: {{Slopify_Hook}}" });
    const step = find(plan(c, v, "Text."), "article:digest");
    const description = find(
      plan(c, v, "Text.", [done("article:digest", step.fingerprint, { digest, text: "{}" })]),
      "youtube:description",
    );
    expect(description.dependsOn).toContain("article:digest");
    expect(description.input).toMatchObject({
      values: expect.arrayContaining(["Open with: It was sold."]),
    });
  });

  it("ignores a saved digest that misses a part", () => {
    const step = find(plan(base, templates, "Text."), "article:digest");
    const { Slopify_Tags: _gone, ...partial } = digest;
    expect(
      find(
        plan(base, templates, "Text.", [
          done("article:digest", step.fingerprint, { digest: partial }),
        ]),
        "thumbnail:image",
      ).input.kind,
    ).toBe("deferred");
  });

  it("is priced as one text call while it waits for the article", () => {
    const step = find(plan(base, templates, null), "article:digest");
    expect(
      priceRecipe(
        { ...step, disposition: "generate", inflight: false, pieceIds: [], reason: "" },
        step,
        base,
      ),
    ).toMatchObject({ kind: "llm", stage: "article:digest", outputCharacters: 2000 });
  });
});
