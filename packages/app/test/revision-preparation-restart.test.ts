import { join } from "node:path";
import { expect, it } from "vitest";
import { fakeLlm } from "../src/adapters/fake/llm.js";
import { fakeTts } from "../src/adapters/fake/tts.js";
import { openDb } from "../src/kernel/db/index.js";
import { recoverWork } from "../src/slices/rebuild/repo.js";
import { executionPlan } from "../src/slices/rebuild/runtime-plan.js";
import { previewRebuild } from "../src/slices/rebuild/service.js";
import { preparationFixture } from "./revision-preparation.fake.js";
import { current, deferred, start, tone } from "./revision-rebuild.fake.js";

it.each([false, true])(
  "recovers persisted preparation without automatic resubmission (uncertain=%s)",
  async (uncertain) => {
    const entered = deferred<void>();
    const gate = deferred<void>();
    const llm = fakeLlm({
      deltas: ['{"cues":[{"sentence":1,"kind":"instruction","text":"calm"}]}'],
    });
    const audio = fakeTts({ bytesFor: () => [tone()] });
    const h = await preparationFixture({
      llm: () => ({
        ...llm,
        complete: async function* (request) {
          entered.resolve();
          if (uncertain) await gate.promise;
          yield* llm.complete(request);
        },
      }),
      tts: () => audio,
    });
    let reopened: ReturnType<typeof openDb> | undefined;
    let next: ReturnType<typeof h.compose> | undefined;
    try {
      const key = executionPlan(h.deps, h.view, h.catalogue).recipes.find(
        (row) => row.input.kind === "llm",
      )?.key;
      if (!key) throw new Error("Missing preparation");
      await start(h.deps, h.projectId, [key]);
      const snapshotCatalogue = h.deps.db
        .prepare(
          "SELECT recipe_context FROM revision_work WHERE recipe_context IS NOT NULL ORDER BY rowid DESC LIMIT 1",
        )
        .get()?.recipe_context;
      expect(JSON.parse(String(snapshotCatalogue)).tts).toEqual(h.catalogue.tts);
      if (uncertain) await entered.promise;
      else await h.runner.settled();
      expect(audio.calls()).toBe(0);
      const snapshot = join(h.deps.paths.dataDir, "preparation.sqlite");
      h.deps.db.prepare("VACUUM INTO ?").run(snapshot);
      gate.resolve();
      await h.runner.settled();
      const before = llm.calls();
      reopened = openDb(snapshot);
      recoverWork(reopened);
      next = h.compose({ ...h.deps, db: reopened });
      next.setCatalogue(h.catalogue);
      next.runner.tick(h.projectId);
      await next.runner.settled();
      expect(llm.calls()).toBe(before);
      expect(audio.calls()).toBe(0);
      const preview = await previewRebuild(next.deps, {
        projectId: h.projectId,
        baseRevisionId: current(next.deps, h.projectId).revision.id,
        request: { kind: "selected", workKeys: ["export:wav"] },
      });
      if (!preview.ok) throw new Error(JSON.stringify(preview));
      expect(preview.value.warnings.some((warning) => /charg/i.test(warning))).toBe(uncertain);
      await start(next.deps, h.projectId, ["export:wav"]);
      await next.runner.settled();
      expect(llm.calls()).toBe(before + (uncertain ? 1 : 0));
      expect(audio.calls()).toBeGreaterThan(0);
      expect(
        current(next.deps, h.projectId).outputs.some(
          (row) => row.selected && row.available && row.output.role === "audio_export",
        ),
      ).toBe(true);
    } finally {
      gate.resolve();
      await h.runner.settled();
      await next?.runner.settled();
      next?.audioPreviews.close();
      reopened?.close();
      h.audioPreviews.close();
      h.close();
    }
  },
  30000,
);
