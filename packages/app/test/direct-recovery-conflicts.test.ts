import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { expect, it } from "vitest";
import { fakeImage } from "../src/adapters/fake/image.js";
import { fakeTts } from "../src/adapters/fake/tts.js";
import { openDb } from "../src/kernel/db/index.js";
import { providerError } from "../src/kernel/ports/model.js";
import { pauseProject } from "../src/slices/control/index.js";
import { recoverProject } from "../src/slices/rebuild/recovery.js";
import type { RecoveryRequest } from "../src/slices/rebuild/recovery-model.js";
import { recoverWork } from "../src/slices/rebuild/repo.js";
import type { RebuildDeps } from "../src/slices/rebuild/service.js";
import { composedFixture, current, deferred, save, start, tone } from "./revision-rebuild.fake.js";

type Fixture = Awaited<ReturnType<typeof composedFixture>>;

async function imagesFixture(
  generate: (prompt: string, signal: AbortSignal) => Promise<void>,
): Promise<{ h: Fixture; prompts: string[] }> {
  const images = fakeImage();
  const prompts: string[] = [];
  const h = await composedFixture({
    image: () => ({
      ...images,
      generate: async (request) => {
        prompts.push(request.prompt);
        await generate(request.prompt, request.signal);
        return images.generate(request);
      },
    }),
  });
  const base = current(h.deps, h.projectId);
  await save(h.deps, h.projectId, {
    config: {
      ...base.revision.config,
      sources: { ...base.revision.config.sources, thumbnail: "from_prompt" },
      rendered: { ...base.revision.config.rendered, thumbnailPrompt: "Cover" },
    },
    content: base.revision.content,
  });
  return { h, prompts };
}

function recover(deps: RebuildDeps, projectId: string, action: RecoveryRequest["action"]) {
  return recoverProject(deps, projectId, {
    baseRevisionId: current(deps, projectId).revision.id,
    idempotencyKey: randomUUID(),
    action,
  });
}

function unfinished(h: Fixture): readonly unknown[] {
  return h.deps.db
    .prepare(
      "SELECT w.kind,w.state FROM revision_work w JOIN revision_work_reservations r ON r.work_id=w.id " +
        "WHERE r.revision_id=? AND w.state!='done' AND NOT (w.state='pending' AND w.dispatch_state='held')",
    )
    .all(current(h.deps, h.projectId).revision.id);
}

async function close(h: Fixture): Promise<void> {
  await h.runner.settled();
  h.audioPreviews.close();
  h.close();
}

it("reruns a failed section whose dependents were left waiting on it", async () => {
  let fail = true;
  const { h, prompts } = await imagesFixture(async (prompt) => {
    if (fail && prompt === "Two")
      throw providerError({ kind: "refusal", message: "Fixture refusal" });
  });
  try {
    expect(await recover(h.deps, h.projectId, { kind: "resume" })).toMatchObject({ ok: true });
    await h.runner.settled();
    expect(unfinished(h)).toContainEqual({ kind: "images", state: "failed" });
    fail = false;
    expect(await recover(h.deps, h.projectId, { kind: "rerun", stage: "images" })).toMatchObject({
      ok: true,
    });
    await h.runner.settled();
    expect(prompts.filter((prompt) => prompt === "Two")).toHaveLength(2);
    expect(unfinished(h)).toEqual([]);
  } finally {
    await close(h);
  }
});

