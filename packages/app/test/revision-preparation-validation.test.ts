import { expect, it } from "vitest";
import { fakeLlm } from "../src/adapters/fake/llm.js";
import { manualClock } from "../src/kernel/clock.fake.js";
import { sqliteAttempts } from "../src/kernel/runner/attempt-repo.js";
import type { StageContext } from "../src/kernel/runner/index.js";
import { stageProviders } from "../src/kernel/runner/providers.js";
import { claimWork, maySubmit } from "../src/kernel/runner/work-authority.js";
import {
  narrationFixture,
  preparationCatalogue,
} from "../src/slices/rebuild/runtime-narration.fake.js";
import { executeProviderRecipe } from "../src/slices/rebuild/runtime-provider.js";
import { executionStages } from "../src/slices/rebuild/runtime-store.js";
import { workPieces } from "../src/slices/rebuild/work-records.js";

it.each([
  '{"text":"rewritten narration"}',
  '{"cues":[{"sentence":1,"kind":"instruction","text":"A direction longer than the entire request limit"}]}',
])(
  "retries invalid or unrenderable preparation through the real attempt wrapper",
  async (answer) => {
    const h = await narrationFixture("Exact narration.", {
      config: {
        narrationPrompt: "Delivery",
        llm: { provider: "openrouter", model: "llm" },
        audio: { provider: "inworld", model: "inworld-tts-2", voice: "v" },
        rendered: { narration: "Restrained." },
      },
      catalogue: preparationCatalogue,
    });
    try {
      const stage = executionStages(h.deps, h.projectId).find((row) =>
        workPieces(h.deps.db, row.work.workId).some((piece) =>
          piece.key.startsWith("narration:prepare:"),
        ),
      );
      if (stage === undefined) throw new Error("Missing preparation invocation");
      const piece = workPieces(h.deps.db, stage.work.workId)[0];
      if (piece === undefined) throw new Error("Missing preparation piece");
      expect(claimWork(h.deps.db, stage.work)).toBe(true);
      const clock = manualClock();
      const llm = fakeLlm({ deltas: [answer] });
      const context: StageContext = {
        stage,
        work: stage.work,
        signal: new AbortController().signal,
        maySubmit: (id) => maySubmit(h.deps.db, stage.work, id),
        emit: () => {},
      };
      const providers = stageProviders(
        {
          clock,
          log: h.deps.log,
          attempts: sqliteAttempts(h.deps.db, h.deps.ids),
          registry: {
            llm: () => llm,
            tts: () => {
              throw new Error("Unexpected TTS");
            },
            image: () => {
              throw new Error("Unexpected image");
            },
            list: async () => [],
          },
        },
        context,
      );
      await expect(
        clock.settle(executeProviderRecipe(h.deps, context, providers, piece)),
      ).rejects.toThrow();
      expect(llm.calls()).toBe(4);
      expect(h.deps.db.prepare("SELECT outcome FROM attempts ORDER BY rowid").all()).toEqual(
        Array.from({ length: 4 }, () => ({ outcome: "other" })),
      );
      expect(h.view().pieces.some((row) => row.selected && row.key === piece.key)).toBe(false);
      expect(h.calls).toEqual([]);
    } finally {
      h.close();
    }
  },
);
