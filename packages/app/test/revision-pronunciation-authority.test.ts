import { expect, it } from "vitest";
import { fakeLlm } from "../src/adapters/fake/llm.js";
import { fakeTts } from "../src/adapters/fake/tts.js";
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
