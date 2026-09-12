import { randomUUID } from "node:crypto";
import { existsSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { draftFixture, must } from "../play-drafts/draft.fake.js";
import { createDraft, readDraft } from "../play-drafts/service.js";
import { insertStagedFile, stagedFileById } from "../storage/repo.js";
import type { RevisionDeps, RevisionView } from "./model.js";
import { imageFixture, mutationFixture } from "./mutation.fake.js";
import { restoreRevision, saveRevision } from "./mutations.js";
import { getRevisionView } from "./view.js";

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const close of cleanups.splice(0)) close();
});
async function fixture() {
  const h = await mutationFixture();
  cleanups.push(h.close);
  return h;
}
function stage(deps: RevisionDeps, id = "upload", kind: "audio" | "images" = "audio"): string {
  const path = join(deps.paths.staging, id);
  writeFileSync(path, "audio");
  insertStagedFile(deps.db, {
    id,
    stageKind: kind,
    path: id,
    originalFilename: `${id}.wav`,
    bytes: 5,
    state: "staged",
    createdAt: deps.clock.now().toISOString(),
  });
  return path;
}
function audioEdit(view: RevisionView, id = "upload") {
  return {
    config: {
      ...view.revision.config,
      sources: { ...view.revision.config.sources, audio: "provide" as const },
    },
    content: view.revision.content,
    uploads: [
      { stagedFileId: id, destination: { kind: "provided" as const, stage: "audio" as const } },
    ],
  };
}
it("copies and measures supplied narration once, replays after staging consumption", async () => {
  const h = await fixture();
  const path = stage(h.deps);
  let probes = 0;
  const deps = {
    ...h.deps,
    measureAudio: async () => {
      probes++;
      return 4200;
    },
  };
  const request = {
    projectId: h.projectId,
    baseRevisionId: h.base.revision.id,
    idempotencyKey: "audio",
    edit: audioEdit(h.base),
  };
  const result = await saveRevision(deps, request);
  expect(result).toMatchObject({ ok: true });
  if (!result.ok) throw new Error(JSON.stringify(result));
  expect(
    result.view.outputs.find((row) => row.output.role === "audio_body")?.output.durationMs,
  ).toBe(4200);
  expect(existsSync(path)).toBe(false);
  expect(probes).toBe(1);
  expect(await saveRevision(deps, request)).toMatchObject({ ok: true, duplicate: true });
  expect(probes).toBe(1);
});
it.each([Infinity, -1, NaN])(
  "rejects invalid measured duration %s without consuming staging",
  async (duration) => {
    const h = await fixture();
    const path = stage(h.deps);
    await expect(
      saveRevision(
        { ...h.deps, measureAudio: async () => duration },
        {
          projectId: h.projectId,
          baseRevisionId: h.base.revision.id,
          idempotencyKey: "bad",
          edit: audioEdit(h.base),
        },
      ),
    ).rejects.toThrow("invalid duration");
    expect(existsSync(path)).toBe(true);
    expect(h.deps.db.prepare("SELECT count(*) AS n FROM revision_mutations").get()).toEqual({
      n: 0,
    });
  },
);
it("refuses duplicate/wrong/missing uploads with field errors before copying", async () => {
  const h = await fixture();
  stage(h.deps, "image", "images");
  const edit = audioEdit(h.base, "image");
  expect(
    await saveRevision(h.deps, {
      projectId: h.projectId,
      baseRevisionId: h.base.revision.id,
      idempotencyKey: "bad",
      edit: { ...edit, uploads: [...edit.uploads, ...edit.uploads] },
    }),
  ).toMatchObject({ ok: false, reason: "invalid-edit" });
  expect(h.deps.db.prepare("SELECT count(*) AS n FROM project_assets").get()).toEqual({ n: 0 });
});
it("refuses a head changed while an audio probe awaited and preserves its upload", async () => {
  const h = await fixture();
  const path = stage(h.deps);
  let release: ((duration: number) => void) | undefined;
  const measured = new Promise<number>((resolve) => {
    release = resolve;
  });
  const pending = saveRevision(
    { ...h.deps, measureAudio: () => measured },
    {
      projectId: h.projectId,
      baseRevisionId: h.base.revision.id,
      idempotencyKey: "audio",
      edit: audioEdit(h.base),
    },
  );
  const saved = await saveRevision(h.deps, {
    projectId: h.projectId,
    baseRevisionId: h.base.revision.id,
    idempotencyKey: "title",
    edit: { config: { ...h.config, title: "New head" }, content: h.base.revision.content },
  });
  expect(saved.ok).toBe(true);
  release?.(4000);
  expect(await pending).toMatchObject({ ok: false, reason: "conflict" });
  expect(existsSync(path)).toBe(true);
});
it("restores a new revision sharing a missing asset and keeps later duplicate receipt historical", async () => {
  const h = await imageFixture();
  cleanups.push(h.close);
  const original = h.base;
  const changed = await saveRevision(h.deps, {
    projectId: h.projectId,
    baseRevisionId: original.revision.id,
    idempotencyKey: "change",
    edit: {
      config: { ...original.revision.config, title: "Changed" },
      content: original.revision.content,
    },
  });
  if (!changed.ok) throw new Error(JSON.stringify(changed));
  const article = original.outputs.find((row) => row.output.role === "article_md");
  if (article === undefined) throw new Error("Missing fixture article.");
  rmSync(join(h.deps.paths.projects, h.projectId, article.output.path));
  const request = {
    projectId: h.projectId,
    baseRevisionId: changed.view.revision.id,
    idempotencyKey: "restore",
    targetRevisionId: original.revision.id,
  };
  const restored = await restoreRevision(h.deps, request);
  expect(restored).toMatchObject({
    ok: true,
    view: {
      revision: { parentId: changed.view.revision.id, restoredFromId: original.revision.id },
    },
  });
  if (!restored.ok) throw new Error(JSON.stringify(restored));
  expect(restored.view.outputs.find((row) => row.assetId === article.assetId)).toMatchObject({
    available: false,
  });
  expect(getRevisionView(h.deps, h.projectId, original.revision.id)?.revision.config.title).toBe(
    original.revision.config.title,
  );
  expect(await restoreRevision(h.deps, request)).toMatchObject({ ok: true, duplicate: true });
});

it("preserves a staged upload owned by a Play draft through revision Save", async () => {
  const h = await fixture();
  const draft = draftFixture();
  try {
    const path = stage(h.deps);
    const deps = { ...h.deps, uuid: randomUUID };
    const id = randomUUID();
    const attachmentId = randomUUID();
    const document = {
      ...draft.document,
      form: {
        ...draft.document.form,
        provided: { ...draft.document.form.provided, audio: { attachmentId, name: "upload.wav" } },
      },
    };
    let release = (_duration: number) => {};
    const measured = new Promise<number>((resolve) => {
      release = resolve;
    });
    const pending = saveRevision(
      { ...h.deps, measureAudio: () => measured },
      {
        projectId: h.projectId,
        baseRevisionId: h.base.revision.id,
        idempotencyKey: "owned-audio",
        edit: audioEdit(h.base),
      },
    );
    must(createDraft(deps, { id, document }));
    deps.db
      .prepare(
        "UPDATE play_draft_attachments SET staged_file_id='upload',status='ready' WHERE id=?",
      )
      .run(attachmentId);
    release(4200);
    expect(await pending).toMatchObject({ ok: true });
    expect(existsSync(path)).toBe(true);
    expect(stagedFileById(deps.db, "upload")).toBeDefined();
    expect(must(readDraft(deps, id)).attachments[0]?.state).toBe("ready");
  } finally {
    draft.close();
  }
});
