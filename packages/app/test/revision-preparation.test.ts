import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { fakeLlm } from "../src/adapters/fake/llm.js";
import { fakeTts } from "../src/adapters/fake/tts.js";
import { providerError } from "../src/kernel/ports/model.js";
import { revisionTranscript } from "../src/slices/rebuild/runtime-export-inputs.js";
import { executionPlan } from "../src/slices/rebuild/runtime-plan.js";
import { getRevisionView } from "../src/slices/revisions/view.js";
import { outputPath } from "../src/slices/storage/layout.js";
import { preparationFixture } from "./revision-preparation.fake.js";
import { current, deferred, save, start, tone } from "./revision-rebuild.fake.js";

const cues = '{"cues":[{"sentence":1,"kind":"instruction","text":"calm"}]}';
it.each([false, true])(
  "runs reviewed preparation with an override, generated entries and six downloads (upgraded=%s)",
  async (upgraded) => {
    const markdown = "**First** [literal] words. Second sentence.\n\nOther paragraph.";
    const llm = fakeLlm({
      reply: (request) =>
        request.messages.some((message) => message.content.includes('"sentences"'))
          ? [
              JSON.stringify({
                cues: [
                  { sentence: 1, kind: "instruction", text: "calm" },
                  { sentence: 1, kind: "sound", sound: "sigh" },
                  ...(request.messages.some((message) => message.content.includes('"sentence":2'))
                    ? [{ sentence: 2, kind: "reset" }]
                    : []),
                ],
              }),
            ]
          : ["Welcome. Goodbye."],
    });
    const audio = fakeTts({ bytesFor: () => [tone()] });
    const h = await preparationFixture({ llm: () => llm, tts: () => audio }, markdown, upgraded);
    try {
      const first = executionPlan(h.deps, h.view, h.catalogue).recipes.find(
        (row) => row.input.kind === "llm" && row.input.preparation?.segment === "body",
      );
      if (first?.input.kind !== "llm" || !first.input.preparation)
        throw new Error("Missing preparation");
      await save(h.deps, h.projectId, {
        config: {
          ...h.view.revision.config,
          intro: { name: "Intro", mode: "llm" },
          outro: { name: "Outro", mode: "llm" },
          rendered: { ...h.view.revision.config.rendered, intro: "Introduce.", outro: "End." },
        },
        content: {
          ...h.view.revision.content,
          narrationOverrides: {
            [first.input.preparation.logicalKey]: {
              kind: "text",
              text: "Edited [literal] words. Exact second sentence.",
            },
          },
        },
      });
      expect(llm.calls()).toBe(0);
      expect(audio.calls()).toBe(0);
      await start(h.deps, h.projectId, [
        "export:wav",
        "narration:files:body",
        "narration:files:intro",
        "narration:files:outro",
      ]);
      await h.runner.settled();
      const view = current(h.deps, h.projectId);
      expect(view.articleMarkdown).toBe(markdown);
      if (upgraded)
        expect(h.deps.db.prepare("SELECT body FROM prompts WHERE id='original'").get()?.body).toBe(
          "Keep every original detail.",
        );
      expect(llm.calls()).toBe(6);
      const files = view.outputs.filter(
        (row) =>
          row.selected &&
          row.available &&
          ["narration_txt", "tts_script"].includes(row.output.role),
      );
      expect(files).toHaveLength(6);
      const plan = executionPlan(h.deps, view, h.catalogue);
      expect(revisionTranscript(h.deps, { view, plan }, "body")).toBe(
        "Edited [literal] words. Exact second sentence.\nOther paragraph.",
      );
      expect(audio.seen().every((text) => text.length <= 24)).toBe(true);
      expect(audio.seen().some((text) => text.includes("[sigh]"))).toBe(true);
      expect(audio.seen().some((text) => text.includes("[reset]"))).toBe(true);
      for (const row of files) {
        const text = readFileSync(outputPath(h.deps.paths, h.projectId, row.output.path), "utf8");
        expect(text.includes("[calm]")).toBe(row.output.role === "tts_script");
      }
    } finally {
      await h.runner.settled();
      h.audioPreviews.close();
      h.close();
    }
  },
  30000,
);

