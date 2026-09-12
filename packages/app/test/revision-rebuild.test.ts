import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { fakeImage } from "../src/adapters/fake/image.js";
import { openDb } from "../src/kernel/db/index.js";
import type { ImageRequest } from "../src/kernel/ports/image.js";
import { recoverWork } from "../src/slices/rebuild/repo.js";
import { startRebuild } from "../src/slices/rebuild/service.js";
import { getRevisionView } from "../src/slices/revisions/view.js";
import { outputPath } from "../src/slices/storage/layout.js";
import { composedFixture, current, deferred, save, start } from "./revision-rebuild.fake.js";

it("keeps a delayed changed image in its origin and retains the previous image bytes", async () => {
  const gate = deferred<void>();
  const entered = deferred<void>();
  const images = fakeImage();
  let delayed = false;
  const h = await composedFixture({
    image: () => ({
      ...images,
      generate: async (request: ImageRequest) => {
        if (delayed) {
          entered.resolve();
          await gate.promise;
        }
        return images.generate(request);
      },
    }),
  });
  try {
    await start(h.deps, h.projectId, ["image:one"]);
    await h.runner.settled();
    const initial = current(h.deps, h.projectId);
    const retained = initial.outputs.find((row) => row.workKey === "image:one" && row.selected);
    if (retained === undefined) throw new Error("Missing initial image");
    const bytes = readFileSync(outputPath(h.deps.paths, h.projectId, retained.output.path));
    const r1 = await save(h.deps, h.projectId, {
      config: initial.revision.config,
      content: {
        ...initial.revision.content,
        imageDefinitions: {
          ...initial.revision.content.imageDefinitions,
          one: { source: "generate", prompt: "Night", assetId: null },
        },
      },
    });
    delayed = true;
    await start(h.deps, h.projectId, ["image:one"]);
    await entered.promise;
    const r2 = await save(h.deps, h.projectId, {
      config: r1.revision.config,
      content: {
        ...r1.revision.content,
        imageDefinitions: {
          ...r1.revision.content.imageDefinitions,
          one: { source: "generate", prompt: "Dawn", assetId: null },
        },
      },
    });
    gate.resolve();
    await h.runner.settled();
    const origin = getRevisionView(h.deps, h.projectId, r1.revision.id);
    const latest = current(h.deps, h.projectId);
    const late = origin?.outputs.find(
      (row) => row.workKey === "image:one" && row.output.id !== retained.output.id,
    );
    expect(late?.output.id).not.toBe(retained.output.id);
    expect(late?.available).toBe(true);
    expect(latest.revision.id).toBe(r2.revision.id);
    expect(latest.outputs.some((row) => row.output.id === late?.output.id)).toBe(false);
    expect(latest.outputs.find((row) => row.output.id === retained.output.id)).toMatchObject({
      selected: true,
      state: "outdated",
    });
    expect(readFileSync(outputPath(h.deps.paths, h.projectId, retained.output.path))).toEqual(
      bytes,
    );
    expect(images.calls()).toBe(2);
  } finally {
    gate.resolve();
    await h.runner.settled();
    h.audioPreviews.close();
    h.close();
  }
});

it("attaches an unchanged delayed image to both revisions without a second request", async () => {
  const gate = deferred<void>();
  const entered = deferred<void>();
  const images = fakeImage();
  const h = await composedFixture({
    image: () => ({
      ...images,
      generate: async (request: ImageRequest) => {
        entered.resolve();
        await gate.promise;
        return images.generate(request);
      },
    }),
  });
  try {
    const originId = current(h.deps, h.projectId).revision.id;
    await start(h.deps, h.projectId, ["image:one"]);
    await entered.promise;
    const base = current(h.deps, h.projectId);
    await save(h.deps, h.projectId, {
      config: { ...base.revision.config, provided: { article: "Changed narration text." } },
      content: base.revision.content,
    });
    gate.resolve();
    await h.runner.settled();
    const origin = getRevisionView(h.deps, h.projectId, originId);
    const latest = current(h.deps, h.projectId);
    const image = origin?.outputs.find((row) => row.workKey === "image:one" && row.selected);
    expect(image?.available).toBe(true);
    expect(latest.outputs.find((row) => row.workKey === "image:one" && row.selected)?.assetId).toBe(
      image?.assetId,
    );
    expect(latest.outputs.find((row) => row.workKey === "image:one" && row.selected)?.state).toBe(
      "ready",
    );
    expect(images.calls()).toBe(1);
  } finally {
    gate.resolve();
    await h.runner.settled();
    h.audioPreviews.close();
    h.close();
  }
});

