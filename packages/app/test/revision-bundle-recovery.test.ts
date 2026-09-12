import { randomUUID } from "node:crypto";
import { readFileSync, rmSync } from "node:fs";
import { expect, it } from "vitest";
import { fakeTts } from "../src/adapters/fake/tts.js";
import { previewRebuild, startRebuild } from "../src/slices/rebuild/service.js";
import { restoreRevision } from "../src/slices/revisions/mutations.js";
import { getRevisionView } from "../src/slices/revisions/view.js";
import { outputPath } from "../src/slices/storage/layout.js";
import { composedFixture, current, save, start, tone } from "./revision-rebuild.fake.js";

it("restores a WAV with missing bytes and explicitly rebuilds only its local export", async () => {
  const audio = fakeTts({ bytesFor: () => [tone()] });
  const h = await composedFixture({ tts: () => audio });
  try {
    const base = current(h.deps, h.projectId);
    await save(h.deps, h.projectId, {
      config: {
        ...base.revision.config,
        sources: { ...base.revision.config.sources, audio: "generate", images: "off" },
        audio: { provider: "openai-tts", model: "tts", voice: "first" },
        provided: { article: "abcd" },
      },
      content: {
        ...base.revision.content,
        articleMarkdown: "abcd",
        articleEdited: true,
        imageOrder: [],
        imageDefinitions: {},
      },
    });
    await start(h.deps, h.projectId, ["export:wav"]);
    await h.runner.settled();
    const completed = current(h.deps, h.projectId);
    const wav = completed.outputs.find((row) => row.selected && row.output.role === "audio_export");
    const params = completed.outputs.find(
      (row) => row.selected && row.output.role === "render_params",
    );
    if (wav === undefined || params === undefined) throw new Error("Missing completed WAV bundle");
    const bytes = readFileSync(outputPath(h.deps.paths, h.projectId, wav.output.path));
    const requests = audio.calls();
    rmSync(outputPath(h.deps.paths, h.projectId, wav.output.path));
    const restored = await restoreRevision(h.deps, {
      projectId: h.projectId,
      baseRevisionId: completed.revision.id,
      targetRevisionId: completed.revision.id,
      idempotencyKey: "restore-missing-wav",
    });
    if (!restored.ok) throw new Error(JSON.stringify(restored));
    const preview = await previewRebuild(h.deps, {
      projectId: h.projectId,
      baseRevisionId: restored.view.revision.id,
      request: { kind: "allAffected" },
    });
    if (!preview.ok) throw new Error(JSON.stringify(preview));
    expect(
      preview.value.work.filter((row) => row.disposition !== "reuse").map((row) => row.key),
    ).toEqual(["export:wav"]);
    const admitted = await startRebuild(h.deps, {
      projectId: h.projectId,
      baseRevisionId: restored.view.revision.id,
      previewId: preview.value.id,
      idempotencyKey: randomUUID(),
      acknowledgeUnknownCosts: true,
      confirmedProvidedWorkKeys: [],
    });
    if (!admitted.ok) throw new Error(JSON.stringify(admitted));
    await h.runner.settled();
    const rebuilt = current(h.deps, h.projectId).outputs.find(
      (row) => row.selected && row.output.role === "audio_export",
    );
    expect(rebuilt).toMatchObject({ available: true, state: "ready" });
    expect(rebuilt?.assetId).not.toBe(wav.assetId);
    if (rebuilt === undefined) throw new Error("Missing replacement WAV");
    expect(readFileSync(outputPath(h.deps.paths, h.projectId, rebuilt.output.path))).toEqual(bytes);
    expect(audio.calls()).toBe(requests);
    expect(
      getRevisionView(h.deps, h.projectId, completed.revision.id)?.outputs.find(
        (row) => row.recordId === params.recordId,
      ),
    ).toMatchObject({ available: true, assetId: params.assetId });
    expect(
      getRevisionView(h.deps, h.projectId, completed.revision.id)?.outputs.find(
        (row) => row.recordId === wav.recordId,
      ),
    ).toMatchObject({ available: false, assetId: wav.assetId });
  } finally {
    await h.runner.settled();
    h.audioPreviews.close();
    h.close();
  }
});
