import { afterEach, describe, expect, it } from "vitest";
import type { ImagePromptChoice, RunConfig } from "../admission/model.js";
import { insertPrompt } from "../library/repo.js";
import { readyView, config as recipeConfig, workFor } from "../rebuild/recipe-fixture.js";
import { adoptBaseline } from "./adopt.js";
import { replanImagePrompts } from "./image-plan.js";
import type { RevisionContent } from "./model.js";
import { saveRevision } from "./mutations.js";
import { revisionFixture } from "./revision.fake.js";

// Two prompts, Castle twice and Forest twice, planned as Play's run plans them.
const prompts: readonly ImagePromptChoice[] = [
  { name: "Castle", number: 2 },
  { name: "Forest", number: 2 },
];
const templates = { "imagePrompts.0": "A castle at {{Time}}", "imagePrompts.1": "A forest" };
const planned: RunConfig = {
  ...recipeConfig,
  imagePrompts: prompts,
  values: { Time: "dusk" },
  rendered: {
    ...recipeConfig.rendered,
    "imagePrompts.0": "A castle at dusk",
    "imagePrompts.1": "A forest",
  },
};
const images = (index: number, prompt: string) => ({
  source: "generate" as const,
  assetId: null,
  prompt,
  templateKey: `imagePrompts.${String(index)}`,
});
const content: RevisionContent = {
  articleMarkdown: recipeConfig.provided.article,
  articleEdited: false,
  provided: {},
  imageOrder: ["castle1", "castle2", "own", "forest1", "forest2"],
  imageDefinitions: {
    castle1: images(0, "A castle at dusk"),
    castle2: images(0, "A castle at dusk"),
    // One image written by hand: no prompt's, so it stays wherever the prompts go.
    own: { source: "generate", assetId: null, prompt: "A bridge", templateKey: null },
    forest1: images(1, "A forest"),
    forest2: images(1, "A forest"),
  },
  narrationOverrides: {},
  regenerationTokens: {},
  promptTemplates: { ...templates, article: "Write an article." },
};
const library: Readonly<Record<string, string>> = { River: "A river at {{Time}}" };

function replan(to: readonly ImagePromptChoice[]) {
  let next = 0;
  const plan = replanImagePrompts({
    from: prompts,
    to,
    content,
    rendered: planned.rendered,
    values: planned.values,
    body: (name) => library[name],
    key: () => `new${String(++next)}`,
  });
  if (!plan.ok) throw new Error(JSON.stringify(plan.fields));
  return plan;
}

describe("replanning image prompts", () => {
  it("adds images after a prompt whose Number went up, and keeps its others", () => {
    const plan = replan([
      { name: "Castle", number: 3 },
      { name: "Forest", number: 2 },
    ]);
    expect(plan.content.imageOrder).toEqual([
      "castle1",
      "castle2",
      "new1",
      "own",
      "forest1",
      "forest2",
    ]);
    expect(plan.content.imageDefinitions.new1).toEqual(images(0, "A castle at dusk"));
    expect(plan.added).toEqual(["new1"]);
    expect(plan.removed).toEqual([]);
  });

  it("drops the last images of a prompt whose Number went down", () => {
    const plan = replan([
      { name: "Castle", number: 1 },
      { name: "Forest", number: 2 },
    ]);
    expect(plan.content.imageOrder).toEqual(["castle1", "own", "forest1", "forest2"]);
    expect(plan.removed).toEqual(["castle2"]);
  });

  it("removes an unticked prompt's images and renumbers the rest without touching them", () => {
    const plan = replan([
      { name: "Forest", number: 2 },
      { name: "River", number: 1 },
    ]);
    expect(plan.content.imageOrder).toEqual(["own", "forest1", "forest2", "new1"]);
    expect(plan.removed).toEqual(["castle1", "castle2"]);
    expect(plan.content.imageDefinitions.forest1).toEqual(images(0, "A forest"));
    expect(plan.content.imageDefinitions.new1).toEqual(images(1, "A river at dusk"));
    expect(plan.content.promptTemplates["imagePrompts.0"]).toBe("A forest");
    expect(plan.content.promptTemplates["imagePrompts.1"]).toBe("A river at {{Time}}");
    expect(plan.rendered["imagePrompts.0"]).toBe("A forest");
    expect(plan.rendered["imagePrompts.1"]).toBe("A river at dusk");
    expect(plan.content.promptTemplates.article).toBe("Write an article.");
  });

  it("refuses a prompt the Library no longer has, saying where to fix it", () => {
    const plan = replanImagePrompts({
      from: prompts,
      to: [...prompts, { name: "Gone", number: 1 }],
      content,
      rendered: planned.rendered,
      values: planned.values,
      body: () => undefined,
      key: () => "unused",
    });
    expect(plan).toMatchObject({
      ok: false,
      fields: [{ field: "imagePrompts.2.name", message: expect.stringContaining("Library") }],
    });
  });
});

describe("the rebuild after a replan", () => {
  // Every image of the base is made and current; the rebuild plan says what the edit redoes.
  function dispositions(to: readonly ImagePromptChoice[]) {
    const base = readyView(planned, content);
    const plan = replan(to);
    const work = workFor(
      base,
      { ...planned, imagePrompts: to, rendered: plan.rendered },
      plan.content,
    ).work;
    return Object.fromEntries(
      work.filter((row) => row.key.startsWith("image:")).map((row) => [row.key, row.disposition]),
    );
  }

  it("reuses every image of an unchanged prompt and makes only the new ones", () => {
    expect(
      dispositions([
        { name: "Castle", number: 3 },
        { name: "Forest", number: 2 },
      ]),
    ).toEqual({
      "image:castle1": "reuse",
      "image:castle2": "reuse",
      "image:new1": "generate",
      "image:own": "reuse",
      "image:forest1": "reuse",
      "image:forest2": "reuse",
    });
  });

  it("keeps a renumbered prompt's images and has no work for removed ones", () => {
    expect(
      dispositions([
        { name: "Forest", number: 1 },
        { name: "River", number: 2 },
      ]),
    ).toEqual({
      "image:own": "reuse",
      "image:forest1": "reuse",
      "image:new1": "generate",
      "image:new2": "generate",
    });
  });
});

