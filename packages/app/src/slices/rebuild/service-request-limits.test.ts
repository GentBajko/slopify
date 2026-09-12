import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { parseCatalogue } from "../../catalog/store.js";
import { stageKinds } from "../../kernel/pipeline.js";
import { ensureBaseline } from "../revisions/adopt.js";
import { revisionFixture } from "../revisions/revision.fake.js";
import { planPreview } from "./preview-plan.js";
import { createRebuildDeps } from "./service.fake.js";
import { previewRebuild, startRebuild } from "./service.js";
import { localReadiness } from "./service-readiness.js";

const catalogue = parseCatalogue(
  readFileSync(new URL("../../assets/models.yaml", import.meta.url), "utf8"),
);

it("admits an Inworld asynchronous narration request above the streaming limit", async () => {
  const h = revisionFixture();
  try {
    const config = {
      ...h.config,
      sources: { ...h.config.sources, audio: "generate" as const },
      audio: { provider: "inworld", model: "inworld-tts-2", voice: "voice" },
      chunking: { mode: "whole" as const },
      provided: { article: "A".repeat(6000) },
    };
    h.deps.db
      .prepare("UPDATE projects SET config=? WHERE id=?")
      .run(JSON.stringify(config), h.projectId);
    for (const kind of stageKinds)
      h.deps.db
        .prepare("INSERT INTO stages(id,project_id,kind,source,state) VALUES (?,?,?,?,'pending')")
        .run(kind, h.projectId, kind, config.sources[kind]);
    h.deps.db
      .prepare("INSERT INTO voices(id,provider,name,voice_id) VALUES (?,?,?,?)")
      .run("saved-voice", "inworld", "Saved voice", "voice");
    const baseline = await ensureBaseline(h.deps, h.projectId);
    if (!baseline.ok) throw new Error(JSON.stringify(baseline));
    const helper = createRebuildDeps(h.deps, catalogue);
    const selection = {
      projectId: h.projectId,
      baseRevisionId: baseline.view.revision.id,
      request: { kind: "allAffected" as const },
    };
    const preview = await previewRebuild(helper.deps, selection);
    if (!preview.ok) throw new Error(JSON.stringify(preview));
    const planned = planPreview(h.deps, baseline.view, catalogue, selection.request, "inspection");
    if (!planned.ok) throw new Error(JSON.stringify(planned));
    expect(
      planned.value.execution.recipes.flatMap((row) =>
        row.input.kind === "tts" ? [row.input.text.length] : [],
      ),
    ).toEqual([6000]);
    const reduced = {
      ...catalogue,
      tts: catalogue.tts.map((row) =>
        row.id === "inworld-tts-2" ? { ...row, tts: { ...row.tts, maxCharacters: 4000 } } : row,
      ),
    };
    expect(
      localReadiness(helper.deps, planned.value.execution, baseline.view, [], reduced),
    ).toEqual([
      expect.objectContaining({
        field: expect.stringMatching(/^work\.audio:body:.*\.text$/),
        message: expect.stringContaining("exceeds the current model limit"),
      }),
    ]);
    expect(
      await startRebuild(helper.deps, {
        projectId: h.projectId,
        baseRevisionId: baseline.view.revision.id,
        previewId: preview.value.id,
        idempotencyKey: randomUUID(),
        acknowledgeUnknownCosts: true,
        confirmedProvidedWorkKeys: preview.value.providedReuseRequired,
      }),
    ).toMatchObject({ ok: true });
    expect(helper.ticks).toEqual([h.projectId]);
    expect(h.deps.db.prepare("SELECT count(*) AS n FROM attempts").get()?.n).toBe(0);
  } finally {
    h.close();
  }
});
