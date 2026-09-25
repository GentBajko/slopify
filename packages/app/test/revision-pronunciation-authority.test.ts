import { expect, it } from "vitest";
import { fakeLlm } from "../src/adapters/fake/llm.js";
import { fakeTts } from "../src/adapters/fake/tts.js";
import { revisionTranscript } from "../src/slices/rebuild/runtime-export-inputs.js";
import { executionPlan } from "../src/slices/rebuild/runtime-plan.js";
import { startRebuild } from "../src/slices/rebuild/service.js";
import { getRevisionView } from "../src/slices/revisions/view.js";
import { preparationFixture } from "./revision-preparation.fake.js";
import { current, deferred, save, start, tone } from "./revision-rebuild.fake.js";

it("does not let a late reusable cue answer or replay authorize a changed pronunciation", async () => {
  const entered = deferred<void>();
  const gate = deferred<void>();
  const llm = fakeLlm({ deltas: ['{"cues":[]}'] });
  const audio = fakeTts({ bytesFor: () => [tone()] });
  const article = (ipa: string) => `John reads.\n\n## Pronunciation Glossary\nJohn: /${ipa}/`;
  const h = await preparationFixture(
    {
      llm: () => ({
        ...llm,
        complete: async function* (request) {
          entered.resolve();
          await gate.promise;
          yield* llm.complete(request);
        },
      }),
      tts: () => audio,
    },
    article("dʒɑn"),
  );
  try {
    const choice = h.view.revision.config.audio;
    if (choice === undefined) throw new Error("Missing voice");
    const origin = await save(h.deps, h.projectId, {
      config: { ...h.view.revision.config, audio: { ...choice, usePronunciationGlossary: true } },
      content: h.view.revision.content,
    });
    const admitted = await start(h.deps, h.projectId, ["export:wav"]);
    await entered.promise;
    await save(h.deps, h.projectId, {
      config: origin.revision.config,
      content: {
        ...origin.revision.content,
        articleEdited: true,
        articleMarkdown: article("dʒɒn"),
      },
    });
    gate.resolve();
    await h.runner.settled();
    h.runner.tick(h.projectId);
    await h.runner.settled();
    expect(llm.calls()).toBe(1);
    expect(audio.calls()).toBe(0);
    expect(
      getRevisionView(h.deps, h.projectId, origin.revision.id)?.pieces.some(
        (row) => row.available && row.key.startsWith("narration:prepare:"),
      ),
    ).toBe(true);
    const replay = await startRebuild(h.deps, admitted.input);
    expect(replay).toEqual({
      ok: true,
      value: { ...admitted.result.value, replayed: true },
    });
    await h.runner.settled();
    expect(audio.calls()).toBe(0);
    await start(h.deps, h.projectId, ["export:wav"]);
    await h.runner.settled();
    expect(llm.calls()).toBe(1);
    expect(audio.seen()).toEqual(["/dʒɒn/ reads."]);
    expect(
      current(h.deps, h.projectId).outputs.some(
        (row) => row.selected && row.available && row.output.role === "audio_export",
      ),
    ).toBe(true);
  } finally {
    gate.resolve();
    await h.runner.abortAll();
    await h.runner.settled();
    h.audioPreviews.close();
    h.close();
  }
}, 30_000);

it("binds a carried late TTS result to the receiving revision's clean spelling", async () => {
  const entered = deferred<void>();
  const gate = deferred<void>();
  const audio = fakeTts({ bytesFor: () => [tone()] });
  const h = await preparationFixture(
    {
      tts: () => ({
        ...audio,
        synthesize: async (request) => {
          entered.resolve();
          await gate.promise;
          return audio.synthesize(request);
        },
      }),
    },
    "John reads.\n\n## Pronunciation Glossary\nJohn: /dʒɑn/\nJon: /dʒɑn/",
    false,
    true,
  );
  try {
    const { narrationPrompt: _prompt, ...config } = h.view.revision.config;
    const origin = await save(h.deps, h.projectId, {
      config,
      content: h.view.revision.content,
    });
    const request = executionPlan(h.deps, origin, h.catalogue).recipes.find(
      (row) => row.input.kind === "tts",
    );
    if (request?.input.kind !== "tts") throw new Error("Missing narration request");
    await start(h.deps, h.projectId, ["narration:files:body", "export:wav"]);
    await entered.promise;
    await save(h.deps, h.projectId, {
      config,
      content: {
        ...origin.revision.content,
        narrationOverrides: { [request.input.logicalKey]: { kind: "text", text: "Jon reads." } },
      },
    });
    await start(h.deps, h.projectId, ["narration:files:body", "export:wav"]);
    gate.resolve();
    await h.runner.settled();
    h.runner.tick(h.projectId);
    await h.runner.settled();
    expect(audio.seen()).toEqual(["/dʒɑn/ reads."]);
    const view = current(h.deps, h.projectId);
    const plan = executionPlan(h.deps, view, h.catalogue);
    expect(revisionTranscript(h.deps, { view, plan }, "body")).toBe("Jon reads.");
    expect(
      view.outputs.some(
        (row) =>
          row.selected &&
          row.available &&
          row.output.role === "narration_txt" &&
          row.state === "ready",
      ),
    ).toBe(true);
    const original = getRevisionView(h.deps, h.projectId, origin.revision.id);
    const oldPart = original?.pieces.find((row) => row.key === request.key && row.available);
    const newPart = view.pieces.find((row) => row.key === request.key && row.selected);
    expect(oldPart?.assetId).toBe(newPart?.assetId);
    expect(JSON.parse(oldPart?.piece.payload ?? "{}").spokenText).toBe("John reads.");
    expect(JSON.parse(newPart?.piece.payload ?? "{}").spokenText).toBe("Jon reads.");
  } finally {
    gate.resolve();
    await h.runner.abortAll();
    await h.runner.settled();
    h.audioPreviews.close();
    h.close();
  }
}, 30_000);
