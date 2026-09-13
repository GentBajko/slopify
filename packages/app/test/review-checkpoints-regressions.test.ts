import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { fakeImage } from "../src/adapters/fake/image.js";
import { fakeTts } from "../src/adapters/fake/tts.js";
import { recoverCheckpointWork } from "../src/slices/checkpoints/recovery.js";
import { executionStages } from "../src/slices/rebuild/runtime-store.js";
import { defaultSubtitles } from "../src/slices/subtitles/model.js";
import { checkpointFixture } from "./e2e/review-checkpoints.http.js";
import { current, save, tone } from "./revision-rebuild.fake.js";

async function audioFixture(video = false) {
  const images = fakeImage();
  const audio = fakeTts({ bytesFor: () => [tone()] });
  const h = await checkpointFixture({ image: () => images, tts: () => audio });
  const base = current(h.deps, h.projectId);
  await save(h.deps, h.projectId, {
    config: {
      ...base.revision.config,
      sources: {
        ...base.revision.config.sources,
        audio: "generate",
        ...(video ? { video: "generate" as const } : {}),
      },
      audio: { provider: "openai-tts", model: "tts", voice: "first" },
      ...(video ? { subtitles: { ...defaultSubtitles, mode: "files" as const } } : {}),
    },
    content: base.revision.content,
  });
  return { ...h, images, audio };
}

it("keeps independent subtitle work eligible while Images holds other Video work", async () => {
  const h = await audioFixture(true);
  try {
    await h.admit(["image:one", "image:two", "subtitles:files"]);
    expect((await h.change(["images"])).status).toBe(200);
    const id = h.deps.db
      .prepare(
        "SELECT work_id FROM revision_work_pieces WHERE work_key='subtitles:files' ORDER BY rowid DESC LIMIT 1",
      )
      .get()?.work_id;
    const stage = executionStages(h.deps, h.projectId).find((row) => row.work.workId === id);
    if (!stage) throw new Error("Missing subtitle invocation");
    expect(h.runner.checkpoints.beforeClaim(stage.work)).toEqual({ kind: "eligible" });
    expect(h.images.calls()).toBe(0);
  } finally {
    await h.dispose();
  }
});

it("retains current-head admitted work when its origin gate was invalidated", async () => {
  const h = await checkpointFixture();
  try {
    await h.admit();
    await h.change(["images"]);
    const base = current(h.deps, h.projectId);
    await save(h.deps, h.projectId, {
      config: base.revision.config,
      content: {
        ...base.revision.content,
        imageDefinitions: {
          ...base.revision.content.imageDefinitions,
          one: { source: "generate", prompt: "Changed", assetId: null },
        },
      },
    });
    const work = h.deps.db
      .prepare(
        "SELECT w.id,w.dispatch_state FROM revision_work w JOIN revision_work_reservations r ON r.work_id=w.id JOIN project_heads h ON h.revision_id=r.revision_id WHERE r.work_key='image:two'",
      )
      .get();
    expect(work?.dispatch_state).toBe("allowed");
    recoverCheckpointWork(h.deps.db);
    expect(
      h.deps.db.prepare("SELECT dispatch_state FROM revision_work WHERE id=?").get(String(work?.id))
        ?.dispatch_state,
    ).toBe("allowed");
  } finally {
    await h.dispose();
  }
});

it("replays an exact approval after completion and refuses a changed identity", async () => {
  const h = await checkpointFixture();
  try {
    await h.admit();
    await h.change(["images"]);
    const gate = (await h.status()).checkpoints[0];
    if (!gate) throw new Error("No gate");
    const key = randomUUID();
    expect((await h.approve(gate, key)).status).toBe(200);
    await h.runner.settled();
    const replay = await h.approve(gate, key);
    expect(replay.status).toBe(200);
    expect(await replay.json()).toMatchObject({ replayed: true });
    expect((await h.approve({ ...gate, fingerprint: "0".repeat(64) }, key)).status).toBe(409);
  } finally {
    await h.dispose();
  }
});

it("preserves an Audio approval after output materialization and a title-only save", async () => {
  const h = await audioFixture();
  try {
    await h.admit(["export:wav"]);
    await h.change(["audio"]);
    const gate = (await h.status()).checkpoints[0];
    if (!gate) throw new Error("No gate");
    expect((await h.approve(gate)).status).toBe(200);
    await h.runner.settled();
    const base = current(h.deps, h.projectId);
    await save(h.deps, h.projectId, {
      config: { ...base.revision.config, title: "Only a title" },
      content: base.revision.content,
    });
    expect((await h.status()).checkpoints[0]?.state).toBe("released");
  } finally {
    await h.dispose();
  }
});

it("allows review of pending dependent work after its selected Audio stage completed", async () => {
  const h = await audioFixture();
  try {
    await h.admit(["export:wav"]);
    await h.change(["audio"]);
    const gate = (await h.status()).checkpoints[0];
    if (!gate) throw new Error("No gate");
    expect((await h.approve(gate)).status).toBe(200);
    await h.runner.settled();
    const base = current(h.deps, h.projectId);
    await save(h.deps, h.projectId, {
      config: { ...base.revision.config, subtitles: { ...defaultSubtitles, mode: "files" } },
      content: base.revision.content,
    });
    const next = (await h.status()).checkpoints[0];
    if (!next) throw new Error("No gate");
    expect(next.state).toBe("held");
    expect((await h.approve(next)).status).toBe(200);
  } finally {
    await h.dispose();
  }
});

it.each(["/api/projects", "/api/projects/batch"])(
  "refuses checkpoint configuration on unsupported legacy admission %s",
  async (path) => {
    const h = await checkpointFixture();
    try {
      const draft = { ...current(h.deps, h.projectId).revision.config, checkpoints: ["images"] };
      const body = path === "/api/projects" ? draft : { draft, requestId: randomUUID() };
      const response = await h.app.request(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      expect(response.status).toBe(409);
      expect(response.headers.get("content-type")).toContain("application/problem+json");
      expect(h.deps.db.prepare("SELECT count(*) AS n FROM projects").get()?.n).toBe(1);
    } finally {
      await h.dispose();
    }
  },
);
