import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { writeAsset } from "../storage/assets.js";
import { outputPath } from "../storage/layout.js";
import { insertStagedFile } from "../storage/repo.js";
import type { RevisionEdit } from "./model.js";
import { mutationFixture } from "./mutation.fake.js";
import { prepareEditAssets } from "./mutation-prepare.js";
import { saveRevision } from "./mutations.js";
import { insertAsset, listRevisionHistory } from "./repo.js";

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const close of cleanups.splice(0)) close();
});
async function fixture() {
  const h = await mutationFixture();
  cleanups.push(h.close);
  const retained = writeAsset(h.deps, h.projectId, "retained.wav", Buffer.from("retained"));
  insertAsset(h.deps.db, retained);
  const path = join(h.deps.paths.staging, "audio");
  writeFileSync(path, "audio");
  insertStagedFile(h.deps.db, {
    id: "audio",
    stageKind: "audio",
    path: "audio",
    originalFilename: "audio.wav",
    bytes: 5,
    state: "staged",
    createdAt: h.deps.clock.now().toISOString(),
  });
  const edit: RevisionEdit = {
    config: { ...h.config, sources: { ...h.config.sources, audio: "provide" } },
    content: { ...h.base.revision.content, articleMarkdown: "Changed article." },
    uploads: [{ stagedFileId: "audio", destination: { kind: "provided", stage: "audio" } }],
  };
  const request = {
    projectId: h.projectId,
    baseRevisionId: h.base.revision.id,
    idempotencyKey: "prepared",
    edit,
  };
  const directories = () => readdirSync(join(h.deps.paths.projects, h.projectId, "assets")).sort();
  return { ...h, path, retained, request, directories };
}

it("owns partial allocation cleanup when asynchronous audio inspection throws", async () => {
  const h = await fixture();
  const imagePath = join(h.deps.paths.staging, "image");
  writeFileSync(imagePath, "image");
  insertStagedFile(h.deps.db, {
    id: "image",
    stageKind: "images",
    path: "image",
    originalFilename: "image.png",
    bytes: 5,
    state: "staged",
    createdAt: h.deps.clock.now().toISOString(),
  });
  const edit: RevisionEdit = {
    ...h.request.edit,
    config: {
      ...h.request.edit.config,
      sources: { ...h.request.edit.config.sources, images: "provide" },
    },
    content: {
      ...h.request.edit.content,
      imageOrder: ["image"],
      imageDefinitions: { image: { source: "provide", assetId: null, prompt: null } },
    },
    uploads: [
      { stagedFileId: "image", destination: { kind: "image", imageKey: "image" } },
      ...(h.request.edit.uploads ?? []),
    ],
  };
  const original = structuredClone(edit);
  await expect(
    prepareEditAssets(
      {
        ...h.deps,
        measureAudio: async () => {
          throw new Error("inspection failed");
        },
      },
      h.base,
      edit,
    ),
  ).rejects.toThrow("inspection failed");
  expect(h.directories()).toEqual([h.retained.id]);
  expect(edit).toEqual(original);
  expect(existsSync(imagePath)).toBe(true);
  expect(existsSync(h.path)).toBe(true);
});

it("returns completed prepared descriptors with the bound edit without changing input", async () => {
  const h = await fixture();
  const original = structuredClone(h.request.edit);
  const result = await prepareEditAssets(
    { ...h.deps, measureAudio: async () => 1000 },
    h.base,
    h.request.edit,
  );
  expect(result).toMatchObject({
    edit: { content: { provided: { audio: expect.any(String) } } },
    assets: expect.arrayContaining([
      expect.objectContaining({ output: expect.objectContaining({ durationMs: 1000 }) }),
    ]),
  });
  expect(h.request.edit).toEqual(original);
  expect(existsSync(h.path)).toBe(true);
});