it("retains preparation and completed physical audio when the second TTS request fails", async () => {
  const llm = fakeLlm({ deltas: [cues] });
  const audio = fakeTts({ bytesFor: () => [tone()] });
  const requests: string[] = [];
  let fail = true;
  const h = await preparationFixture({
    llm: () => llm,
    tts: () => ({
      ...audio,
      synthesize: async (request) => {
        requests.push(request.text);
        if (fail && requests.length === 2)
          throw providerError({ kind: "refusal", message: "Fixture refusal" });
        return audio.synthesize(request);
      },
    }),
  });
  try {
    await start(h.deps, h.projectId, ["export:wav"]);
    await h.runner.settled();
    const first = current(h.deps, h.projectId).pieces.find(
      (row) => row.selected && row.available && row.piece.kind === "chunk",
    );
    expect(first).toBeDefined();
    expect(llm.calls()).toBe(1);
    fail = false;
    await start(h.deps, h.projectId, ["export:wav"]);
    await h.runner.settled();
    expect(llm.calls()).toBe(1);
    expect(requests.filter((text) => text === requests[0])).toHaveLength(1);
    expect(
      current(h.deps, h.projectId).pieces.find((row) => row.selected && row.key === first?.key)
        ?.assetId,
    ).toBe(first?.assetId);
    expect(
      current(h.deps, h.projectId).outputs.some(
        (row) => row.selected && row.available && row.output.role === "audio_export",
      ),
    ).toBe(true);
  } finally {
    await h.runner.settled();
    h.audioPreviews.close();
    h.close();
  }
}, 30000);

it.each(["article", "override"] as const)(
  "keeps a late preparation answer in its origin after a %s edit",
  async (change) => {
    const entered = deferred<void>();
    const gate = deferred<void>();
    const llm = fakeLlm({ deltas: [cues] });
    const audio = fakeTts({ bytesFor: () => [tone()] });
    const h = await preparationFixture({
      llm: () => ({
        ...llm,
        complete: async function* (request) {
          entered.resolve();
          await gate.promise;
          yield* llm.complete(request);
        },
      }),
      tts: () => audio,
    });
    try {
      await start(h.deps, h.projectId, ["export:wav"]);
      await entered.promise;
      const preparation = executionPlan(h.deps, h.view, h.catalogue).recipes.find(
        (row) => row.input.kind === "llm" && row.input.preparation,
      );
      if (preparation?.input.kind !== "llm" || !preparation.input.preparation)
        throw new Error("Missing preparation");
      await save(h.deps, h.projectId, {
        config: h.view.revision.config,
        content: {
          ...h.view.revision.content,
          ...(change === "article"
            ? { articleMarkdown: "Changed words.", articleEdited: true }
            : {
                narrationOverrides: {
                  [preparation.input.preparation.logicalKey]: {
                    kind: "text",
                    text: "Changed words.",
                  },
                },
              }),
        },
      });
      gate.resolve();
      await h.runner.settled();
      const origin = getRevisionView(h.deps, h.projectId, h.view.revision.id);
      expect(
        origin?.pieces.some((row) => row.available && row.key.startsWith("narration:prepare:")),
      ).toBe(true);
      expect(
        current(h.deps, h.projectId).pieces.some(
          (row) =>
            row.selected && row.piece.state === "done" && row.key.startsWith("narration:prepare:"),
        ),
      ).toBe(false);
      expect(audio.calls()).toBe(0);
    } finally {
      gate.resolve();
      await h.runner.settled();
      h.audioPreviews.close();
      h.close();
    }
  },
  30000,
);