describe("saving a revision with other image prompts", () => {
  const fixtures: ReturnType<typeof revisionFixture>[] = [];
  afterEach(() => {
    for (const h of fixtures.splice(0)) h.close();
  });

  function fixture() {
    const h = revisionFixture();
    fixtures.push(h);
    const config: RunConfig = {
      ...h.config,
      sources: { ...h.config.sources, images: "generate" },
      images: { provider: "image", model: "model" },
      imagePrompts: prompts,
      values: planned.values,
      rendered: { ...h.config.rendered, ...planned.rendered },
    };
    h.deps.db
      .prepare("UPDATE projects SET config=? WHERE id=?")
      .run(JSON.stringify(config), h.projectId);
    insertPrompt(h.deps.db, {
      id: "river",
      kind: "image",
      name: "River",
      body: library.River ?? "",
      slots: ["Time"],
      updatedAt: "2026-09-27",
    });
    const baseline = adoptBaseline(h.deps, h.projectId, templates);
    if (!baseline.ok) throw new Error("Expected a baseline.");
    return { ...h, config, base: baseline.view };
  }

  it("replans on save, keeping an unchanged prompt's images and their fingerprints", async () => {
    const h = fixture();
    const before = h.base.revision.content;
    const forest = before.imageOrder.filter(
      (key) => before.imageDefinitions[key]?.templateKey === "imagePrompts.1",
    );
    expect(forest).toHaveLength(2);
    const saved = await saveRevision(h.deps, {
      projectId: h.projectId,
      baseRevisionId: h.base.revision.id,
      idempotencyKey: "replan",
      edit: {
        config: {
          ...h.base.revision.config,
          imagePrompts: [
            { name: "Forest", number: 2 },
            { name: "River", number: 1 },
          ],
        },
        content: before,
      },
    });
    if (!saved.ok) throw new Error(JSON.stringify(saved));
    const { config, content: after, fingerprints } = saved.view.revision;
    expect(after.imageOrder.slice(0, 2)).toEqual(forest);
    expect(after.imageOrder).toHaveLength(3);
    for (const key of forest) {
      expect(after.imageDefinitions[key]?.templateKey).toBe("imagePrompts.0");
      expect(fingerprints[`image:${key}`]).toBe(h.base.revision.fingerprints[`image:${key}`]);
    }
    const river = after.imageOrder[2] ?? "";
    expect(after.imageDefinitions[river]).toMatchObject({
      source: "generate",
      templateKey: "imagePrompts.1",
    });
    expect(config.rendered["imagePrompts.0"]).toBe("A forest");
    expect(config.rendered["imagePrompts.1"]).toBe("A river at dusk");
    expect(fingerprints[`image:${river}`]).toBeDefined();
  });

  it("changes nothing about the images when the prompts stay as they were", async () => {
    const h = fixture();
    const saved = await saveRevision(h.deps, {
      projectId: h.projectId,
      baseRevisionId: h.base.revision.id,
      idempotencyKey: "same",
      edit: {
        config: { ...h.base.revision.config, title: "Renamed" },
        content: h.base.revision.content,
      },
    });
    if (!saved.ok) throw new Error(JSON.stringify(saved));
    expect(saved.view.revision.content.imageOrder).toEqual(h.base.revision.content.imageOrder);
    expect(saved.view.revision.content.imageDefinitions).toEqual(
      h.base.revision.content.imageDefinitions,
    );
  });

  it("adds the images More images for long videos asks for, keeping every existing one", async () => {
    const h = fixture();
    const before = h.base.revision.content;
    expect(before.imageOrder).toHaveLength(4);
    // 9,000 words is an hour of narration: six images an hour asks for six, two more than the
    // Numbers' four, handed to the prompts in order.
    const saved = await saveRevision(h.deps, {
      projectId: h.projectId,
      baseRevisionId: h.base.revision.id,
      idempotencyKey: "scale",
      edit: {
        config: { ...h.base.revision.config, imageScale: { perHour: 6, words: 9000 } },
        content: before,
      },
    });
    if (!saved.ok) throw new Error(JSON.stringify(saved));
    const { content: after, fingerprints } = saved.view.revision;
    expect(after.imageOrder).toHaveLength(6);
    for (const key of before.imageOrder) {
      expect(after.imageOrder).toContain(key);
      expect(fingerprints[`image:${key}`]).toBe(h.base.revision.fingerprints[`image:${key}`]);
    }
    const added = after.imageOrder.filter((key) => !before.imageOrder.includes(key));
    expect(added.map((key) => after.imageDefinitions[key]?.templateKey).sort()).toEqual([
      "imagePrompts.0",
      "imagePrompts.1",
    ]);
  });

  it("refuses a Number past the limit with the field to fix", async () => {
    const h = fixture();
    const saved = await saveRevision(h.deps, {
      projectId: h.projectId,
      baseRevisionId: h.base.revision.id,
      idempotencyKey: "too-many",
      edit: {
        config: { ...h.base.revision.config, imagePrompts: [{ name: "Castle", number: 21 }] },
        content: h.base.revision.content,
      },
    });
    expect(saved).toMatchObject({
      ok: false,
      reason: "invalid-edit",
      fields: [{ field: "imagePrompts.0.number" }],
    });
  });
});
