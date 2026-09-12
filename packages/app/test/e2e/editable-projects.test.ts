import { randomUUID } from "node:crypto";
import { readFileSync, rmSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { type Boot, boot } from "../../src/main.js";
import type { RevisionEdit } from "../../src/slices/revisions/model.js";
import {
  revisionMutationSuccessSchema,
  revisionSummarySchema,
} from "../../src/slices/revisions/schema.js";
import { outputPath } from "../../src/slices/storage/layout.js";
import { stagedFileSchema } from "../../src/slices/storage/schema.js";
import { projectId, seedLegacy, verifyPcmWav } from "./editable-projects.fixture.js";
import {
  admissionSuccessSchema,
  currentPath,
  download,
  executionCounts,
  historyPath,
  post,
  prepare,
  previewSuccessSchema,
  projectBodySchema,
  projectPath,
  request,
  revision,
  stagingListSchema,
  wav,
} from "./editable-projects.http.js";

const running = new Set<Boot>();
const roots: string[] = [];

afterEach(async () => {
  for (const app of running) await stopApp(app);
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

async function startApp(dataDir: string): Promise<Boot> {
  const app = await boot({ port: 0, host: "127.0.0.1", dataDir, open: false });
  running.add(app);
  return app;
}

async function stopApp(app: Boot): Promise<void> {
  await app.stop();
  running.delete(app);
}

describe("editable projects through the real app", () => {
  it("upgrades, explicitly rebuilds, restores and retains both WAVs across restart", async () => {
    const fixture = seedLegacy();
    roots.push(fixture.dataDir);
    let app = await startApp(fixture.dataDir);
    const baseline = await prepare(app);
    expect(baseline.created).toBe(true);
    expect((await request(app, projectPath, projectBodySchema)).revisionId).toBe(
      baseline.view.revision.id,
    );
    const again = await prepare(app);
    expect(again.created).toBe(false);
    expect(again.view.revision.id).toBe(baseline.view.revision.id);
    const original = wav(baseline.view);
    expect(original.output.path).toBe("audio.wav");
    expect(original.available).toBe(true);

    const form = new FormData();
    form.set("file", new File([new Uint8Array(fixture.replacement)], "replacement.mp3"));
    const staged = await request(
      app,
      "/api/staging/audio",
      stagedFileSchema,
      { method: "POST", body: form },
      201,
    );
    expect(staged.stageKind).toBe("audio");
    await expect
      .poll(
        async () => {
          const list = await request(app, "/api/staging", stagingListSchema);
          return list.files.find((one) => one.id === staged.id)?.state;
        },
        { timeout: 10000, interval: 50 },
      )
      .toBe("staged");
    const edit: RevisionEdit = {
      config: baseline.view.revision.config,
      content: baseline.view.revision.content,
      uploads: [{ stagedFileId: staged.id, destination: { kind: "provided", stage: "audio" } }],
    };
    const saveBody = {
      baseRevisionId: baseline.view.revision.id,
      idempotencyKey: randomUUID(),
      edit,
    };
    const saved = await post(
      app,
      `${projectPath}/revisions`,
      revisionMutationSuccessSchema,
      saveBody,
    );
    expect(saved.duplicate).toBe(false);
    expect(saved.view.revision.content.provided.audio).not.toBe(staged.id);
    expect(saved.view.revision.content.provided.audio).not.toBe(
      baseline.view.revision.content.provided.audio,
    );
    expect(wav(saved.view)).toMatchObject({ assetId: original.assetId, state: "outdated" });

    // Successful Save consumes staging; a retry must still return its original receipt.
    expect(
      (await request(app, "/api/staging", stagingListSchema)).files.some(
        (one) => one.id === staged.id,
      ),
    ).toBe(false);
    const duplicate = await post(
      app,
      `${projectPath}/revisions`,
      revisionMutationSuccessSchema,
      saveBody,
    );
    expect(duplicate.duplicate).toBe(true);
    expect(duplicate.view.revision.id).toBe(saved.view.revision.id);
    expect(executionCounts(app)).toEqual({ admissions: 0, attempts: 0 });
    expect(await download(app, currentPath, "legacy-title-audio-export.wav")).toEqual(
      fixture.oldWav,
    );

    // Save and restart leave the replacement export awaiting an explicit Start.
    await stopApp(app);
    app = await startApp(fixture.dataDir);
    const resumed = await prepare(app);
    expect(resumed.created).toBe(false);
    expect(resumed.view.revision.id).toBe(saved.view.revision.id);
    expect(wav(resumed.view)).toMatchObject({ assetId: original.assetId, state: "outdated" });
    expect(executionCounts(app)).toEqual({ admissions: 0, attempts: 0 });
    expect(await download(app, currentPath, "legacy-title-audio-export.wav")).toEqual(
      fixture.oldWav,
    );

    const { value: preview } = await post(
      app,
      `${projectPath}/rebuild/preview`,
      previewSuccessSchema,
      { baseRevisionId: saved.view.revision.id, request: { kind: "allAffected" } },
    );
    expect(preview.baseRevisionId).toBe(saved.view.revision.id);
    expect(preview.work).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "export:wav", kind: "local", disposition: "local" }),
      ]),
    );
    expect(preview.work.filter((one) => one.kind === "provider")).toEqual([]);
    expect(executionCounts(app)).toEqual({ admissions: 0, attempts: 0 });
    const startBody = {
      baseRevisionId: saved.view.revision.id,
      idempotencyKey: randomUUID(),
      previewId: preview.id,
      acknowledgeUnknownCosts: true,
      confirmedProvidedWorkKeys: preview.providedReuseRequired,
    };
    const started = await post(
      app,
      `${projectPath}/rebuild`,
      admissionSuccessSchema,
      startBody,
      202,
    );
    expect(started.value.revisionId).toBe(saved.view.revision.id);
    expect(started.value.workIds.length).toBeGreaterThan(0);
    await expect
      .poll(
        async () => {
          const body = await request(app, projectPath, projectBodySchema);
          if (body.project.status === "failed") throw new Error(JSON.stringify(body.stages));
          const output = body.outputs.find((one) => one.role === "audio_export");
          return (
            body.revisionId === saved.view.revision.id &&
            body.project.status === "done" &&
            output !== undefined &&
            output.id !== original.output.id
          );
        },
        { timeout: 30000, interval: 50 },
      )
      .toBe(true);

    const rebuilt = await revision(app, saved.view.revision.id);
    const replacement = wav(rebuilt);
    expect(replacement).toMatchObject({ state: "ready", available: true });
    expect(replacement.assetId).not.toBe(original.assetId);
    expect(replacement.output.path).not.toBe(original.output.path);
    const replacementPath = outputPath(app.paths, projectId, replacement.output.path);
    const newWav = readFileSync(replacementPath);
    verifyPcmWav(replacementPath);
    expect(newWav.equals(fixture.oldWav)).toBe(false);
    expect(await download(app, currentPath, "legacy-title-audio-export.wav")).toEqual(newWav);
    const replayed = await post(
      app,
      `${projectPath}/rebuild`,
      admissionSuccessSchema,
      startBody,
      202,
    );
    expect(replayed.value).toMatchObject({
      admissionId: started.value.admissionId,
      workIds: started.value.workIds,
      replayed: true,
    });
    expect(executionCounts(app)).toEqual({ admissions: 1, attempts: 0 });

    const titled = await post(app, `${projectPath}/revisions`, revisionMutationSuccessSchema, {
      baseRevisionId: rebuilt.revision.id,
      idempotencyKey: randomUUID(),
      edit: {
        config: { ...rebuilt.revision.config, title: "Revised title" },
        content: rebuilt.revision.content,
      },
    });
    expect(wav(titled.view)).toMatchObject({ assetId: replacement.assetId, state: "ready" });
    expect((await request(app, projectPath, projectBodySchema)).project).toMatchObject({
      title: "Revised title",
      config: { title: "Revised title" },
    });
    expect(await download(app, currentPath, "revised-title-audio-export.wav")).toEqual(newWav);
    expect(
      await download(app, historyPath(baseline.view), "legacy-title-audio-export.wav"),
    ).toEqual(fixture.oldWav);
    const restored = await post(
      app,
      `${projectPath}/revisions/restore`,
      revisionMutationSuccessSchema,
      {
        baseRevisionId: titled.view.revision.id,
        idempotencyKey: randomUUID(),
        targetRevisionId: baseline.view.revision.id,
      },
    );
    expect(restored.view.revision).toMatchObject({
      parentId: titled.view.revision.id,
      restoredFromId: baseline.view.revision.id,
    });
    expect(restored.view.revision.config).toEqual(baseline.view.revision.config);
    expect(wav(restored.view)).toMatchObject({ assetId: original.assetId, state: "ready" });
    expect(executionCounts(app)).toEqual({ admissions: 1, attempts: 0 });

    await stopApp(app);
    app = await startApp(fixture.dataDir);
    const final = await prepare(app);
    expect(final.created).toBe(false);
    expect(final.view.revision.id).toBe(restored.view.revision.id);
    expect((await request(app, projectPath, projectBodySchema)).project).toMatchObject({
      title: "Legacy title",
      config: { title: "Legacy title" },
    });
    expect(await download(app, currentPath, "legacy-title-audio-export.wav")).toEqual(
      fixture.oldWav,
    );
    expect(
      await download(app, historyPath(baseline.view), "legacy-title-audio-export.wav"),
    ).toEqual(fixture.oldWav);
    expect(await download(app, historyPath(rebuilt), "legacy-title-audio-export.wav")).toEqual(
      newWav,
    );
    expect(await download(app, historyPath(titled.view), "revised-title-audio-export.wav")).toEqual(
      newWav,
    );
    expect(executionCounts(app)).toEqual({ admissions: 1, attempts: 0 });
    const { revisions } = await request(
      app,
      `${projectPath}/revisions`,
      z.object({ revisions: z.array(revisionSummarySchema) }),
    );
    expect(revisions.map((one) => one.id).toSorted()).toEqual(
      [
        baseline.view.revision.id,
        saved.view.revision.id,
        titled.view.revision.id,
        restored.view.revision.id,
      ].toSorted(),
    );
    expect(revisions.filter((one) => one.current).map((one) => one.id)).toEqual([
      restored.view.revision.id,
    ]);
  }, 120000);
});