it("a regeneration token rejects late reuse and duplicate Start submits its replacement once", async () => {
  const gate = deferred<void>();
  const entered = deferred<void>();
  const images = fakeImage();
  let calls = 0;
  const h = await composedFixture({
    image: () => ({
      ...images,
      generate: async (request: ImageRequest) => {
        calls += 1;
        if (calls === 1) {
          entered.resolve();
          await gate.promise;
        }
        return images.generate(request);
      },
    }),
  });
  try {
    const original = current(h.deps, h.projectId);
    await start(h.deps, h.projectId, ["image:one"]);
    await entered.promise;
    await save(h.deps, h.projectId, {
      config: original.revision.config,
      content: original.revision.content,
      regenerate: ["image:one"],
    });
    gate.resolve();
    await h.runner.settled();
    expect(
      current(h.deps, h.projectId).outputs.some(
        (row) => row.workKey === "image:one" && row.selected,
      ),
    ).toBe(false);
    const admitted = await start(h.deps, h.projectId, ["image:one"]);
    expect((await startRebuild(h.deps, admitted.input)).ok).toBe(true);
    await h.runner.settled();
    expect(calls).toBe(2);
    const origin = getRevisionView(h.deps, h.projectId, original.revision.id)?.outputs.find(
      (row) => row.workKey === "image:one",
    );
    const latest = current(h.deps, h.projectId).outputs.find(
      (row) => row.workKey === "image:one" && row.selected,
    );
    expect(origin?.available).toBe(true);
    expect(latest?.available).toBe(true);
    expect(latest?.assetId).not.toBe(origin?.assetId);
  } finally {
    gate.resolve();
    await h.runner.settled();
    h.audioPreviews.close();
    h.close();
  }
});

it("reopens saved work held, retains history, and waits for explicit missing-work admission", async () => {
  const images = fakeImage();
  const h = await composedFixture({ image: () => images });
  let closed = false;
  let reopened: ReturnType<typeof openDb> | undefined;
  try {
    await start(h.deps, h.projectId, ["image:one"]);
    await h.runner.settled();
    const base = current(h.deps, h.projectId);
    const retained = base.outputs.find((row) => row.workKey === "image:one" && row.selected);
    if (retained === undefined) throw new Error("Missing retained image");
    const saved = await save(h.deps, h.projectId, {
      config: base.revision.config,
      content: {
        ...base.revision.content,
        imageDefinitions: {
          ...base.revision.content.imageDefinitions,
          one: { source: "generate", prompt: "After restart", assetId: null },
        },
      },
    });
    const snapshot = join(h.deps.paths.dataDir, "restart.sqlite");
    h.deps.db.prepare("VACUUM INTO ?").run(snapshot);
    h.deps.db.close();
    closed = true;
    reopened = openDb(snapshot);
    recoverWork(reopened);
    const next = h.compose({ ...h.deps, db: reopened });
    try {
      next.runner.tick(h.projectId);
      await next.runner.settled();
      expect(images.calls()).toBe(1);
      expect(current(next.deps, h.projectId).revision.id).toBe(saved.revision.id);
      expect(current(next.deps, h.projectId).revision.content.imageDefinitions.one?.prompt).toBe(
        "After restart",
      );
      expect(
        current(next.deps, h.projectId).outputs.find((row) => row.output.id === retained.output.id),
      ).toMatchObject({ available: true, selected: true, state: "outdated" });
      await start(next.deps, h.projectId, ["image:one"]);
      await next.runner.settled();
      expect(images.seen().map((one) => one.prompt)).toEqual(["One", "After restart"]);
    } finally {
      await next.runner.settled();
      next.audioPreviews.close();
    }
  } finally {
    h.audioPreviews.close();
    reopened?.close();
    if (closed) rmSync(h.deps.paths.dataDir, { recursive: true, force: true });
    else h.close();
  }
});
