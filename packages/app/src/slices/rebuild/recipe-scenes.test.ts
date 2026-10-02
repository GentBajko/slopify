import { expect, it } from "vitest";
import type { RunConfig } from "../admission/model.js";
import type { ManifestPiece, RevisionContent } from "../revisions/model.js";
import { buildRecipes } from "./recipe-build.js";
import { config, content } from "./recipe-fixture.js";
import type { ResolvedWorkRecipe } from "./recipe-model.js";

const scened: RunConfig = {
  ...config,
  imagePrompts: [{ name: "Wide", number: 2 }],
  imageScenes: true,
};
const withScenes: RevisionContent = {
  ...content,
  imageDefinitions: {
    harbor: { source: "generate", assetId: null, prompt: null, templateKey: "imagePrompts.0" },
    hill: { source: "generate", assetId: null, prompt: null, templateKey: "imagePrompts.0" },
  },
  promptTemplates: {
    "imagePrompts.0": "An engraving.\n\nComposition: wide shot.\n\nScene: {{Scene}}",
  },
};

function plan(
  pieces: readonly ManifestPiece[] = [],
  article: string | null = "First paragraph.\n\nSecond paragraph.",
  value: RevisionContent = withScenes,
  c: RunConfig = scened,
): readonly ResolvedWorkRecipe[] {
  return buildRecipes({
    config: c,
    content: value,
    manifest: { outputs: [], pieces },
    resolved: { articleMarkdown: article, researchNotes: null },
  });
}
const find = (recipes: readonly ResolvedWorkRecipe[], key: string) => {
  const found = recipes.find((value) => value.key === key);
  if (found === undefined) throw new Error(`Missing ${key}`);
  return found;
};
function done(key: string, fingerprint: string, payload: unknown): ManifestPiece {
  return {
    key,
    stageKind: "images",
    assetId: null,
    fingerprint,
    piece: {
      id: `piece-${key}`,
      stageId: "images",
      kind: "article_written",
      idx: 1,
      state: "done",
      payload: JSON.stringify(payload),
    },
  };
}

it("writes the scenes from the article, and each image waits for its own", () => {
  const recipes = plan();
  const scenes = find(recipes, "images:scenes");
  expect(scenes.input.kind).toBe("llm");
  expect(scenes.dependsOn).toEqual(["article:body"]);
  if (scenes.input.kind === "llm") {
    expect(scenes.input.messages.at(-1)?.content).toContain("1. wide shot.\n2. wide shot.");
    expect(scenes.input.messages.at(-1)?.content).toContain("Second paragraph.");
  }
  const images = ["image:harbor", "image:hill"].map((key) => find(recipes, key));
  expect(images.map((value) => value.input.kind)).toEqual(["deferred", "deferred"]);
  expect(images.every((value) => value.dependsOn.includes("images:scenes"))).toBe(true);
  // Two waiting images are two requests, not one.
  expect(new Set(images.map((value) => value.fingerprint)).size).toBe(2);
});

it("draws each image from its own scene once they are written", () => {
  const scenes = find(plan(), "images:scenes");
  const recipes = plan([
    done("images:scenes", scenes.fingerprint, {
      scenes: ["The Ishtar Gate at dawn.", "Marduk splits the sea."],
    }),
  ]);
  const prompts = ["image:harbor", "image:hill"].map((key) => {
    const input = find(recipes, key).input;
    return input.kind === "image" ? input.prompt : "";
  });
  expect(prompts).toEqual([
    "An engraving.\n\nComposition: wide shot.\n\nScene: The Ishtar Gate at dawn.",
    "An engraving.\n\nComposition: wide shot.\n\nScene: Marduk splits the sea.",
  ]);
  // Scenes for another request, or the wrong number of them, are not used.
  const stale = plan([done("images:scenes", "other", { scenes: ["A.", "B."] })]);
  expect(find(stale, "image:harbor").input.kind).toBe("deferred");
  const miscounted = plan([done("images:scenes", scenes.fingerprint, { scenes: ["A."] })]);
  expect(find(miscounted, "image:harbor").input.kind).toBe("deferred");
});

