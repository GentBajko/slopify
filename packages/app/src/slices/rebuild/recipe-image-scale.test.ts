import { afterEach, expect, it } from "vitest";
import type { RunConfig } from "../admission/model.js";
import { updateProjectConfig } from "../admission/repo.js";
import { runConfigSchema } from "../admission/schema.js";
import { ensureBaseline } from "../revisions/adopt.js";
import type { RevisionContent } from "../revisions/model.js";
import { revisionFixture } from "../revisions/revision.fake.js";
import { buildRecipes } from "./recipe-build.js";

// More images for long videos (`images/scale.ts`): a config without the setting plans and
// fingerprints exactly as before it existed; with it, the run's first revision holds more
// images and the video's recipe follows them.

const fixtures: ReturnType<typeof revisionFixture>[] = [];
afterEach(() => {
  for (const h of fixtures.splice(0)) h.close();
});

function saved(h: ReturnType<typeof revisionFixture>): RunConfig {
  return {
    ...h.config,
    sources: { ...h.config.sources, images: "generate", video: "generate" },
    images: { provider: "image", model: "v1" },
    imagePrompts: [
      { name: "one", number: 3 },
      { name: "two", number: 1 },
    ],
    rendered: { "imagePrompts.0": "An orchard", "imagePrompts.1": "A lake" },
  };
}

async function baseline(config: RunConfig): Promise<RevisionContent> {
  const h = revisionFixture();
  fixtures.push(h);
  updateProjectConfig(h.deps.db, h.projectId, config, h.deps.clock.now().toISOString());
  const result = await ensureBaseline(h.deps, h.projectId);
  if (!result.ok) throw new Error("Expected a baseline.");
  return result.view.revision.content;
}

function fingerprints(config: RunConfig, content: RevisionContent): Record<string, string> {
  return Object.fromEntries(
    buildRecipes({
      config,
      content,
      manifest: { outputs: [], pieces: [] },
      resolved: { articleMarkdown: config.provided.article ?? null, researchNotes: null },
    }).map((recipe) => [recipe.key, recipe.fingerprint]),
  );
}

it("leaves an existing config's images, recipes and fingerprints as they were", async () => {
  const h = revisionFixture();
  fixtures.push(h);
  const config = saved(h);
  // A config saved before the setting, read back the way the database hands it over.
  const stored = runConfigSchema.parse(JSON.parse(JSON.stringify(config))) as RunConfig;
  expect("imageScale" in stored).toBe(false);
  const content = await baseline(stored);
  // Each prompt's Number, exactly: 3 + 1.
  expect(content.imageOrder.map((key) => content.imageDefinitions[key]?.prompt)).toEqual([
    "An orchard",
    "An orchard",
    "An orchard",
    "A lake",
  ]);
  const before = fingerprints(config, content);
  expect(fingerprints(stored, content)).toEqual(before);
  // Absent and explicitly undefined are the same run.
  expect(fingerprints({ ...stored, imageScale: undefined }, content)).toEqual(before);
});

it("plans more images when the setting is on, and the video's recipe follows them", async () => {
  const h = revisionFixture();
  fixtures.push(h);
  const plain = saved(h);
  const plainContent = await baseline(plain);
  // An hour of narration at one image every 5 minutes: 12 images, 8 more than the prompts' 4.
  const scaled: RunConfig = { ...plain, imageScale: { perHour: 12, words: 9000 } };
  const content = await baseline(runConfigSchema.parse(scaled) as RunConfig);
  expect(content.imageOrder.map((key) => content.imageDefinitions[key]?.prompt)).toEqual([
    ...Array.from({ length: 7 }, () => "An orchard"),
    ...Array.from({ length: 5 }, () => "A lake"),
  ]);
  const before = fingerprints(plain, plainContent);
  const after = fingerprints(scaled, content);
  const images = (prints: Record<string, string>) =>
    Object.keys(prints).filter((key) => key.startsWith("image:"));
  expect(images(before)).toHaveLength(4);
  expect(images(after)).toHaveLength(12);
  expect(after["export:video"]).not.toBe(before["export:video"]);
  // Planned once: the same revision rebuilds to the same recipes.
  expect(fingerprints(scaled, content)).toEqual(after);
});
