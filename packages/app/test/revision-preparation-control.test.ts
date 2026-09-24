import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { fakeLlm } from "../src/adapters/fake/llm.js";
import { fakeTts } from "../src/adapters/fake/tts.js";
import { cancelProject } from "../src/slices/cancel/index.js";
import { pauseProject } from "../src/slices/control/index.js";
import { preparationFixture } from "./revision-preparation.fake.js";
import { current, deferred, start, tone } from "./revision-rebuild.fake.js";

it.each(["pause", "cancel"] as const)(
  "%s during preparation prevents TTS until another reviewed start",
  async (operation) => {
    const entered = deferred<void>();
    const llm = fakeLlm({ deltas: ['{"cues":[]}'] });
    const audio = fakeTts({ bytesFor: () => [tone()] });
    let hold = true;
    const h = await preparationFixture({
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
    });
    try {
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
      expect(audio.calls()).toBeGreaterThan(0);
    } finally {
      await h.runner.abortAll();
      await h.runner.settled();
      h.audioPreviews.close();
      h.close();
    }
  },
  30000,
);