it("reruns a section paused mid-call, and again after it finishes", async () => {
  const entered = deferred<void>();
  const { h, prompts } = await imagesFixture(async (prompt, signal) => {
    if (prompt !== "One" || prompts.length > 1) return;
    entered.resolve();
    await new Promise((_, reject) => signal.addEventListener("abort", () => reject(signal.reason)));
  });
  try {
    expect(await recover(h.deps, h.projectId, { kind: "resume" })).toMatchObject({ ok: true });
    await entered.promise;
    expect(
      await pauseProject(h.deps, h.projectId, {
        baseRevisionId: current(h.deps, h.projectId).revision.id,
        idempotencyKey: randomUUID(),
      }),
    ).toEqual({ ok: true });
    expect(await recover(h.deps, h.projectId, { kind: "rerun", stage: "images" })).toMatchObject({
      ok: true,
    });
    expect(await recover(h.deps, h.projectId, { kind: "resume" })).toMatchObject({ ok: true });
    await h.runner.settled();
    expect(unfinished(h)).toEqual([]);
    expect(await recover(h.deps, h.projectId, { kind: "rerun", stage: "images" })).toMatchObject({
      ok: true,
    });
    await h.runner.settled();
    expect(unfinished(h)).toEqual([]);
  } finally {
    await close(h);
  }
});

it("reruns a section whose failed work belongs to a superseded revision", async () => {
  let fail = true;
  const { h } = await imagesFixture(async (prompt) => {
    if (fail && prompt === "One")
      throw providerError({ kind: "refusal", message: "Fixture refusal" });
  });
  try {
    expect(await recover(h.deps, h.projectId, { kind: "resume" })).toMatchObject({ ok: true });
    await h.runner.settled();
    fail = false;
    const base = current(h.deps, h.projectId);
    await save(h.deps, h.projectId, {
      config: {
        ...base.revision.config,
        rendered: { ...base.revision.config.rendered, thumbnailPrompt: "New cover" },
      },
      content: base.revision.content,
    });
    expect(await recover(h.deps, h.projectId, { kind: "resume" })).toMatchObject({ ok: true });
    await h.runner.settled();
    expect(await recover(h.deps, h.projectId, { kind: "rerun", stage: "images" })).toMatchObject({
      ok: true,
    });
    await h.runner.settled();
    expect(unfinished(h)).toEqual([]);
  } finally {
    await close(h);
  }
});

it("refuses to rerun over an accepted provider job until Retry retrieves it", async () => {
  const gate = deferred<void>();
  const entered = deferred<void>();
  const audio = fakeTts({ bytesFor: () => [tone()] });
  const retrievals: string[] = [];
  const h = await composedFixture({
    tts: () => ({
      ...audio,
      synthesize: async (request) => {
        const token = request.continuation?.read();
        if (token !== undefined) retrievals.push(token);
        else if (retrievals.length === 0) {
          request.continuation?.write("accepted-job");
          entered.resolve();
          await gate.promise;
        }
        return audio.synthesize(request);
      },
    }),
  });
  let next: ReturnType<Fixture["compose"]> | undefined;
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
    await start(h.deps, h.projectId, ["export:wav"]);
    await entered.promise;
    const snapshot = join(h.deps.paths.dataDir, "accepted-job.sqlite");
    h.deps.db.prepare("VACUUM INTO ?").run(snapshot);
    gate.resolve();
    await h.runner.settled();
    const reopened = openDb(snapshot);
    recoverWork(reopened);
    next = h.compose({ ...h.deps, db: reopened });
    expect(await recover(next.deps, h.projectId, { kind: "rerun", stage: "audio" })).toMatchObject({
      ok: false,
      reason: "accepted-job",
      fields: [
        {
          field: "stage",
          message:
            "An accepted provider job for this section is waiting to be collected. Use Retry stage or Resume, then rerun.",
        },
      ],
    });
    expect(await recover(next.deps, h.projectId, { kind: "retry", stage: "audio" })).toMatchObject({
      ok: true,
    });
    await next.runner.settled();
    expect(retrievals).toEqual(["accepted-job"]);
    expect(await recover(next.deps, h.projectId, { kind: "rerun", stage: "audio" })).toMatchObject({
      ok: true,
    });
    await next.runner.settled();
  } finally {
    gate.resolve();
    await next?.runner.settled();
    next?.audioPreviews.close();
    next?.deps.db.close();
    await close(h);
  }
});