it("adds the scene after the first paragraph of a prompt without the keyword", () => {
  const plain: RevisionContent = {
    ...withScenes,
    promptTemplates: {
      "imagePrompts.0": "An engraving about {{Topic}}.\n\nComposition: wide shot.",
    },
  };
  const c: RunConfig = { ...scened, values: { Topic: "Lighthouse" } };
  const scenes = find(plan([], undefined, plain, c), "images:scenes");
  const recipes = plan(
    [done("images:scenes", scenes.fingerprint, { scenes: ["A gate.", "A sea."] })],
    undefined,
    plain,
    c,
  );
  const input = find(recipes, "image:hill").input;
  expect(input.kind === "image" ? input.prompt : "").toBe(
    "An engraving about Lighthouse.\n\nScene: A sea.\n\nComposition: wide shot.",
  );
});

it("with the switch off, draws every image as before and leaves the scene line out", () => {
  const off = plan([], undefined, withScenes, { ...scened, imageScenes: undefined });
  expect(off.some((value) => value.key === "images:scenes")).toBe(false);
  expect(find(off, "image:harbor").input).toMatchObject({
    kind: "image",
    prompt: "An engraving.\n\nComposition: wide shot.",
  });
});

it("waits for the article before asking, and leaves prompts without a scene as they were", () => {
  const unwritten: RunConfig = {
    ...scened,
    sources: { ...scened.sources, article: "generate" },
    rendered: { ...scened.rendered, article: "Write an article." },
  };
  const early = plan([], null, { ...withScenes, articleMarkdown: undefined }, unwritten);
  expect(find(early, "images:scenes").input.kind).toBe("deferred");
  expect(find(early, "image:harbor").input.kind).toBe("deferred");
  const plain = plan([], "Text.", content, { ...scened, imageScenes: undefined });
  expect(plain.some((value) => value.key === "images:scenes")).toBe(false);
  expect(find(plain, "image:harbor").input).toMatchObject({ kind: "image", prompt: "Harbor" });
});

it("with Article Off, plans an empty given article and never writes one", () => {
  const off: RunConfig = {
    ...scened,
    imageScenes: undefined,
    sources: { ...scened.sources, article: "off" },
    provided: {},
  };
  const recipes = plan([], null, { ...content, articleMarkdown: undefined }, off);
  const article = find(recipes, "article:body");
  expect(article.input).toMatchObject({ kind: "local", operation: "provided-article", values: "" });
  expect(find(recipes, "image:harbor").input).toMatchObject({ kind: "image", prompt: "Harbor" });
});

const thumbnailed: RunConfig = {
  ...scened,
  sources: { ...scened.sources, thumbnail: "from_prompt" },
  thumbnailCount: 3,
};
const thumbnailScene: RevisionContent = {
  ...withScenes,
  promptTemplates: {
    ...withScenes.promptTemplates,
    thumbnailPrompt: "A thumbnail.\n\nScene: {{Scene}}\n\nThe title on top.",
  },
};
const promptOf = (recipes: readonly ResolvedWorkRecipe[], key: string): string => {
  const input = find(recipes, key).input;
  return input.kind === "image" ? input.prompt : input.kind;
};

it("writes the thumbnails' scenes in a step of their own, one per thumbnail", () => {
  const recipes = plan([], undefined, thumbnailScene, thumbnailed);
  const scenes = find(recipes, "thumbnail:scenes");
  expect(scenes.stage).toBe("thumbnail");
  if (scenes.input.kind === "llm") {
    expect(scenes.input.messages[0]?.content).toContain("Pictures: 0");
    expect(scenes.input.messages[0]?.content).toContain("Thumbnails: 3");
  }
  const thumbnails = ["thumbnail:image", "thumbnail:image:2", "thumbnail:image:3"];
  for (const key of thumbnails) {
    expect(find(recipes, key).input.kind).toBe("deferred");
    expect(find(recipes, key).dependsOn).toContain("thumbnail:scenes");
  }
  const written = plan(
    [
      done("thumbnail:scenes", scenes.fingerprint, {
        scenes: ["Five heads roar.", "An eye in the dark.", "A hoard."],
      }),
    ],
    undefined,
    thumbnailScene,
    thumbnailed,
  );
  expect(promptOf(written, "thumbnail:image")).toBe(
    "A thumbnail.\n\nScene: Five heads roar.\n\nThe title on top.",
  );
  expect(promptOf(written, "thumbnail:image:2")).toContain("Scene: An eye in the dark.");
  expect(promptOf(written, "thumbnail:image:3")).toContain("Scene: A hoard.");
});

