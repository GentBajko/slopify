import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { fakeLlm } from "../src/adapters/fake/llm.js";
import { fakeTts } from "../src/adapters/fake/tts.js";
import { cancelProject } from "../src/slices/cancel/index.js";
import { pauseProject } from "../src/slices/control/index.js";
import { startRebuild } from "../src/slices/rebuild/service.js";
import { getRevisionView } from "../src/slices/revisions/view.js";
import { preparationFixture } from "./revision-preparation.fake.js";
import { current, deferred, save, start, tone } from "./revision-rebuild.fake.js";

const article = "John.\n\n## Pronunciation Glossary\nJohn: /dʒɑn/";

it.each([
  { operation: "pause", glossary: false },
  { operation: "pause", glossary: true },
  { operation: "cancel", glossary: false },
  { operation: "cancel", glossary: true },
] as const)(
  "$operation during preparation prevents TTS (glossary=$glossary)",
  async ({ operation, glossary }) => {
    const entered = deferred<void>();
    const llm = fakeLlm({ deltas: ['{"cues":[]}'] });
    const audio = fakeTts({ bytesFor: () => [tone()] });
    let hold = true;
    const h = await preparationFixture(
      {
        llm: () => ({
          ...llm,
          complete: async function* (request) {
            entered.resolve();
            if (hold)
              await new Promise<void>((resolve) =>
                request.signal.addEventListener("abort", () => resolve(), { once: true }),
              );
            yield* llm.complete(request);
          },
        }),
        tts: () => audio,
      },
      article,
      false,
      glossary,
    );
    try {
      expect(llm.calls()).toBe(0);
      expect(audio.calls()).toBe(0);
      await start(h.deps, h.projectId, ["export:wav"]);
      await entered.promise;
      const input = {
        baseRevisionId: current(h.deps, h.projectId).revision.id,
        idempotencyKey: randomUUID(),
      };
      const stopped =
        operation === "pause"
          ? await pauseProject(h.deps, h.projectId, input)
          : await cancelProject(
              {
                ...h.deps,
                abort: (id) => h.runner.abortProject(id, "cancel"),
                hasInflight: h.runner.hasInflight,
                settleCheckpoints: () => {},
              },
              h.projectId,
              input,
            );
      expect(stopped.ok).toBe(true);
      await h.runner.settled();
      h.runner.tick(h.projectId);
      await h.runner.settled();
      expect(audio.calls()).toBe(0);
      expect(
        current(h.deps, h.projectId).pieces.some(
          (row) => row.selected && row.key.startsWith("narration:prepare:"),
        ),
      ).toBe(false);
      hold = false;
      await start(h.deps, h.projectId, ["export:wav"]);
      await h.runner.settled();
      expect(audio.seen()).toEqual([glossary ? "/dʒɑn/." : "John."]);
    } finally {
      await h.runner.abortAll();
      await h.runner.settled();
      h.audioPreviews.close();
      h.close();
    }
  },
  30_000,
);

it.each([false, true])(
  "retains an incompatible late TTS result only in its origin; Start replay submits once (glossary=%s)",
  async (glossary) => {
    const entered = deferred<void>();
    const gate = deferred<void>();
    const llm = fakeLlm({ deltas: ['{"cues":[]}'] });
    const audio = fakeTts({ bytesFor: () => [tone()] });
    let hold = true;
    const h = await preparationFixture(
      {
        llm: () => llm,
        tts: () => ({
          ...audio,
          synthesize: async (request) => {
            if (hold) {
              entered.resolve();
              await gate.promise;
            }
            return audio.synthesize(request);
          },
        }),
      },
      article,
      false,
      glossary,
    );
    try {
      const admitted = await start(h.deps, h.projectId, ["export:wav"]);
      await entered.promise;
      const originId = current(h.deps, h.projectId).revision.id;
      const old = current(h.deps, h.projectId);
      const changedArticle = glossary
        ? "John.\n\n## Pronunciation Glossary\nJohn: /dʒɒn/"
        : "Jane.\n\n## Pronunciation Glossary\nJane: /dʒeɪn/";
      const changed = await save(h.deps, h.projectId, {
        config: old.revision.config,
        content: { ...old.revision.content, articleMarkdown: changedArticle, articleEdited: true },
      });
      // An old base cannot grant new work using a fresh idempotency key.
      expect(
        await startRebuild(h.deps, { ...admitted.input, idempotencyKey: randomUUID() }),
      ).toEqual({ ok: false, reason: "conflict" });
      gate.resolve();
      await h.runner.settled();
      const origin = getRevisionView(h.deps, h.projectId, originId);
      const late = origin?.pieces.find((row) => row.available && row.piece.kind === "chunk");
      if (!late?.assetId) throw new Error("Missing late origin audio");
      const head = current(h.deps, h.projectId);
      expect(head.revision.id).toBe(changed.revision.id);
      expect(head.pieces.some((row) => row.selected && row.assetId === late.assetId)).toBe(false);
      h.runner.tick(h.projectId);
      await h.runner.settled();
      expect(audio.calls()).toBe(1);
      hold = false;
      const replacement = await start(h.deps, h.projectId, ["export:wav"]);
      const replay = await startRebuild(h.deps, replacement.input);
      expect(replay.ok).toBe(true);
      if (!replay.ok) throw new Error(JSON.stringify(replay));
      expect(replay.value.replayed).toBe(true);
      await h.runner.settled();
      expect(audio.seen()).toEqual(glossary ? ["/dʒɑn/.", "/dʒɒn/."] : ["John.", "Jane."]);
      expect(llm.calls()).toBe(glossary ? 1 : 2);
      expect(
        current(h.deps, h.projectId).outputs.some(
          (row) =>
            row.selected &&
            row.available &&
            row.state === "ready" &&
            row.output.role === "audio_export",
        ),
      ).toBe(true);
    } finally {
      gate.resolve();
      await h.runner.abortAll();
      await h.runner.settled();
      h.audioPreviews.close();
      h.close();
    }
  },
  30_000,
);
