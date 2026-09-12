import { randomUUID } from "node:crypto";
import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { fakeTts } from "../src/adapters/fake/tts.js";
import { openDb } from "../src/kernel/db/index.js";
import { claimWork } from "../src/kernel/runner/work-authority.js";
import { recoverWork } from "../src/slices/rebuild/repo.js";
import { executionStages } from "../src/slices/rebuild/runtime-store.js";
import { previewRebuild, startRebuild } from "../src/slices/rebuild/service.js";
import { outputPath } from "../src/slices/storage/layout.js";
import { composedFixture, current, deferred, save, start, tone } from "./revision-rebuild.fake.js";

it("recovers a submitted unknown narration outcome held and warns before an explicit retry", async () => {
  const gate = deferred<void>();
  const entered = deferred<void>();
  const audio = fakeTts({ bytesFor: () => [tone()] });
  let hold = true;
  const h = await composedFixture({
    tts: () => ({
      ...audio,
      synthesize: async (request) => {
        if (hold && request.text === "efgh") {
          entered.resolve();
          await gate.promise;
        }
        return audio.synthesize(request);
      },
    }),
  });
  let closed = false;
  let reopened: ReturnType<typeof openDb> | undefined;
  try {
    const base = current(h.deps, h.projectId);
    await save(h.deps, h.projectId, {
      config: {
        ...base.revision.config,
        sources: { ...base.revision.config.sources, audio: "generate" },
        audio: { provider: "openai-tts", model: "tts", voice: "first" },
        chunking: { mode: "paragraph" },
        provided: { article: "abcdefgh" },
      },
      content: base.revision.content,
    });
    const preview = await previewRebuild(h.deps, {
      projectId: h.projectId,
      baseRevisionId: current(h.deps, h.projectId).revision.id,
      request: { kind: "selected", workKeys: ["export:wav"] },
    });
    if (!preview.ok) throw new Error(JSON.stringify(preview));
    const parts = preview.value.work.filter(
      (row) => row.stage === "audio" && row.kind === "provider",
    );
    const first = parts[0];
    const second = parts[1];
    if (first === undefined || second === undefined)
      throw new Error("Expected two physical requests");
    await start(h.deps, h.projectId, [first.key]);
    await h.runner.settled();
    const completed = current(h.deps, h.projectId).pieces.find(
      (row) => row.key === first.key && row.selected && row.available,
    );
    if (completed === undefined) throw new Error("Missing completed part");
    const assetPath = h.deps.db
      .prepare("SELECT path FROM project_assets WHERE id=?")
      .get(completed.assetId ?? "")?.path;
    if (typeof assetPath !== "string") throw new Error("Missing part path");
    const bytes = readFileSync(outputPath(h.deps.paths, h.projectId, assetPath));
    await start(h.deps, h.projectId, [second.key]);
    await entered.promise;
    const submitted = h.deps.db
      .prepare(
        "SELECT p.id,p.submitted_at,p.continuation,w.revision_id FROM revision_work_pieces p JOIN revision_work w ON w.id=p.work_id WHERE p.work_key=? AND p.submitted_at IS NOT NULL",
      )
      .get(second.key);
    expect(submitted).toMatchObject({
      submitted_at: expect.any(String),
      continuation: null,
      revision_id: current(h.deps, h.projectId).revision.id,
    });
    const runningPreview = await previewRebuild(h.deps, {
      projectId: h.projectId,
      baseRevisionId: current(h.deps, h.projectId).revision.id,
      request: { kind: "selected", workKeys: [second.key] },
    });
    if (!runningPreview.ok) throw new Error(JSON.stringify(runningPreview));
    expect(runningPreview.value.costs.unknown).toBe(0);
    const snapshot = join(h.deps.paths.dataDir, "interrupted.sqlite");
    h.deps.db.prepare("VACUUM INTO ?").run(snapshot);
    gate.resolve();
    await h.runner.settled();
    h.deps.db.close();
    closed = true;
    reopened = openDb(snapshot);
    recoverWork(reopened);
    const next = h.compose({ ...h.deps, db: reopened });
    try {
      const interrupted = executionStages(next.deps, h.projectId).find(
        (row) => row.state === "pending",
      );
      if (interrupted === undefined) throw new Error("Missing recovered invocation");
      expect(claimWork(reopened, interrupted.work)).toBe(false);
      const calls = audio.calls();
      next.runner.tick(h.projectId);
      await next.runner.settled();
      expect(audio.calls()).toBe(calls);
      expect(
        current(next.deps, h.projectId).pieces.find((row) => row.key === first.key && row.selected)
          ?.assetId,
      ).toBe(completed.assetId);
      expect(readFileSync(outputPath(next.deps.paths, h.projectId, assetPath))).toEqual(bytes);
      expect(
        await startRebuild(next.deps, {
          projectId: h.projectId,
          baseRevisionId: runningPreview.value.baseRevisionId,
          previewId: runningPreview.value.id,
          idempotencyKey: randomUUID(),
          acknowledgeUnknownCosts: true,
          confirmedProvidedWorkKeys: [],
        }),
      ).toEqual({ ok: false, reason: "stale-preview" });
      const retry = await previewRebuild(next.deps, {
        projectId: h.projectId,
        baseRevisionId: current(next.deps, h.projectId).revision.id,
        request: { kind: "selected", workKeys: [second.key] },
      });
      if (!retry.ok) throw new Error(JSON.stringify(retry));
      expect(retry.value.warnings.join(" ")).toMatch(/may.*charg|charg.*again/i);
      hold = false;
      await start(next.deps, h.projectId, [second.key]);
      await next.runner.settled();
      expect(audio.calls()).toBe(calls + 1);
      expect(audio.seen().filter((text) => text === "abcd")).toHaveLength(1);
    } finally {
      await next.runner.settled();
      next.audioPreviews.close();
    }
  } finally {
    gate.resolve();
    h.audioPreviews.close();
    reopened?.close();
    if (closed) rmSync(h.deps.paths.dataDir, { recursive: true, force: true });
    else {
      await h.runner.settled();
      h.close();
    }
  }
});

