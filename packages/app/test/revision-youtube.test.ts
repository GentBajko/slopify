import { readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
import { fakeLlm } from "../src/adapters/fake/llm.js";
import { previewRebuild } from "../src/slices/rebuild/service.js";
import { outputPath } from "../src/slices/storage/layout.js";
import { composedFixture, current, save, start } from "./revision-rebuild.fake.js";

// The real aligner downloads a speech model; this one hears every word of the text in the
// first tenth of a second, which is as long as the fake narration lasts.
vi.mock("../src/adapters/alignment/index.js", () => ({
  alignSubtitles: async (request: { readonly text: string }) => {
    const words = request.text.split(/\s+/).filter((word) => word !== "");
    return words.map((text, index) => ({
      text,
      start: (index * 0.09) / words.length,
      end: ((index + 1) * 0.09) / words.length,
    }));
  },
}));

const answer = (first: string) =>
  JSON.stringify({
    summary: "How rope holds.",
    chapters: [
      { start: first, title: "Opening" },
      { start: "0:20", title: "Knots" },
      { start: "0:40", title: "What Do You Want to See?" },
    ],
    hashtags: ["#Rope", "Knots"],
    tags: ["rope", "knots", "sailing knots"],
  });

// With narration and captions off, the timing still runs so the chapters have real times.
// The first answer breaks YouTube's first-chapter rule and is asked again; the second lands
// as description.txt and tags.txt, and later edits decide whether it is still current.
it("writes the YouTube description from the timed narration, asking again on a broken answer", async () => {
  const model = fakeLlm({
    reply: (_request, attempt) => [attempt === 1 ? answer("0:02") : answer("0:00")],
  });
  const h = await composedFixture({ llm: () => model });
  const saved = h.deps.catalogue.read();
  h.setCatalogue({
    ...saved,
    // Room for the whole sentence in one narration request, so the words stay whole.
    tts: saved.tts.map((row) =>
      row.tts === undefined ? row : { ...row, tts: { ...row.tts, maxCharacters: 1000 } },
    ),
    providers: { ...h.deps.catalogue.read().providers, openrouter: { maxConcurrent: 1 } },
    llm: [
      {
        provider: "openrouter",
        id: "text",
        name: "Text",
        enabled: true,
        deprecated: false,
        source: "https://example.test",
        keywords: [],
        pricing: {},
        llm: { webSearch: false },
      },
    ],
  });
  const base = current(h.deps, h.projectId);
  await save(h.deps, h.projectId, {
    config: {
      ...base.revision.config,
      title: "Rope",
      sources: { ...base.revision.config.sources, audio: "generate", images: "off", video: "off" },
      audio: { provider: "openai-tts", model: "tts", voice: "first" },
      llm: { provider: "openrouter", model: "text" },
      chunking: { mode: "whole" },
      provided: { article: "Rope holds knots." },
      // Thirty seconds of silence either side makes a minute of video out of the fake
      // narration's tenth of a second.
      edgeSilenceSeconds: 30,
      youtubeDescription: true,
    },
    content: { ...base.revision.content, imageOrder: [], imageDefinitions: {} },
  });
  expect(current(h.deps, h.projectId).revision.fingerprints).toHaveProperty("subtitles:timing");

  await start(h.deps, h.projectId, ["export:wav", "youtube:description"]);
  await h.runner.settled();

  expect(model.calls()).toBe(2);
  const sent = model.seen()[1]?.at(-1)?.content ?? "";
  expect(sent).toContain("Video title: Rope");
  expect(sent).toContain("Video length: 1:00");
  // The words sit after the 30 s of silence at the start.
  expect(sent).toContain("[0:30] Rope holds knots.");
  const view = current(h.deps, h.projectId);
  const text = (role: string) => {
    const row = view.outputs.find((one) => one.selected && one.output.role === role);
    expect(row).toMatchObject({ state: "ready", workKey: "youtube:description" });
    expect(row?.output.stageKind).toBe("video");
    return readFileSync(outputPath(h.deps.paths, h.projectId, row?.output.path ?? ""), "utf8");
  };
  expect(text("youtube_description")).toBe(
    "How rope holds.\n\n0:00 Opening\n0:20 Knots\n0:40 What Do You Want to See?\n\n#Rope #Knots",
  );
  expect(text("youtube_tags")).toBe("rope, knots, sailing knots");
  expect(view.outputs.some((row) => row.selected && row.output.role === "subtitles_srt")).toBe(
    false,
  );
  expect(
    h.deps.db
      .prepare("SELECT state FROM stages WHERE project_id=? AND kind='video'")
      .get(h.projectId),
  ).toEqual({ state: "done" });

  const affected = async () => {
    const preview = await previewRebuild(h.deps, {
      projectId: h.projectId,
      baseRevisionId: current(h.deps, h.projectId).revision.id,
      request: { kind: "allAffected" },
    });
    if (!preview.ok) throw new Error(JSON.stringify(preview));
    return preview.value.work.filter((row) => row.disposition !== "reuse").map((row) => row.key);
  };
  // Nothing is left to rebuild: the published description is the current one.
  expect(await affected()).toEqual([]);
  // A new prompt makes only the description stale.
  const done = current(h.deps, h.projectId);
  await save(h.deps, h.projectId, {
    config: {
      ...done.revision.config,
      descriptionPrompt: "Short",
      rendered: { ...done.revision.config.rendered, description: "Keep it short." },
    },
    content: { ...done.revision.content, promptTemplates: { description: "Keep it short." } },
  });
  expect(await affected()).toEqual(["youtube:description"]);
  // New narration is new timing, so the description is written again after it.
  const prompted = current(h.deps, h.projectId);
  await save(h.deps, h.projectId, {
    config: { ...prompted.revision.config, provided: { article: "Rope holds many knots." } },
    content: { ...prompted.revision.content, articleMarkdown: "Rope holds many knots." },
  });
  expect(await affected()).toEqual(
    expect.arrayContaining(["subtitles:timing", "youtube:description", "export:wav"]),
  );
});
