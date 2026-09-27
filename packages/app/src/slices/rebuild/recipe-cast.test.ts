import { describe, expect, it } from "vitest";
import type { RunConfig } from "../admission/model.js";
import type { CastSnapshot } from "../channels/model.js";
import type { RevisionContent } from "../revisions/model.js";
import { buildRecipes } from "./recipe-build.js";
import { castFor, castMembersPerImage } from "./recipe-cast.js";
import { config, content } from "./recipe-fixture.js";
import type { ResolvedWorkRecipe } from "./recipe-model.js";

const tiamat: CastSnapshot = {
  name: "Tiamat",
  aliases: ["the Dragon Queen"],
  description: "five-headed chromatic dragon",
  images: ["a".repeat(64), "b".repeat(64)],
};
const waterdeep: CastSnapshot = {
  name: "Waterdeep",
  aliases: ["City of Splendors"],
  description: "",
  images: ["c".repeat(64)],
};
const base: RunConfig = {
  ...config,
  title: "The Rise of Tiamat",
  sources: { ...config.sources, thumbnail: "from_prompt" },
  images: { provider: "codex-image", model: "codex-imagegen" },
  thumbnailPrompt: "Thumbnail",
  rendered: {
    ...config.rendered,
    thumbnailPrompt: "A bold thumbnail",
    referencePrompt: "Character sheet",
  },
};
const briefs: RevisionContent = {
  ...content,
  imageOrder: ["harbor", "hill", "lair"],
  imageDefinitions: {
    harbor: { source: "generate", assetId: null, prompt: "The harbor of the City of Splendors" },
    hill: { source: "generate", assetId: null, prompt: "A quiet hill" },
    lair: {
      source: "generate",
      assetId: null,
      prompt: "The Dragon Queen coils above Waterdeep; Tiamatic runes glow",
    },
  },
};

function recipesFor(c: RunConfig, value: RevisionContent = briefs): readonly ResolvedWorkRecipe[] {
  return buildRecipes({
    config: c,
    content: value,
    manifest: { outputs: [], pieces: [] },
    resolved: { articleMarkdown: content.articleMarkdown ?? null, researchNotes: null },
  });
}
const find = (recipes: readonly ResolvedWorkRecipe[], key: string): ResolvedWorkRecipe => {
  const found = recipes.find((value) => value.key === key);
  if (found === undefined) throw new Error(`no ${key}`);
  return found;
};

describe("cast references per image", () => {
  const withCast: RunConfig = { ...base, cast: [tiamat, waterdeep] };

  it("sends each image the members its brief mentions, in the order it mentions them", () => {
    const recipes = recipesFor(withCast);
    expect(find(recipes, "image:harbor").input).toMatchObject({
      cast: [{ name: "Waterdeep", description: "", images: ["c".repeat(64)] }],
    });
    expect(find(recipes, "image:lair").input).toMatchObject({
      cast: [{ name: "Tiamat", images: ["a".repeat(64), "b".repeat(64)] }, { name: "Waterdeep" }],
    });
    expect(find(recipes, "image:hill").input).not.toHaveProperty("cast");
  });

  it("sends the thumbnail the members its brief or the title mentions", () => {
    expect(find(recipesFor(withCast), "thumbnail:image").input).toMatchObject({
      cast: [{ name: "Tiamat" }],
    });
  });

  it("sends the establishing image every member the title mentions", () => {
    const drawn = recipesFor({ ...withCast, reference: { source: "prompt", prompt: "Sheet" } });
    expect(find(drawn, "reference:image").input).toMatchObject({ cast: [{ name: "Tiamat" }] });
    // The other images keep their own members as well as the establishing image.
    expect(find(drawn, "image:lair").input).toMatchObject({
      reference: { assetId: null },
      cast: [{ name: "Tiamat" }, { name: "Waterdeep" }],
    });
  });

  it("keeps every fingerprint when the channel has no cast, or none is mentioned", () => {
    const plain = recipesFor(base);
    const unmentioned = recipesFor({
      ...base,
      cast: [{ name: "Vecna", aliases: [], description: "", images: ["d".repeat(64)] }],
    });
    for (const key of [
      "image:harbor",
      "image:hill",
      "image:lair",
      "thumbnail:image",
      "export:video",
    ])
      expect(find(unmentioned, key).fingerprint).toBe(find(plain, key).fingerprint);
    expect(find(recipesFor(withCast), "image:hill").fingerprint).toBe(
      find(plain, "image:hill").fingerprint,
    );
  });

  it("changes only the fingerprints of the images a member is used in", () => {
    const plain = recipesFor(base);
    const cast = recipesFor(withCast);
    expect(find(cast, "image:harbor").fingerprint).not.toBe(
      find(plain, "image:harbor").fingerprint,
    );
    expect(find(cast, "image:lair").fingerprint).not.toBe(find(plain, "image:lair").fingerprint);
    const newPicture = recipesFor({
      ...base,
      cast: [{ ...tiamat, images: ["e".repeat(64)] }, waterdeep],
    });
    expect(find(newPicture, "image:lair").fingerprint).not.toBe(
      find(cast, "image:lair").fingerprint,
    );
    expect(find(newPicture, "image:harbor").fingerprint).toBe(
      find(cast, "image:harbor").fingerprint,
    );
  });
});

describe("castFor", () => {
  it(`keeps at most ${String(castMembersPerImage)} members per image`, () => {
    const many = Array.from({ length: 6 }, (_, index) => ({
      name: `Hero${String(index)}`,
      aliases: [],
      description: "",
      images: ["f".repeat(64)],
    }));
    const text = many.map((member) => member.name).join(" and ");
    expect(castFor({ cast: many }, text)?.map((member) => member.name)).toEqual([
      "Hero0",
      "Hero1",
      "Hero2",
      "Hero3",
    ]);
  });

  it("answers undefined without a cast or a mention", () => {
    expect(castFor({}, "Tiamat")).toBeUndefined();
    expect(castFor({ cast: [tiamat] }, "A hill", null, undefined)).toBeUndefined();
  });
});
