import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { fakeImage } from "../src/adapters/fake/image.js";
import { fakeLlm } from "../src/adapters/fake/llm.js";
import { fakeTts } from "../src/adapters/fake/tts.js";
import { recoverProject } from "../src/slices/rebuild/recovery.js";
import { narrationCatalogue } from "../src/slices/rebuild/runtime-narration.fake.js";
import { executionPlan } from "../src/slices/rebuild/runtime-plan.js";
import { findRevisionDownload } from "../src/slices/revisions/downloads.js";
import { outputPath } from "../src/slices/storage/layout.js";
import { preparationFixture } from "./revision-preparation.fake.js";
import { composedFixture, current, save, start, tone } from "./revision-rebuild.fake.js";

// Each case drives full pipelines with real FFmpeg renders and waits on those processes; a
// two-core CI runner needs several minutes for the research case.
it("reruns identical research chapters and uses fresh notes downstream without touching literal images", async () => {
  let round = 1;
  const requests: { kind: string; round: number; text: string }[] = [];
  const llm = fakeLlm({
    reply: (req) => {
      const text = [
        ...req.messages.map((row) => row.content),
        ...(req.documents ?? []).map((row) => row.content),
      ].join("\n");
      const kind = text.includes("You are planning the web research")
        ? "planner"
        : text.includes("You are researching one chapter")
          ? "chapter"
          : text.includes("You are the editor of the research")
            ? "notes"
            : "article";
      requests.push({ kind, round, text });
      return [
        kind === "planner"
          ? "First\nSecond"
          : kind === "chapter"
            ? `Finding ${round}.\nSources\nhttps://example.test`
            : kind === "notes"
              ? `Notes ${round}.\nSources\nhttps://example.test`
              : `# Article\nWords ${round}.`,
      ];
    },
  });
  const images = fakeImage();
  const audio = fakeTts({ bytesFor: () => [tone()] });
  const h = await composedFixture({ llm: () => llm, image: () => images, tts: () => audio });
  try {
    h.setCatalogue({
      ...h.deps.catalogue.read(),
      providers: { ...h.deps.catalogue.read().providers, ...narrationCatalogue.providers },
      llm: narrationCatalogue.llm.map((model) => ({
        ...model,
        llm: { ...model.llm, webSearch: true },
      })),
    });
    const base = current(h.deps, h.projectId);
    await save(h.deps, h.projectId, {
      config: {
        ...base.revision.config,
        sources: {
          ...base.revision.config.sources,
          research: "generate",
          article: "generate",
          audio: "generate",
          thumbnail: "prompt_by_llm",
        },
        llm: { provider: "openrouter", model: "llm" },
        audio: { provider: "openai-tts", model: "tts", voice: "first" },
        intro: { name: "Opening", mode: "llm" },
        outro: { name: "Closing", mode: "llm" },
        rendered: {
          article: "Same brief",
          intro: "Opening",
          outro: "Closing",
          thumbnailPrompt: "Cover",
        },
      },
      content: { ...base.revision.content, articleMarkdown: undefined, articleEdited: false },
    });
    const run = (action: { kind: "resume" } | { kind: "rerun"; stage: "research" | "article" }) =>
      recoverProject(h.deps, h.projectId, {
        baseRevisionId: current(h.deps, h.projectId).revision.id,
        idempotencyKey: randomUUID(),
        action,
      });
    expect((await run({ kind: "resume" })).ok).toBe(true);
    await h.runner.settled();
    const first = current(h.deps, h.projectId);
    const beforeAudio = audio.calls();
    const old = first.outputs
      .filter((row) => row.selected)
      .map((row) => ({
        row,
        bytes: readFileSync(outputPath(h.deps.paths, h.projectId, row.output.path)),
      }));
    round = 2;
    expect((await run({ kind: "rerun", stage: "research" })).ok).toBe(true);
    await h.runner.settled();
    expect(requests.filter((row) => row.round === 2 && row.kind === "chapter")).toHaveLength(2);
    const article = requests.find((row) => row.round === 2 && row.kind === "article");
    expect(article?.text).toContain("Notes 2.");
    expect(article?.text).not.toContain("Notes 1.");
    expect(
      images.seen().filter((row) => row.prompt === "One" || row.prompt === "Two"),
    ).toHaveLength(2);
    expect(audio.calls()).toBeGreaterThan(beforeAudio);
    const second = current(h.deps, h.projectId);
    for (const key of ["entry:intro:text", "entry:outro:text", "thumbnail:prompt"])
      expect(
        second.pieces.some((row) => row.selected && row.key === key && row.piece.state === "done"),
      ).toBe(true);
    for (const { row, bytes } of old) {
      const download = findRevisionDownload(h.deps, h.projectId, first.revision.id, row.recordId);
      if (!download.ok) throw new Error("History download missing");
      expect(readFileSync(download.download.path)).toEqual(bytes);
      if (row.workKey.startsWith("image:"))
        expect(
          second.outputs.find((one) => one.selected && one.workKey === row.workKey)?.assetId,
        ).toBe(row.assetId);
    }
    const researchCalls = requests.filter((row) => row.kind !== "article").length;
    round = 3;
    expect((await run({ kind: "rerun", stage: "article" })).ok).toBe(true);
    await h.runner.settled();
    expect(requests.filter((row) => row.kind !== "article")).toHaveLength(researchCalls);
    expect(
      images.seen().filter((row) => row.prompt === "One" || row.prompt === "Two"),
    ).toHaveLength(2);
    expect(current(h.deps, h.projectId).revision.content.promptTemplates).toEqual(
      first.revision.content.promptTemplates,
    );
  } finally {
    await h.runner.settled();
    h.audioPreviews.close();
    h.close();
  }
}, 600_000);

