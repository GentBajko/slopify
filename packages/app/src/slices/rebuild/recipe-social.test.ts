import { describe, expect, it } from "vitest";
import type { RunConfig } from "../admission/model.js";
import type { ManifestPiece, RevisionContent } from "../revisions/model.js";
import { defaultChoices } from "../social/defaults.js";
import { buildRecipes } from "./recipe-build.js";
import { config, content } from "./recipe-fixture.js";
import type { ResolvedWorkRecipe } from "./recipe-model.js";
import { recipeProviderChoice } from "./recipe-provider-choice.js";
import { priceRecipe } from "./recipe-work.js";

const base: RunConfig = {
  ...config,
  sources: { ...config.sources, article: "generate" },
  articlePrompt: "Article",
  llm: { provider: "openrouter", model: "llm" },
};
const value = (templates: Readonly<Record<string, string>> = {}): RevisionContent => ({
  ...content,
  promptTemplates: { article: "Write.", ...templates },
});
function plan(
  c: RunConfig,
  v: RevisionContent = value(),
  article: string | null = "## One\n\nThe tower stood.",
  pieces: readonly ManifestPiece[] = [],
): readonly ResolvedWorkRecipe[] {
  return buildRecipes({
    config: c,
    content: v,
    manifest: { outputs: [], pieces },
    resolved: { articleMarkdown: article, researchNotes: null },
  });
}
const social = (recipes: readonly ResolvedWorkRecipe[]) =>
  recipes.filter((one) => one.key.startsWith("social:"));
const prompted = { ...defaultChoices.x, text: "prompt" as const };

describe("socialRecipes", () => {
  it("plans nothing new for a project without posts or with only free text sources", () => {
    const before = plan(base);
    expect(social(before)).toEqual([]);
    const free = plan({
      ...base,
      social: {
        x: defaultChoices.x,
        bluesky: defaultChoices.bluesky,
        reddit: defaultChoices.reddit,
      },
    });
    expect(free.map((one) => [one.key, one.fingerprint])).toEqual(
      before.map((one) => [one.key, one.fingerprint]),
    );
  });

  it("plans one paid post per prompt-written site, from the article, in the video stage", () => {
    const recipes = plan({ ...base, social: { x: prompted, tiktok: defaultChoices.tiktok } });
    const [post, ...rest] = social(recipes);
    expect(rest).toEqual([]);
    expect(post).toMatchObject({
      key: "social:post:x",
      stage: "video",
      kind: "provider",
      dependsOn: ["article:body"],
      input: {
        kind: "llm",
        provider: "openrouter",
        model: "llm",
        social: { platform: "x", max: 280, unit: "weighted" },
      },
    });
    const system = post?.input.kind === "llm" ? (post.input.messages[0]?.content ?? "") : "";
    expect(system).toContain("one X post");
    if (post === undefined) throw new Error("no post");
    expect(recipeProviderChoice(post, base)).toMatchObject({ family: "llm" });
  });

  it("waits for the article before the request is known", () => {
    const [post] = social(plan({ ...base, social: { x: prompted } }, value(), null));
    expect(post?.input).toMatchObject({ kind: "deferred", operation: "social-post" });
    expect(post?.deferred).toBe(true);
    const priced = priceRecipe(
      { key: "social:post:x", disposition: "generate" } as Parameters<typeof priceRecipe>[0],
      post,
      base,
    );
    expect(priced).toMatchObject({ kind: "llm", provider: "openrouter", outputCharacters: 600 });
  });

  it("writes with the picked post prompt, and waits for the digest it uses", () => {
    const picked = { ...prompted, prompt: "Punchy" };
    const [post] = social(
      plan(
        { ...base, social: { x: picked } },
        value({ "social.x": "Be punchy about {{Slopify_Hook}}." }),
      ),
    );
    expect(post?.input.kind).toBe("deferred");
    expect(post?.dependsOn).toEqual(["article:body", "article:digest"]);
  });

  it("is outdated when its prompt, site or model changes, and only then", () => {
    const fingerprint = (c: RunConfig, v = value()) => social(plan(c, v))[0]?.fingerprint;
    const first = fingerprint({ ...base, social: { x: prompted } });
    expect(fingerprint({ ...base, social: { x: { ...prompted, hashtags: 5 } } })).toBe(first);
    expect(
      fingerprint({
        ...base,
        social: { x: prompted },
        llm: { provider: "openrouter", model: "other" },
      }),
    ).not.toBe(first);
    expect(
      fingerprint(
        { ...base, social: { x: { ...prompted, prompt: "Mine" } } },
        value({ "social.x": "Mine." }),
      ),
    ).not.toBe(first);
    expect(
      social(
        plan({ ...base, social: { bluesky: { ...defaultChoices.bluesky, text: "prompt" } } }),
      )[0]?.fingerprint,
    ).not.toBe(first);
  });
});