it("retrieves a persisted narration job after reopening without another submission or model readiness", async () => {
  const gate = deferred<void>();
  const entered = deferred<void>();
  const audio = fakeTts({ bytesFor: () => [tone()] });
  let submissions = 0;
  const retrievals: string[] = [];
  const h = await composedFixture({
    tts: () => ({
      ...audio,
      synthesize: async (request) => {
        const token = request.continuation?.read();
        if (token === undefined) {
          submissions += 1;
          request.continuation?.write("retained-job");
          entered.resolve();
          await gate.promise;
        } else {
          retrievals.push(token);
        }
        return audio.synthesize(request);
      },
    }),
  });
  let closed = false;
  let reopened: ReturnType<typeof openDb> | undefined;
  try {
    const base = current(h.deps, h.projectId);
    await save(h.deps, h.projectId, {
      config: {
        ...base.revision.config,
        sources: { ...base.revision.config.sources, audio: "generate" },
        audio: { provider: "openai-tts", model: "tts", voice: "first" },
        provided: { article: "abcd" },
      },
      content: base.revision.content,
    });
    const preview = await previewRebuild(h.deps, {
      projectId: h.projectId,
      baseRevisionId: current(h.deps, h.projectId).revision.id,
      request: { kind: "selected", workKeys: ["export:wav"] },
    });
    if (!preview.ok) throw new Error(JSON.stringify(preview));
    const part = preview.value.work.find((row) => row.stage === "audio" && row.kind === "provider");
    if (part === undefined) throw new Error("Missing narration request");
    await start(h.deps, h.projectId, [part.key]);
    await entered.promise;
    expect(
      h.deps.db
        .prepare("SELECT continuation FROM revision_work_pieces WHERE continuation IS NOT NULL")
        .get()?.continuation,
    ).toBe("retained-job");
    const snapshot = join(h.deps.paths.dataDir, "known-job.sqlite");
    h.deps.db.prepare("VACUUM INTO ?").run(snapshot);
    gate.resolve();
    await h.runner.settled();
    h.deps.db.close();
    closed = true;
    reopened = openDb(snapshot);
    recoverWork(reopened);
    const next = h.compose({ ...h.deps, db: reopened });
    try {
      const catalogue = next.deps.catalogue.read();
      next.setCatalogue({
        ...catalogue,
        tts: catalogue.tts.map((model) => ({ ...model, enabled: false })),
      });
      next.runner.tick(h.projectId);
      await next.runner.settled();
      expect(retrievals).toEqual([]);
      const resumed = await start(
        {
          ...next.deps,
          providers: async () => {
            throw new Error("Retrieval needs no readiness probe");
          },
        },
        h.projectId,
        [part.key],
      );
      expect(resumed.preview.costs.unknown).toBe(0);
      expect(resumed.preview.warnings).toEqual([]);
      await next.runner.settled();
      expect(submissions).toBe(1);
      expect(retrievals).toEqual(["retained-job"]);
      expect(
        current(next.deps, h.projectId).pieces.find((row) => row.key === part.key && row.selected)
          ?.available,
      ).toBe(true);
      expect(reopened.prepare("SELECT outcome FROM attempts ORDER BY rowid").all()).toEqual([
        { outcome: "ok" },
      ]);
    } finally {
      await next.runner.settled();
      next.audioPreviews.close();
    }
  } finally {
    gate.resolve();
    h.audioPreviews.close();
    reopened?.close();
    if (closed) rmSync(h.deps.paths.dataDir, { recursive: true, force: true });
    else {
      await h.runner.settled();
      h.close();
    }
  }
});