it("reruns audio, reuses preparation and overrides, then reruns only the local export", async () => {
  const llm = fakeLlm({ deltas: ['{"cues":[]}'] });
  const audio = fakeTts({ bytesFor: () => [tone()] });
  const h = await preparationFixture({ llm: () => llm, tts: () => audio }, "Short sentence.", true);
  try {
    const preparationRecipe = executionPlan(h.deps, h.view, h.catalogue).recipes.find(
      (row) => row.input.kind === "llm" && row.input.preparation?.segment === "body",
    );
    if (preparationRecipe?.input.kind !== "llm" || !preparationRecipe.input.preparation)
      throw new Error("Missing preparation group");
    await save(h.deps, h.projectId, {
      config: h.view.revision.config,
      content: {
        ...h.view.revision.content,
        narrationOverrides: {
          [preparationRecipe.input.preparation.logicalKey]: {
            kind: "text",
            text: "My saved words.",
          },
        },
      },
    });
    const request = (stage?: "audio" | "video") =>
      recoverProject(h.deps, h.projectId, {
        baseRevisionId: current(h.deps, h.projectId).revision.id,
        idempotencyKey: randomUUID(),
        action: stage === undefined ? { kind: "resume" } : { kind: "rerun", stage },
      });
    expect((await request()).ok).toBe(true);
    await h.runner.settled();
    const first = current(h.deps, h.projectId);
    const preparation = first.pieces.find(
      (row) => row.selected && row.key.startsWith("narration:prepare:"),
    );
    const chunks = first.pieces.filter((row) => row.selected && row.piece.kind === "chunk");
    const count = audio.calls();
    const llmCount = llm.calls();
    expect((await request("audio")).ok).toBe(true);
    await h.runner.settled();
    const second = current(h.deps, h.projectId);
    expect(audio.calls()).toBeGreaterThan(count);
    expect(llm.calls()).toBe(llmCount);
    expect(
      second.pieces.find((row) => row.selected && row.key === preparation?.key)?.piece.id,
    ).toBe(preparation?.piece.id);
    for (const row of chunks)
      expect(second.pieces.find((one) => one.selected && one.key === row.key)?.assetId).not.toBe(
        row.assetId,
      );
    expect(second.revision.content.narrationOverrides).toEqual(
      first.revision.content.narrationOverrides,
    );
    expect(audio.seen().every((text) => text === "My saved words.")).toBe(true);
    const providerCalls = audio.calls();
    expect((await request("video")).ok).toBe(true);
    await h.runner.settled();
    expect(audio.calls()).toBe(providerCalls);
    expect(llm.calls()).toBe(llmCount);
    expect(h.deps.db.prepare("SELECT body FROM prompts WHERE id='original'").get()?.body).toBe(
      "Keep every original detail.",
    );
  } finally {
    await h.runner.settled();
    h.audioPreviews.close();
    h.close();
  }
}, 600_000);

