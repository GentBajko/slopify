import { randomUUID } from "node:crypto";
import { readFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { fakeImage } from "../src/adapters/fake/image.js";
import { fakeLlm } from "../src/adapters/fake/llm.js";
import { fakeTts } from "../src/adapters/fake/tts.js";
import { openDb } from "../src/kernel/db/index.js";
import { providerError } from "../src/kernel/ports/model.js";
import { cancelProject } from "../src/slices/cancel/index.js";
import { changeCheckpoints } from "../src/slices/checkpoints/change.js";
import { settleReleasedCheckpoints } from "../src/slices/checkpoints/recovery.js";
import { listCheckpoints } from "../src/slices/checkpoints/repo.js";
import { pauseProject } from "../src/slices/control/index.js";
import { recoverProject } from "../src/slices/rebuild/recovery.js";
import { recoverWork } from "../src/slices/rebuild/repo.js";
import { deleteVoice } from "../src/slices/settings/repo.js";
import { outputPath } from "../src/slices/storage/layout.js";
import { preparationFixture } from "./revision-preparation.fake.js";
import { composedFixture, current, deferred, save, start, tone } from "./revision-rebuild.fake.js";

it.each(["failed", "paused", "canceled"] as const)(
  "recovers %s work, preserves bytes and assembles export",
  async (state) => {
    const audio = fakeTts({ bytesFor: () => [tone()] });
    const llm = fakeLlm({ deltas: ['{"cues":[]}'] });
    const calls: string[] = [];
    let fail = true;
    const h = await preparationFixture({
      llm: () => llm,
      tts: () => ({
        ...audio,
        synthesize: async (request) => {
          calls.push(request.text);
          if (fail && calls.length === 2)
            throw providerError({ kind: "refusal", message: "Fixture interruption" });
          return audio.synthesize(request);
        },
      }),
    });
    try {
      const run = (kind: "resume" | "retry") =>
        recoverProject(h.deps, h.projectId, {
          baseRevisionId: current(h.deps, h.projectId).revision.id,
          idempotencyKey: randomUUID(),
          action: kind === "resume" ? { kind } : { kind, stage: "audio" },
        });
      expect((await run("resume")).ok).toBe(true);
      await h.runner.settled();
      const first = current(h.deps, h.projectId).pieces.find(
        (row) =>
          row.selected && row.available && row.assetId !== null && row.piece.kind === "chunk",
      );
      if (!first) throw new Error("Missing completed physical narration");
      const path = h.deps.db
        .prepare("SELECT path FROM project_assets WHERE id=?")
        .get(first.assetId)?.path;
      if (typeof path !== "string") throw new Error("Missing asset path");
      const bytes = readFileSync(outputPath(h.deps.paths, h.projectId, path));
      const control = {
        baseRevisionId: current(h.deps, h.projectId).revision.id,
        idempotencyKey: randomUUID(),
      };
      if (state === "paused") await pauseProject(h.deps, h.projectId, control);
      if (state === "canceled")
        await cancelProject(
          {
            ...h.deps,
            abort: h.runner.abortProject,
            settleCheckpoints: (id) => settleReleasedCheckpoints(h.deps, id),
          },
          h.projectId,
          control,
        );
      fail = false;
      expect((await run(state === "failed" ? "retry" : "resume")).ok).toBe(true);
      await h.runner.settled();
      expect((await run("resume")).ok).toBe(true);
      await h.runner.settled();
      const after = current(h.deps, h.projectId);
      expect(after.pieces.find((row) => row.selected && row.key === first.key)?.assetId).toBe(
        first.assetId,
      );
      expect(readFileSync(outputPath(h.deps.paths, h.projectId, path))).toEqual(bytes);
      expect(calls.filter((text) => text === calls[0])).toHaveLength(1);
      expect(llm.calls()).toBe(1);
      expect(
        after.outputs.some(
          (row) => row.selected && row.state === "ready" && row.output.role === "audio_export",
        ),
      ).toBe(true);
      const beforeNoop = calls.length;
      expect((await run("resume")).ok).toBe(true);
      await h.runner.settled();
      expect(calls).toHaveLength(beforeNoop);
      expect(
        h.deps.db.prepare("SELECT count(*) AS n FROM attempts WHERE outcome='ok'").get()?.n,
      ).toBeGreaterThan(0);
    } finally {
      await h.runner.settled();
      h.audioPreviews.close();
      h.close();
    }
  },
  90000,
);

it("does not release a checkpoint, but recovers independent work", async () => {
  const images = fakeImage();
  const h = await composedFixture({ image: () => images });
  try {
    const base = current(h.deps, h.projectId);
    expect(
      changeCheckpoints(h.deps, {
        projectId: h.projectId,
        revisionId: base.revision.id,
        stages: ["images"],
      }).ok,
    ).toBe(true);
    expect(
      (
        await recoverProject(h.deps, h.projectId, {
          baseRevisionId: base.revision.id,
          idempotencyKey: randomUUID(),
          action: { kind: "resume" },
        })
      ).ok,
    ).toBe(true);
    await h.runner.settled();
    expect(images.calls()).toBe(0);
    expect(listCheckpoints(h.deps.db, h.projectId, base.revision.id)).toMatchObject([
      { state: "held", approvedAt: null },
    ]);
    expect(
      current(h.deps, h.projectId).outputs.some(
        (row) => row.selected && row.output.role === "article_md",
      ),
    ).toBe(true);
  } finally {
    await h.runner.settled();
    h.audioPreviews.close();
    h.close();
  }
});

it("refuses a rerun of active work but permits an independent branch", async () => {
  const entered = deferred<void>();
  const gate = deferred<void>();
  const images = fakeImage();
  const h = await composedFixture({
    image: () => ({
      ...images,
      generate: async (request) => {
        if (request.prompt === "One") {
          entered.resolve();
          await gate.promise;
        }
        return images.generate(request);
      },
    }),
  });
  try {
    const base = current(h.deps, h.projectId);
    await save(h.deps, h.projectId, {
      config: {
        ...base.revision.config,
        sources: { ...base.revision.config.sources, thumbnail: "from_prompt" },
        rendered: { ...base.revision.config.rendered, thumbnailPrompt: "Cover" },
      },
      content: base.revision.content,
    });
    await start(h.deps, h.projectId, ["image:one"]);
    await entered.promise;
    const revisionId = current(h.deps, h.projectId).revision.id;
    const run = (stage: "images" | "thumbnail") =>
      recoverProject(h.deps, h.projectId, {
        baseRevisionId: revisionId,
        idempotencyKey: randomUUID(),
        action: { kind: "rerun", stage },
      });
    expect(await run("images")).toMatchObject({ ok: false, reason: "running" });
    expect(current(h.deps, h.projectId).revision.id).toBe(revisionId);
    expect((await run("thumbnail")).ok).toBe(true);
    gate.resolve();
    await h.runner.settled();
    expect(
      images
        .seen()
        .map((row) => row.prompt)
        .sort(),
    ).toEqual(["Cover", "One"]);
  } finally {
    gate.resolve();
    await h.runner.settled();
    h.audioPreviews.close();
    h.close();
  }
});

it("refuses newly-paid work when a retained file disappears during readiness", async () => {
  const images = fakeImage();
  const h = await composedFixture({ image: () => images });
  const entered = deferred<void>();
  const gate = deferred<void>();
  let missing: string | undefined;
  try {
    await start(h.deps, h.projectId, ["image:one"]);
    await h.runner.settled();
    const view = current(h.deps, h.projectId);
    const output = view.outputs.find((row) => row.selected && row.workKey === "image:one");
    if (!output) throw new Error("Missing retained image");
    const pending = recoverProject(
      {
        ...h.deps,
        providers: async () => {
          const ready = await h.deps.providers();
          entered.resolve();
          await gate.promise;
          return ready;
        },
      },
      h.projectId,
      {
        baseRevisionId: view.revision.id,
        idempotencyKey: randomUUID(),
        action: { kind: "resume" },
      },
    );
    await entered.promise;
    missing = outputPath(h.deps.paths, h.projectId, output.output.path);
    renameSync(missing, missing + ".held-test");
    gate.resolve();
    expect(await pending).toMatchObject({ ok: false, reason: "stale-preview" });
    await h.runner.settled();
    expect(images.calls()).toBe(1);
  } finally {
    gate.resolve();
    if (missing) renameSync(missing + ".held-test", missing);
    await h.runner.settled();
    h.audioPreviews.close();
    h.close();
  }
});

it("replays a completed receipt exactly after reopen without startup generation", async () => {
  const images = fakeImage();
  const h = await composedFixture({ image: () => images });
  try {
    const input = {
      baseRevisionId: current(h.deps, h.projectId).revision.id,
      idempotencyKey: randomUUID(),
      action: { kind: "resume" as const },
    };
    const result = await recoverProject(h.deps, h.projectId, input);
    await h.runner.settled();
    const calls = images.calls();
    const path = join(h.deps.paths.dataDir, "direct-receipt.sqlite");
    h.deps.db.prepare("VACUUM INTO ?").run(path);
    const db = openDb(path);
    const next = h.compose({ ...h.deps, db });
    try {
      recoverWork(db);
      next.runner.tick(h.projectId);
      await next.runner.settled();
      expect(images.calls()).toBe(calls);
      expect(
        await recoverProject(
          {
            ...next.deps,
            providers: async () => {
              throw new Error("Replay must not check readiness");
            },
          },
          h.projectId,
          input,
        ),
      ).toEqual(result);
      await next.runner.settled();
      expect(images.calls()).toBe(calls);
      expect(db.prepare("SELECT count(*) AS n FROM rebuild_admissions").get()?.n).toBe(1);
    } finally {
      await next.runner.settled();
      next.audioPreviews.close();
      db.close();
    }
  } finally {
    await h.runner.settled();
    h.audioPreviews.close();
    h.close();
  }
});

it("refuses a voice removed during asynchronous readiness", async () => {
  const h = await preparationFixture();
  const entered = deferred<void>();
  const gate = deferred<void>();
  try {
    const pending = recoverProject(
      {
        ...h.deps,
        providers: async () => {
          const ready = await h.deps.providers();
          entered.resolve();
          await gate.promise;
          return ready;
        },
      },
      h.projectId,
      {
        baseRevisionId: h.view.revision.id,
        idempotencyKey: randomUUID(),
        action: { kind: "resume" },
      },
    );
    await entered.promise;
    deleteVoice(h.deps.db, "inworld-v");
    gate.resolve();
    expect(await pending).toMatchObject({
      ok: false,
      reason: "readiness",
      fields: expect.arrayContaining([expect.objectContaining({ field: "audio.voice" })]),
    });
    expect(h.deps.db.prepare("SELECT count(*) AS n FROM rebuild_admissions").get()?.n).toBe(0);
  } finally {
    gate.resolve();
    await h.runner.settled();
    h.audioPreviews.close();
    h.close();
  }
});

it("retries one failed section without restarting an unrelated failure", async () => {
  const images = fakeImage();
  const requests: string[] = [];
  let fail = true;
  const h = await composedFixture({
    image: () => ({
      ...images,
      generate: async (request) => {
        requests.push(request.prompt);
        if (fail && request.prompt !== "One")
          throw providerError({ kind: "refusal", message: "Fixture refusal" });
        return images.generate(request);
      },
    }),
  });
  try {
    const base = current(h.deps, h.projectId);
    await save(h.deps, h.projectId, {
      config: {
        ...base.revision.config,
        sources: { ...base.revision.config.sources, thumbnail: "from_prompt" },
        rendered: { ...base.revision.config.rendered, thumbnailPrompt: "Cover" },
      },
      content: base.revision.content,
    });
    const revisionId = current(h.deps, h.projectId).revision.id;
    expect(
      (
        await recoverProject(h.deps, h.projectId, {
          baseRevisionId: revisionId,
          idempotencyKey: randomUUID(),
          action: { kind: "resume" },
        })
      ).ok,
    ).toBe(true);
    await h.runner.settled();
    const retained = current(h.deps, h.projectId).outputs.find(
      (row) => row.selected && row.workKey === "image:one",
    );
    if (!retained) throw new Error("Missing compatible image");
    fail = false;
    expect(
      (
        await recoverProject(h.deps, h.projectId, {
          baseRevisionId: revisionId,
          idempotencyKey: randomUUID(),
          action: { kind: "retry", stage: "images" },
        })
      ).ok,
    ).toBe(true);
    await h.runner.settled();
    expect(requests.filter((prompt) => prompt === "One")).toHaveLength(1);
    expect(requests.filter((prompt) => prompt === "Two")).toHaveLength(2);
    expect(requests.filter((prompt) => prompt === "Cover")).toHaveLength(1);
    expect(
      current(h.deps, h.projectId).outputs.find(
        (row) => row.selected && row.workKey === "image:one",
      )?.assetId,
    ).toBe(retained.assetId);
  } finally {
    await h.runner.settled();
    h.audioPreviews.close();
    h.close();
  }
});
