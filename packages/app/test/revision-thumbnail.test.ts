import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { type FakeImage, fakeImage } from "../src/adapters/fake/image.js";
import { fakeLlm } from "../src/adapters/fake/llm.js";
import { providerError } from "../src/kernel/ports/model.js";
import type { RunConfig } from "../src/slices/admission/model.js";
import { narrationCatalogue } from "../src/slices/rebuild/runtime-narration.fake.js";
import { outputPath } from "../src/slices/storage/layout.js";
import { allTelemetryEvents, insertMachine } from "../src/slices/telemetry/repo.js";
import { composedFixture, current, save, start } from "./revision-rebuild.fake.js";

// The thumbnail over the real runner and the real attempt wrapper: drawn from its template, or
// from a prompt the text model writes first. The image and text models are doubles.

async function thumbnailRun(
  source: "from_prompt" | "prompt_by_llm",
  image: FakeImage | (() => FakeImage) = fakeImage(),
) {
  const llm = fakeLlm({ deltas: ["A weathered dock at dawn."] });
  const h = await composedFixture({
    llm: () => llm,
    image: typeof image === "function" ? image : () => image,
  });
  insertMachine(h.deps.db, {
    machineId: "5b0c1f9e-0d4e-4d7a-9a55-3b1f2f1e7c11",
    noticeSeenAt: new Date().toISOString(),
    appVersion: "test",
  });
  h.setCatalogue({
    ...h.deps.catalogue.read(),
    providers: { ...h.deps.catalogue.read().providers, ...narrationCatalogue.providers },
    llm: narrationCatalogue.llm,
  });
  const base = current(h.deps, h.projectId);
  const config: RunConfig = {
    ...base.revision.config,
    values: { topic: "rope" },
    sources: { ...base.revision.config.sources, images: "off", thumbnail: source },
    llm: { provider: "openrouter", model: "llm" },
    rendered: { ...base.revision.config.rendered, thumbnailPrompt: "A bold rope thumbnail." },
  };
  await save(h.deps, h.projectId, {
    config,
    content: { ...base.revision.content, imageOrder: [], imageDefinitions: {} },
  });
  const run = async () => {
    await start(h.deps, h.projectId, ["thumbnail:image"]);
    await h.runner.settled();
  };
  const thumbnail = () =>
    current(h.deps, h.projectId).outputs.find(
      (row) => row.selected && row.workKey === "thumbnail:image" && row.state === "ready",
    );
  const counted = () =>
    allTelemetryEvents(h.deps.db)
      .map((event) => event.payload)
      .filter((payload) => payload.stage === "thumbnail");
  const close = async () => {
    await h.runner.settled();
    h.audioPreviews.close();
    h.close();
  };
  return { h, llm, run, thumbnail, counted, close };
}

it("sends the rendered template once, in the run's aspect, and keeps what it drew", async () => {
  const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 7, 8, 9]);
  const images = fakeImage({ bytes });
  const t = await thumbnailRun("from_prompt", images);
  try {
    await t.run();
    expect(t.llm.calls()).toBe(0);
    expect(images.seen().map((one) => [one.prompt, one.aspect])).toEqual([
      ["A bold rope thumbnail.", "16:9"],
    ]);
    const stored = t.thumbnail();
    if (stored === undefined) throw new Error("No thumbnail was stored.");
    expect(stored.output.meta).toMatchObject({
      prompt: "A bold rope thumbnail.",
      provider: "fal",
      model: "image",
    });
    expect(readFileSync(outputPath(t.h.deps.paths, t.h.projectId, stored.output.path))).toEqual(
      Buffer.from(bytes),
    );
    expect(t.counted()).toEqual([
      { appVersion: "test", stage: "thumbnail", provider: "fal", model: "image", thumbnails: 1 },
    ]);
    // Run again: the stored thumbnail is kept, not drawn a second time.
    await t.run();
    expect(images.calls()).toBe(1);
    expect(t.thumbnail()?.assetId).toBe(stored.assetId);
  } finally {
    await t.close();
  }
});

it("asks the text model for the prompt once, then draws exactly what it wrote", async () => {
  const images = fakeImage();
  const t = await thumbnailRun("prompt_by_llm", images);
  try {
    await t.run();
    expect(t.llm.calls()).toBe(1);
    const sent =
      t.llm
        .seen()[0]
        ?.map((message) => message.content)
        .join("\n") ?? "";
    expect(sent).toContain("A bold rope thumbnail.");
    expect(sent).toContain("Video title: Saved");
    expect(sent).toContain("topic: rope");
    expect(sent).toContain("Aspect ratio of the thumbnail: 16:9");
    expect(sent).toContain("Saved article.");
    expect(images.seen().map((one) => one.prompt)).toEqual(["A weathered dock at dawn."]);
    const view = current(t.h.deps, t.h.projectId);
    const written = view.pieces.find((row) => row.selected && row.key === "thumbnail:prompt");
    expect(JSON.parse(written?.piece.payload ?? "{}")).toMatchObject({
      prompt: "A weathered dock at dawn.",
    });
    const instructions = view.outputs.find(
      (row) =>
        row.selected && row.workKey === "thumbnail:prompt" && row.output.role === "instructions",
    );
    if (instructions === undefined) throw new Error("The thumbnail instructions were not kept.");
    expect(
      readFileSync(outputPath(t.h.deps.paths, t.h.projectId, instructions.output.path), "utf8"),
    ).toContain("Video title: Saved");
    expect(t.thumbnail()?.output.meta).toMatchObject({ prompt: "A weathered dock at dawn." });
    expect(t.counted()).toEqual([
      {
        appVersion: "test",
        stage: "thumbnail",
        provider: "openrouter",
        model: "llm",
        tokensIn: 11,
        tokensOut: 22,
      },
      { appVersion: "test", stage: "thumbnail", provider: "fal", model: "image", thumbnails: 1 },
    ]);
  } finally {
    await t.close();
  }
});

it("draws again from the prompt it already wrote when the image failed", async () => {
  const images = fakeImage();
  const prompts: string[] = [];
  let refuse = true;
  const t = await thumbnailRun("prompt_by_llm", () => ({
    ...images,
    generate: async (request) => {
      prompts.push(request.prompt);
      if (refuse) throw providerError({ kind: "refusal", message: "Fixture refusal" });
      return images.generate(request);
    },
  }));
  try {
    await t.run();
    expect(t.thumbnail()).toBeUndefined();
    expect(t.counted().filter((payload) => payload.thumbnails !== undefined)).toEqual([]);
    refuse = false;
    await t.run();
    expect(t.llm.calls()).toBe(1);
    expect(prompts).toEqual(["A weathered dock at dawn.", "A weathered dock at dawn."]);
    expect(t.thumbnail()).toBeDefined();
  } finally {
    await t.close();
  }
});

it("keeps every counter when the project itself is deleted", async () => {
  const t = await thumbnailRun("prompt_by_llm");
  try {
    await t.run();
    const before = allTelemetryEvents(t.h.deps.db);
    expect(before.length).toBeGreaterThan(0);
    t.h.deps.db.exec("PRAGMA foreign_keys = ON");
    t.h.deps.db.prepare("DELETE FROM projects WHERE id = ?").run(t.h.projectId);
    expect(
      t.h.deps.db
        .prepare("SELECT count(*) AS n FROM revision_outputs WHERE project_id = ?")
        .get(t.h.projectId),
    ).toEqual({ n: 0 });
    expect(allTelemetryEvents(t.h.deps.db)).toEqual(before);
  } finally {
    await t.close();
  }
});