it.each(["rollback", "invalid-cues"] as const)(
  "cleans prepared files after %s while retaining shared assets and staging",
  async (mode) => {
    const h = await fixture();
    const request =
      mode === "invalid-cues"
        ? {
            ...h.request,
            edit: {
              ...h.request.edit,
              config: {
                ...h.request.edit.config,
                subtitles: {
                  mode: "files" as const,
                  language: "en" as const,
                  fontId: "default",
                  fontSize: 48,
                  position: "bottom" as const,
                },
              },
              content: {
                ...h.request.edit.content,
                subtitleCues: {
                  audioFingerprint: "pending",
                  cues: [{ id: "a", text: "Too long", start: 0, end: 2 }],
                },
              },
            },
          }
        : h.request;
    if (mode === "rollback")
      h.deps.db.exec(
        "CREATE TRIGGER reject_output BEFORE INSERT ON outputs BEGIN SELECT RAISE(ABORT,'projection refused'); END",
      );
    const result = saveRevision({ ...h.deps, measureAudio: async () => 1000 }, request);
    if (mode === "rollback") await expect(result).rejects.toThrow("projection refused");
    else
      expect(await result).toMatchObject({
        ok: false,
        reason: "invalid-edit",
        fields: [expect.objectContaining({ field: "content.subtitleCues.cues.0.end" })],
      });
    expect(h.directories()).toEqual([h.retained.id]);
    expect(existsSync(h.path)).toBe(true);
    expect(existsSync(outputPath(h.deps.paths, h.projectId, h.retained.path))).toBe(true);
    expect(h.deps.db.prepare("SELECT count(*) AS n FROM staged_files").get()).toEqual({ n: 1 });
    expect(h.deps.db.prepare("SELECT count(*) AS n FROM revision_mutations").get()).toEqual({
      n: 0,
    });
    expect(listRevisionHistory(h.deps.db, h.projectId)).toHaveLength(1);
  },
);

it("retains committed prepared files and consumes the staged source once", async () => {
  const h = await fixture();
  const result = await saveRevision({ ...h.deps, measureAudio: async () => 1000 }, h.request);
  if (!result.ok) throw new Error(JSON.stringify(result));
  for (const output of result.view.outputs)
    expect(existsSync(outputPath(h.deps.paths, h.projectId, output.output.path))).toBe(true);
  expect(existsSync(outputPath(h.deps.paths, h.projectId, h.retained.path))).toBe(true);
  expect(existsSync(h.path)).toBe(false);
  expect(h.deps.db.prepare("SELECT count(*) AS n FROM staged_files").get()).toEqual({ n: 0 });
  expect(h.deps.db.prepare("SELECT count(*) AS n FROM attempts").get()).toEqual({ n: 0 });
});

it("preserves a reused retained output when later preparation fails", async () => {
  const h = await fixture();
  const deps = { ...h.deps, measureAudio: async () => 1000 };
  const saved = await saveRevision(deps, h.request);
  if (!saved.ok) throw new Error(JSON.stringify(saved));
  const audioId = saved.view.revision.content.provided.audio;
  if (audioId === undefined) throw new Error("Expected supplied audio.");
  const before = h.directories();
  const edit: RevisionEdit = {
    config: {
      ...saved.view.revision.config,
      sources: { ...saved.view.revision.config.sources, research: "provide" },
      provided: { ...saved.view.revision.config.provided, research: "Notes" },
    },
    content: saved.view.revision.content,
  };
  const base = {
    ...saved.view,
    revision: { ...saved.view.revision, content: { ...saved.view.revision.content, provided: {} } },
  };
  let calls = 0;
  await expect(
    prepareEditAssets(
      {
        ...deps,
        ids: {
          next: () => {
            if (++calls === 2) throw new Error("allocation failed");
            return deps.ids.next();
          },
        },
      },
      base,
      edit,
    ),
  ).rejects.toThrow("allocation failed");
  expect(h.directories()).toEqual(before);
  const audio = saved.view.outputs.find((row) => row.assetId === audioId);
  if (audio === undefined) throw new Error("Expected audio output.");
  expect(existsSync(outputPath(h.deps.paths, h.projectId, audio.output.path))).toBe(true);
});