it("never touches the images when the thumbnail settings change", () => {
  const keys = ["images:scenes", "image:harbor", "image:hill"];
  const before = plan([], undefined, withScenes, scened);
  const after = plan([], undefined, thumbnailScene, { ...thumbnailed, thumbnailCount: 1 });
  const three = plan([], undefined, thumbnailScene, thumbnailed);
  for (const key of keys) {
    expect(find(after, key).fingerprint).toBe(find(before, key).fingerprint);
    expect(find(three, key).fingerprint).toBe(find(before, key).fingerprint);
  }
});

it("leaves a thumbnail without the keyword, or with the switch off, as it was", () => {
  const plainThumbnail: RevisionContent = {
    ...withScenes,
    promptTemplates: { ...withScenes.promptTemplates, thumbnailPrompt: "A thumbnail." },
  };
  const plain = plan([], undefined, plainThumbnail, thumbnailed);
  expect(plain.some((value) => value.key === "thumbnail:scenes")).toBe(false);
  expect(promptOf(plain, "thumbnail:image")).toBe("A thumbnail.");
  const off = plan([], undefined, thumbnailScene, { ...thumbnailed, imageScenes: undefined });
  expect(off.some((value) => value.key === "images:scenes")).toBe(false);
  expect(promptOf(off, "thumbnail:image")).toBe("A thumbnail.\n\nThe title on top.");
});

const looked: RevisionContent = {
  ...withScenes,
  promptTemplates: {
    "imagePrompts.0": "An engraving.\n\nScene: {{Scene}}\n\nLooks: {{Appearance}}",
  },
};
const looksFound = {
  subject: { name: "The Keeper", aliases: [], look: "A tall man in a grey coat." },
  characters: [{ name: "Mara", aliases: [], look: "A small woman with a red scarf." }],
};

it("looks up the looks with a web search, and each image waits for them", () => {
  const recipes = plan([], undefined, looked);
  const lookup = find(recipes, "images:appearance");
  expect(lookup.input).toMatchObject({ kind: "llm", webSearch: true });
  expect(lookup.dependsOn).toEqual(["article:body"]);
  const scenes = find(recipes, "images:scenes");
  const onlyScenes = plan(
    [
      done("images:scenes", scenes.fingerprint, {
        scenes: ["Mara at the door.", "An empty hill."],
      }),
    ],
    undefined,
    looked,
  );
  expect(find(onlyScenes, "image:harbor").input.kind).toBe("deferred");
  expect(find(onlyScenes, "image:harbor").dependsOn).toContain("images:appearance");
  const both = plan(
    [
      done("images:scenes", scenes.fingerprint, {
        scenes: ["Mara at the door.", "An empty hill."],
      }),
      done("images:appearance", lookup.fingerprint, { appearance: looksFound }),
    ],
    undefined,
    looked,
  );
  expect(promptOf(both, "image:harbor")).toBe(
    "An engraving.\n\nScene: Mara at the door.\n\nLooks: Mara: A small woman with a red scarf.",
  );
  // A scene without anyone in it leaves the looks line out.
  expect(promptOf(both, "image:hill")).toBe("An engraving.\n\nScene: An empty hill.");
});

it("gives the subject's look to images without scenes, and asks nothing without the keyword", () => {
  const noScenes: RunConfig = { ...scened, imageScenes: undefined };
  const lookup = find(plan([], undefined, looked, noScenes), "images:appearance");
  const recipes = plan(
    [done("images:appearance", lookup.fingerprint, { appearance: looksFound })],
    undefined,
    looked,
    noScenes,
  );
  expect(promptOf(recipes, "image:hill")).toBe(
    "An engraving.\n\nLooks: The Keeper: A tall man in a grey coat.",
  );
  expect(plan().some((value) => value.key === "images:appearance")).toBe(false);
});

it("keeps the scenes when the project is renamed, as its subject stays what it was", () => {
  const before = find(plan(), "images:scenes").fingerprint;
  const renamed = { ...scened, title: "A new name", subjectTitle: scened.title };
  expect(find(plan([], undefined, withScenes, renamed), "images:scenes").fingerprint).toBe(before);
  // Without the kept subject, the new name would be a new request.
  expect(
    find(plan([], undefined, withScenes, { ...scened, title: "A new name" }), "images:scenes")
      .fingerprint,
  ).not.toBe(before);
});

it("changes no step at all when the project is only renamed", () => {
  const before = plan().map((one) => [one.key, one.fingerprint]);
  const renamed = { ...scened, title: "A new name", subjectTitle: scened.title };
  expect(plan([], undefined, withScenes, renamed).map((one) => [one.key, one.fingerprint])).toEqual(
    before,
  );
});
