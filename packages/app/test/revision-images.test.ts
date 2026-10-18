import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { expect, it, vi } from "vitest";
import { fakeImage } from "../src/adapters/fake/image.js";
import type { ImagePort, ImageRequest } from "../src/kernel/ports/image.js";
import { stagesOf } from "../src/slices/admission/repo.js";
import { cancelProject } from "../src/slices/cancel/index.js";
import { settleReleasedCheckpoints } from "../src/slices/checkpoints/recovery.js";
import { recoverProject } from "../src/slices/rebuild/recovery.js";
import { outputPath } from "../src/slices/storage/layout.js";
import { allTelemetryEvents, insertMachine } from "../src/slices/telemetry/repo.js";
import { composedFixture, current, save } from "./revision-rebuild.fake.js";

// The generated images over the real runner and the real attempt wrapper: what is stored, a
// cancel in the middle of a call, and a file that went missing. The image model is a double;
// the fixture's two images are drawn from the prompts "One" and "Two".

type Composed = Awaited<ReturnType<typeof composedFixture>>;

function selectedImage(h: Composed, key: string) {
  return current(h.deps, h.projectId).outputs.find(
    (row) => row.selected && row.workKey === key && row.state === "ready",
  );
}

async function resume(
  h: Composed,
  action: { kind: "resume" } | { kind: "retry"; stage: "images" },
) {
  const result = await recoverProject(h.deps, h.projectId, {
    baseRevisionId: current(h.deps, h.projectId).revision.id,
    idempotencyKey: randomUUID(),
    action,
  });
  expect(result.ok, JSON.stringify(result)).toBe(true);
  await h.runner.settled();
}

const stateOf = (h: Composed, kind: string) =>
  stagesOf(h.deps.db, h.projectId).find((stage) => stage.kind === kind)?.state;

function closeAll(h: Composed) {
  return async () => {
    await h.runner.settled();
    h.audioPreviews.close();
    h.close();
  };
}

it("stores each image under the extension its bytes say, in slideshow order and shape", async () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
  const images = fakeImage({ bytes: jpeg, mime: "image/jpeg" });
  const h = await composedFixture({ image: () => images });
  const close = closeAll(h);
  try {
    insertMachine(h.deps.db, {
      machineId: "5b0c1f9e-0d4e-4d7a-9a55-3b1f2f1e7c11",
      noticeSeenAt: new Date().toISOString(),
      appVersion: "test",
    });
    const base = current(h.deps, h.projectId);
    await save(h.deps, h.projectId, {
      config: { ...base.revision.config, format: "9:16" },
      content: base.revision.content,
    });
    await resume(h, { kind: "resume" });
    expect(images.seen().map((one) => [one.prompt, one.aspect])).toEqual([
      ["One", "9:16"],
      ["Two", "9:16"],
    ]);
    for (const [index, key, prompt] of [
      [1, "image:one", "One"],
      [2, "image:two", "Two"],
    ] as const) {
      const row = selectedImage(h, key);
      if (row === undefined) throw new Error(`${key} was not stored.`);
      expect(row.output.path).toMatch(/\.jpg$/);
      expect(readFileSync(outputPath(h.deps.paths, h.projectId, row.output.path))).toEqual(
        Buffer.from(jpeg),
      );
      expect(row.output.meta).toMatchObject({ index, prompt, provider: "fal", model: "image" });
    }
    // The page hears of each image as it lands.
    expect(
      h.events.filter(
        (event) => event.type === "project.updated" && event.projectId === h.projectId,
      ).length,
    ).toBeGreaterThanOrEqual(2);
    expect(
      allTelemetryEvents(h.deps.db)
        .map((event) => event.payload)
        .filter((payload) => payload.stage === "images"),
    ).toEqual([
      { appVersion: "test", stage: "images", provider: "fal", model: "image", images: 1 },
      { appVersion: "test", stage: "images", provider: "fal", model: "image", images: 1 },
    ]);
  } finally {
    await close();
  }
});

it("draws an image again when its file went missing, and nothing else", async () => {
  const images = fakeImage();
  const h = await composedFixture({ image: () => images });
  const close = closeAll(h);
  try {
    await resume(h, { kind: "resume" });
    expect(images.calls()).toBe(2);
    const gone = selectedImage(h, "image:one");
    const kept = selectedImage(h, "image:two");
    if (gone === undefined || kept === undefined) throw new Error("The images were not stored.");
    rmSync(outputPath(h.deps.paths, h.projectId, gone.output.path));
    await resume(h, { kind: "resume" });
    expect(images.seen().map((one) => one.prompt)).toEqual(["One", "Two", "One"]);
    const again = selectedImage(h, "image:one");
    expect(again && existsSync(outputPath(h.deps.paths, h.projectId, again.output.path))).toBe(
      true,
    );
    expect(selectedImage(h, "image:two")?.assetId).toBe(kept.assetId);
    // With every image stored, a resume asks for nothing.
    await resume(h, { kind: "resume" });
    expect(images.calls()).toBe(3);
  } finally {
    await close();
  }
});

it("stops an image call in flight on cancel, keeps what landed, and makes only the rest on retry", async () => {
  const images = fakeImage();
  let hang = true;
  const asked: string[] = [];
  const port: ImagePort = {
    ...images,
    generate: (request: ImageRequest) => {
      asked.push(request.prompt);
      if (!hang || request.prompt === "One") return images.generate(request);
      return new Promise((_resolve, reject) => {
        request.signal.addEventListener("abort", () => reject(request.signal.reason), {
          once: true,
        });
      });
    },
  };
  const h = await composedFixture({ image: () => port });
  const close = closeAll(h);
  try {
    const started = recoverProject(h.deps, h.projectId, {
      baseRevisionId: current(h.deps, h.projectId).revision.id,
      idempotencyKey: randomUUID(),
      action: { kind: "resume" },
    });
    expect((await started).ok).toBe(true);
    await vi.waitFor(() => expect(asked).toContain("Two"), { timeout: 4_000 });
    await vi.waitFor(() => expect(selectedImage(h, "image:one")).toBeDefined(), {
      timeout: 4_000,
    });
    const landed = selectedImage(h, "image:one");
    expect(
      await cancelProject(
        {
          ...h.deps,
          abort: (id) => h.runner.abortProject(id),
          hasInflight: h.runner.hasInflight,
          settleCheckpoints: (projectId) => settleReleasedCheckpoints(h.deps, projectId),
          emit: () => undefined,
        },
        h.projectId,
        { baseRevisionId: current(h.deps, h.projectId).revision.id, idempotencyKey: randomUUID() },
      ),
    ).toMatchObject({ ok: true, state: "canceled" });
    await h.runner.settled();
    expect(stateOf(h, "images")).toBe("canceled");
    expect(selectedImage(h, "image:two")).toBeUndefined();
    expect(selectedImage(h, "image:one")?.assetId).toBe(landed?.assetId);
    const stopped = h.deps.db
      .prepare(
        "SELECT a.outcome, a.error_text FROM attempts a JOIN revision_work_pieces p ON p.id = a.work_piece_id WHERE p.work_key = 'image:two'",
      )
      .all();
    expect(stopped).toEqual([{ outcome: "canceled", error_text: null }]);

    hang = false;
    await resume(h, { kind: "retry", stage: "images" });
    expect(asked).toEqual(["One", "Two", "Two"]);
    expect(selectedImage(h, "image:one")?.assetId).toBe(landed?.assetId);
    expect(selectedImage(h, "image:two")).toBeDefined();
    expect(stateOf(h, "images")).toBe("done");
  } finally {
    await close();
  }
});
