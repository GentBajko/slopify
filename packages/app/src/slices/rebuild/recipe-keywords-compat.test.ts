import { describe, expect, it } from "vitest";
import type { RunConfig } from "../admission/model.js";
import type { ManifestPiece, RevisionContent } from "../revisions/model.js";
import { buildRecipes } from "./recipe-build.js";
import { config, content } from "./recipe-fixture.js";
import type { ResolvedWorkRecipe } from "./recipe-model.js";

// Golden fingerprints, taken before the keywords Slopify fills were wired in: a project whose
// prompts use no `Slopify_` keyword plans exactly the requests it always did, so nothing it
// made is ever marked outdated. A change here is a change to every existing project.

const article = "# The harbour\n\nFirst paragraph.\n\n## The hill\n\nSecond paragraph.";

const templates: Readonly<Record<string, string>> = {
  article: "Write about {{Topic}}. {{Scene}} stays as written here. {{Slopify_Wish}}",
  narration: "Read {{Topic}} calmly.",
  intro: "Welcome to {{Topic}}, {{Appearance}}.",
  outro: "Thanks for watching.",
  description: "Describe {{Topic}}. Previous: {{Previous video}}",
  shorts: "Pick the best moments of {{Topic}}.",
  shortsImage: "A vertical picture.\n\nScene: {{Scene}}\n\nStyle: {{Style}}",
  "review.images": "Check the images of {{Topic}}.",
  referencePrompt: "Establishing shot. {{Appearance}}",
  "imagePrompts.0":
    "An engraving.\n\nComposition: wide shot.\n\nScene: {{Scene}}\n\n{{Appearance}}",
  "imagePrompts.1": "A watercolour of {{Topic}} in {{Style}}.",
  thumbnailPrompt: "A bold thumbnail of {{Topic}}.\n\nScene: {{ Scene }}\n\n{{Appearance}}",
};

const values = { Topic: "the harbour", Style: "ink", Slopify_Wish: "a wish" };

const full: RunConfig = {
  ...config,
  title: "Harbour | Night Archive",
  sources: {
    research: "off",
    article: "generate",
    audio: "generate",
    images: "generate",
    thumbnail: "from_prompt",
    video: "generate",
  },
  articlePrompt: "Article",
  narrationPrompt: "Narration",
  imagePrompts: [
    { name: "Wide", number: 1 },
    { name: "Painted", number: 1 },
  ],
  thumbnailPrompt: "Thumb",
  intro: { name: "Intro", mode: "llm" },
  outro: { name: "Outro", mode: "text" },
  youtubeDescription: true,
  descriptionPrompt: "Description",
  shorts: {
    enabled: true,
    count: 1,
    minSeconds: 30,
    maxSeconds: 60,
    prompt: "Shorts",
    imagePrompt: "Vertical",
  },
  reviews: { provider: "codex", model: "gpt", stages: { images: { mode: "flag" } } },
  reference: { source: "prompt", prompt: "Establishing" },
  values,
  rendered: {},
};

const fullContent: RevisionContent = {
  ...content,
  articleMarkdown: undefined,
  imageOrder: ["harbor", "hill"],
  imageDefinitions: {
    harbor: { source: "generate", assetId: null, prompt: null, templateKey: "imagePrompts.0" },
    hill: { source: "generate", assetId: null, prompt: null, templateKey: "imagePrompts.1" },
  },
  promptTemplates: templates,
};

function plan(
  c: RunConfig,
  value: RevisionContent = fullContent,
  pieces: readonly ManifestPiece[] = [],
): readonly ResolvedWorkRecipe[] {
  return buildRecipes({
    config: c,
    content: value,
    manifest: { outputs: [], pieces },
    resolved: { articleMarkdown: article, researchNotes: null },
  });
}

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

// Every planned step with what identifies its request and its work.
function golden(recipes: readonly ResolvedWorkRecipe[]): readonly string[] {
  return recipes.map(
    (value) =>
      `${value.key} ${value.input.kind} ${value.requestFingerprint} ${value.fingerprint} ${value.dependsOn.join(",")}`,
  );
}

// The scenes and the looks answered, so every picture is planned as its image request.
function answered(c: RunConfig): readonly ResolvedWorkRecipe[] {
  const first = plan(c);
  const pieces: ManifestPiece[] = [];
  const scenes = first.find((value) => value.key === "images:scenes");
  if (scenes !== undefined)
    pieces.push(done("images:scenes", scenes.fingerprint, { scenes: ["Dawn.", "Dusk."] }));
  const thumbnail = first.find((value) => value.key === "thumbnail:scenes");
  if (thumbnail !== undefined)
    pieces.push(done("thumbnail:scenes", thumbnail.fingerprint, { scenes: ["The gate."] }));
  const looks = first.find((value) => value.key === "images:appearance");
  if (looks !== undefined)
    pieces.push(
      done("images:appearance", looks.fingerprint, {
        appearance: {
          subject: { name: "Harbour", aliases: [], look: "Grey stone." },
          characters: [],
        },
      }),
    );
  return plan(c, fullContent, pieces);
}

describe("keyword compatibility", () => {
  it("plans a project with Scenes from the article off exactly as before", () => {
    expect(golden(answered(full))).toMatchSnapshot();
  });

  it("plans a project with Scenes from the article on exactly as before", () => {
    expect(golden(answered({ ...full, imageScenes: true }))).toMatchSnapshot();
  });

  it("plans a project with the thumbnail prompt written by the AI exactly as before", () => {
    expect(
      golden(answered({ ...full, sources: { ...full.sources, thumbnail: "prompt_by_llm" } })),
    ).toMatchSnapshot();
  });

  it("plans a project without stored templates from its rendered prompts exactly as before", () => {
    const rendered = Object.fromEntries(
      Object.entries(templates).map(([key, body]) => [
        key,
        body.replaceAll("{{Topic}}", "the harbour").replaceAll("{{Style}}", "ink"),
      ]),
    );
    expect(
      golden(plan({ ...full, rendered }, { ...fullContent, promptTemplates: {} })),
    ).toMatchSnapshot();
  });
});
