import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { fakeImage } from "../src/adapters/fake/image.js";
import { providerError } from "../src/kernel/ports/model.js";
import { derive } from "../src/kernel/runner/graph.js";
import { stagesOf } from "../src/slices/admission/repo.js";
import { recoverProject } from "../src/slices/rebuild/recovery.js";
import type { RecoveryRequest } from "../src/slices/rebuild/recovery-model.js";
import { resumable } from "../src/slices/rebuild/recovery-repo.js";
import type { RebuildDeps } from "../src/slices/rebuild/service.js";
import { composedFixture, current, save } from "./revision-rebuild.fake.js";

type Fixture = Awaited<ReturnType<typeof composedFixture>>;

async function fixture(fail: () => boolean): Promise<Fixture> {
  const images = fakeImage();
  const h = await composedFixture({
    image: () => ({
      ...images,
      generate: async (request) => {
        if (fail() && request.prompt === "Two")
          throw providerError({ kind: "refusal", message: "Fixture refusal" });
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
  return h;
}

function recover(deps: RebuildDeps, projectId: string, action: RecoveryRequest["action"]) {
  return recoverProject(deps, projectId, {
    baseRevisionId: current(deps, projectId).revision.id,
    idempotencyKey: randomUUID(),
    action,
  });
}

function status(h: Fixture): string {
  return derive(stagesOf(h.deps.db, h.projectId));
}

async function close(h: Fixture): Promise<void> {
  await h.runner.settled();
  h.audioPreviews.close();
  h.close();
}

it("offers Resume for a rerun revision saved while readiness failed", async () => {
  const h = await fixture(() => false);
  try {
    expect(await recover(h.deps, h.projectId, { kind: "resume" })).toMatchObject({ ok: true });
    await h.runner.settled();
    expect(status(h)).toBe("done");
    expect(resumable(h.deps.db, h.projectId)).toBe(false);
    const refused = await recover({ ...h.deps, providers: async () => [] }, h.projectId, {
      kind: "rerun",
      stage: "images",
    });
    expect(refused).toMatchObject({ ok: false, reason: "readiness" });
    expect(refused).toHaveProperty("intentRevisionId", current(h.deps, h.projectId).revision.id);
    expect(status(h)).toBe("pending");
    expect(resumable(h.deps.db, h.projectId)).toBe(true);
    expect(await recover(h.deps, h.projectId, { kind: "resume" })).toMatchObject({ ok: true });
    expect(resumable(h.deps.db, h.projectId)).toBe(false);
    await h.runner.settled();
    expect(status(h)).toBe("done");
    expect(resumable(h.deps.db, h.projectId)).toBe(false);
  } finally {
    await close(h);
  }
});

it("offers Resume after an edit saves over failed work", async () => {
  let fail = true;
  const h = await fixture(() => fail);
  try {
    expect(await recover(h.deps, h.projectId, { kind: "resume" })).toMatchObject({ ok: true });
    await h.runner.settled();
    expect(status(h)).toBe("failed");
    fail = false;
    const base = current(h.deps, h.projectId);
    await save(h.deps, h.projectId, {
      config: {
        ...base.revision.config,
        rendered: { ...base.revision.config.rendered, thumbnailPrompt: "New cover" },
      },
      content: base.revision.content,
    });
    expect(status(h)).toBe("pending");
    expect(resumable(h.deps.db, h.projectId)).toBe(true);
    expect(await recover(h.deps, h.projectId, { kind: "resume" })).toMatchObject({ ok: true });
    await h.runner.settled();
    expect(status(h)).toBe("done");
    expect(resumable(h.deps.db, h.projectId)).toBe(false);
  } finally {
    await close(h);
  }
});
