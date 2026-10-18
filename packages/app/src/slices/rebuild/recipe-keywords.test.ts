import { describe, expect, it } from "vitest";
import type { RunConfig } from "../admission/model.js";
import type { RevisionContent } from "../revisions/model.js";
import { buildRecipes } from "./recipe-build.js";
import { config, content } from "./recipe-fixture.js";
import { fillPrompt } from "./recipe-keywords.js";
import type { RecipeContext, ResolvedWorkRecipe } from "./recipe-model.js";

const article = "## The harbour\n\nFirst paragraph.\n\n## The hill\n\nSecond paragraph.";

const base: RunConfig = {
  ...config,
  title: "The Gate",
  sources: { ...config.sources, article: "generate", audio: "generate" },
  articlePrompt: "Article",
  keywordFacts: { channel: "Quiet Histories", series: "" },
};

function plan(
  c: RunConfig,
  templates: Readonly<Record<string, string>>,
  markdown: string | null = article,
  value: Partial<RevisionContent> = {},
): readonly ResolvedWorkRecipe[] {
  return buildRecipes({
    config: c,
    content: { ...content, promptTemplates: templates, ...value },
    manifest: { outputs: [], pieces: [] },
    resolved: { articleMarkdown: markdown, researchNotes: null },
  });
}

const find = (recipes: readonly ResolvedWorkRecipe[], key: string): ResolvedWorkRecipe => {
  const found = recipes.find((one) => one.key === key);
  if (found === undefined) throw new Error(`Missing ${key}`);
  return found;
};

const sent = (value: ResolvedWorkRecipe): string =>
  value.input.kind === "llm" ? value.input.messages.map((one) => one.content).join("\n") : "";

describe("fillPrompt", () => {
  const context: RecipeContext = {
    config: base,
    content,
    manifest: { outputs: [], pieces: [] },
    resolved: { articleMarkdown: article, researchNotes: null },
  };

  it("returns a text without keywords as the very same string", () => {
    const text = "Write about {{Topic}}.";
    expect(fillPrompt(context, text, "article")).toEqual({ text, waits: [], dependsOn: [] });
  });

  it("fills the facts and leaves out a line with nothing to fill", () => {
    expect(
      fillPrompt(
        context,
        "{{Slopify_Title}} on {{Slopify_Channel}}.\nSeries: {{Slopify_Series}}",
        "article",
      ).text,
    ).toBe("The Gate on Quiet Histories.");
  });

  it("fills the chapters once the article is written, and runs after it", () => {
    expect(fillPrompt(context, "Chapters:\n{{Slopify_Chapters}}", "description")).toEqual({
      text: "Chapters:\nThe harbour\nThe hill",
      waits: [],
      dependsOn: ["article:body"],
    });
  });

  it("waits for the article before it can fill the chapters", () => {
    const waiting = fillPrompt(
      { ...context, resolved: { articleMarkdown: null, researchNotes: null } },
      "{{Slopify_Chapters}}",
      "description",
    );
    expect(waiting.text).toBe("{{Slopify_Chapters}}");
    expect(waiting.waits.map((one) => one.key)).toEqual(["article:body"]);
  });

  it("knows no place, and fills nothing, for a key it has never seen", () => {
    expect(fillPrompt(context, "{{Slopify_Title}}", undefined).text).toBe("{{Slopify_Title}}");
  });
});

describe("keywords in planned requests", () => {
  it("fills the article prompt's facts", () => {
    const text = sent(
      find(
        plan(base, { article: "A video called {{Slopify_Title}} for {{Slopify_Channel}}." }),
        "article:body",
      ),
    );
    expect(text).toContain("A video called The Gate for Quiet Histories.");
  });

  // Rule: a value the person gave a `Slopify_` name before the prefix was reserved still wins.
  it("lets the person's own value for the name win", () => {
    const text = sent(
      find(
        plan({ ...base, values: { Slopify_Title: "Mine" } }, { article: "{{Slopify_Title}}" }),
        "article:body",
      ),
    );
    expect(text).toContain("Mine");
    expect(text).not.toContain("The Gate");
  });

  it("waits for the article before an intro's text uses the chapters", () => {
    const c: RunConfig = { ...base, intro: { name: "Intro", mode: "text" } };
    const templates = { article: "Article", intro: "Today: {{Slopify_Chapters}}" };
    const waiting = find(plan(c, templates, null), "entry:intro:text");
    expect(waiting.input.kind).toBe("deferred");
    expect(waiting.dependsOn).toEqual(["article:body"]);
    const ready = find(plan(c, templates), "entry:intro:text");
    expect(ready.input).toMatchObject({ kind: "local", values: "Today: The harbour\nThe hill" });
  });

  it("fills an image prompt's keywords", () => {
    const c: RunConfig = { ...base, imagePrompts: [{ name: "Wide", number: 1 }] };
    const recipes = plan(
      c,
      { article: "Article", "imagePrompts.0": "A poster for {{Slopify_Channel}}." },
      article,
      {
        imageOrder: ["one"],
        imageDefinitions: {
          one: { source: "generate", assetId: null, prompt: null, templateKey: "imagePrompts.0" },
        },
      },
    );
    expect(find(recipes, "image:one").input).toMatchObject({
      prompt: "A poster for Quiet Histories.",
    });
  });

  it("fills a thumbnail prompt's keywords", () => {
    const c: RunConfig = {
      ...base,
      sources: { ...base.sources, thumbnail: "from_prompt" },
      thumbnailPrompt: "Thumb",
    };
    const recipes = plan(c, { article: "Article", thumbnailPrompt: "{{Slopify_Title}} in gold." });
    expect(find(recipes, "thumbnail:image").input).toMatchObject({ prompt: "The Gate in gold." });
  });

  it("keeps the description's links live and runs it after the article for the chapters", () => {
    const c: RunConfig = {
      ...base,
      youtubeDescription: true,
      descriptionPrompt: "Description",
    };
    const recipes = plan(c, {
      article: "Article",
      description: "{{Slopify_Chapters}}\n{{Slopify_Previous_Video}}",
    });
    const description = find(recipes, "youtube:description");
    expect(description.dependsOn).toContain("article:body");
    expect(description.input).toMatchObject({
      values: expect.arrayContaining(["The harbour\nThe hill\n{{Previous video}}"]),
    });
  });
});
