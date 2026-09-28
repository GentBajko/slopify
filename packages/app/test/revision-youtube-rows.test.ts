import { expect, it, vi } from "vitest";
import { fakeLlm } from "../src/adapters/fake/llm.js";
import { materializeAdmittedWork } from "../src/slices/rebuild/runtime-materialize.js";
import { composedFixture, current, save, start } from "./revision-rebuild.fake.js";

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

const answer = JSON.stringify({
  summary: "How rope holds.",
  chapters: [
    { start: "0:00", title: "Opening" },
    { start: "0:20", title: "Knots" },
    { start: "0:40", title: "Close" },
  ],
  hashtags: ["#Rope"],
  tags: ["rope"],
  pinnedComment: "Thanks for listening.",
});

// Every narration chunk that lands changes what the joined audio, the timing, the export and
// the YouTube description read, so each of their fingerprints moves while they wait. The
// runner re-plans on every tick; the waiting row must take the new inputs, not be retired for
// a fresh one each time - on a long narration that was one never-run row per chunk.
it.each([
  ["one request", 1000],
  ["three chunks", 20],
])("admits one row per step while the narration lands (%s)", async (_name, maxCharacters) => {
  const model = fakeLlm({ reply: () => [answer] });
  const h = await composedFixture({ llm: () => model });
  const saved = h.deps.catalogue.read();
  h.setCatalogue({
    ...saved,
    tts: saved.tts.map((row) =>
      row.tts === undefined ? row : { ...row, tts: { ...row.tts, maxCharacters } },
    ),
    providers: { ...saved.providers, openrouter: { maxConcurrent: 1 } },
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
      chunking: maxCharacters === 1000 ? { mode: "whole" } : { mode: "characters", characters: 20 },
      provided: { article: "Rope holds knots. Knots hold boats. Boats hold people." },
      edgeSilenceSeconds: 30,
      youtubeDescription: true,
    },
    content: { ...base.revision.content, imageOrder: [], imageDefinitions: {} },
  });
  await start(h.deps, h.projectId, ["export:wav", "youtube:description"]);
  await h.runner.settled();
  for (let tick = 0; tick < 5; tick++) materializeAdmittedWork(h.deps, h.projectId);

  expect(model.calls()).toBe(1);
  const admitted = h.deps.db
    .prepare(
      "SELECT p.work_key,count(*) AS n,sum(p.state='done') AS done FROM revision_work w JOIN revision_work_pieces p ON p.work_id=w.id WHERE w.admission_id IS NOT NULL AND p.work_key IN ('audio:body:concat','subtitles:timing','export:wav','youtube:description') GROUP BY p.work_key ORDER BY p.work_key",
    )
    .all();
  expect(admitted).toEqual(
    ["audio:body:concat", "export:wav", "subtitles:timing", "youtube:description"].map(
      (work_key) => ({ work_key, n: 1, done: 1 }),
    ),
  );
  // No row is marked finished without its piece having run.
  expect(
    h.deps.db
      .prepare(
        "SELECT count(*) AS n FROM revision_work w JOIN revision_work_pieces p ON p.work_id=w.id WHERE w.state='done' AND p.state!='done'",
      )
      .get(),
  ).toEqual({ n: 0 });
});