it("reruns only generated images, then thumbnail, then local video, retaining supplied media and History", async () => {
  const images = fakeImage({
    bytes: readFileSync(new URL("../../site/public/assets/og.png", import.meta.url)),
  });
  const audio = fakeTts({ bytesFor: () => [tone()] });
  const h = await composedFixture({ image: () => images, tts: () => audio });
  try {
    const base = current(h.deps, h.projectId);
    await save(h.deps, h.projectId, {
      config: {
        ...base.revision.config,
        sources: {
          ...base.revision.config.sources,
          audio: "generate",
          video: "generate",
          thumbnail: "from_prompt",
        },
        audio: { provider: "openai-tts", model: "tts", voice: "first" },
        rendered: { ...base.revision.config.rendered, thumbnailPrompt: "Cover" },
        provided: { article: "abcd" },
      },
      content: { ...base.revision.content, articleMarkdown: "abcd", articleEdited: true },
    });
    const resume = await recoverProject(h.deps, h.projectId, {
      baseRevisionId: current(h.deps, h.projectId).revision.id,
      idempotencyKey: randomUUID(),
      action: { kind: "resume" },
    });
    expect(resume.ok).toBe(true);
    await h.runner.settled();
    const generated = current(h.deps, h.projectId);
    const supplied = generated.outputs.find((row) => row.selected && row.workKey === "image:one");
    if (!supplied) throw new Error("Missing supplied image source");
    await save(h.deps, h.projectId, {
      config: generated.revision.config,
      content: {
        ...generated.revision.content,
        imageDefinitions: {
          ...generated.revision.content.imageDefinitions,
          one: { source: "provide", prompt: null, assetId: supplied.assetId },
        },
      },
    });
    await start(h.deps, h.projectId, ["export:video"]);
    await h.runner.settled();
    for (const stage of ["images", "thumbnail", "video"] as const) {
      const before = current(h.deps, h.projectId);
      const saved = before.outputs.filter((row) => row.selected && row.state === "ready");
      const bytes = new Map(
        saved.map((row) => [
          row.recordId,
          readFileSync(outputPath(h.deps.paths, h.projectId, row.output.path)),
        ]),
      );
      const video = saved.find((row) => row.workKey === "export:video");
      if (!video) throw new Error("Missing ready video");
      const providerCalls = { images: images.calls(), audio: audio.calls() };
      const input = {
        baseRevisionId: before.revision.id,
        idempotencyKey: randomUUID(),
        action: { kind: "rerun" as const, stage },
      };
      const result = await recoverProject(h.deps, h.projectId, input);
      expect(result.ok).toBe(true);
      expect(await recoverProject(h.deps, h.projectId, input)).toEqual(result);
      await h.runner.settled();
      const after = current(h.deps, h.projectId);
      expect(after.revision.parentId).toBe(before.revision.id);
      expect(audio.calls()).toBe(providerCalls.audio);
      expect(images.calls()).toBe(providerCalls.images + (stage === "video" ? 0 : 1));
      expect(
        after.outputs.find((row) => row.selected && row.workKey === "image:one")?.assetId,
      ).toBe(supplied.assetId);
      for (const row of saved) {
        const affected =
          stage === "images"
            ? ["image:two", "export:video"]
            : stage === "thumbnail"
              ? ["thumbnail:image"]
              : ["export:video"];
        const next = after.outputs.find(
          (one) =>
            one.selected && one.workKey === row.workKey && one.output.role === row.output.role,
        );
        if (affected.includes(row.workKey)) expect(next?.assetId).not.toBe(row.assetId);
        else expect(next?.assetId).toBe(row.assetId);
        const download = findRevisionDownload(
          h.deps,
          h.projectId,
          before.revision.id,
          row.recordId,
        );
        if (!download.ok) throw new Error("Missing historical download");
        expect(readFileSync(download.download.path)).toEqual(bytes.get(row.recordId));
      }
    }
  } finally {
    await h.runner.settled();
    h.audioPreviews.close();
    h.close();
  }
}, 600_000);
