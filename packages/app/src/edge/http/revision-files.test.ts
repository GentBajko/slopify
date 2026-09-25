import { unlinkSync } from "node:fs";
import { dirname } from "node:path";
import { unzipSync } from "fflate";
import { expect, it, vi } from "vitest";
import { retainedOutput, retainedPiece } from "../../slices/revisions/downloads.fake.js";
import { mutationFixture } from "../../slices/revisions/mutation.fake.js";
import { saveRevision } from "../../slices/revisions/mutations.js";
import { insertRevision } from "../../slices/revisions/repo.js";
import { outputPath } from "../../slices/storage/layout.js";
import { createHub } from "../events/hub.js";
import { type AppDeps, createApp } from "./app.js";

async function fixture(folderLocation?: AppDeps["folderLocation"]) {
  const h = await mutationFixture();
  const openFolder = vi.fn(async (_path: string): Promise<void> => undefined);
  const app = createApp({
    ...h.deps,
    ...(folderLocation === undefined ? {} : { folderLocation }),
    hub: createHub(h.deps),
    version: "test",
    webDist: "/unused",
    runner: {
      tick: () => undefined,
      abortProject: async () => undefined,
      abortAll: async () => undefined,
      settled: async () => undefined,
    },
    openFolder,
    flushSoon: () => undefined,
    probe: async () => ({ ran: false, stdout: "" }),
  });
  const file = (recordId: string) =>
    `/files/${h.projectId}/revisions/${h.base.revision.id}/${recordId}`;
  const folder = (recordId: string) =>
    `/api/projects/${h.projectId}/revisions/${h.base.revision.id}/${recordId}/open-folder`;
  return { ...h, app, openFolder, file, folder };
}

it("serves immutable old output and audio-part records after a newer Save", async () => {
  const h = await fixture();
  try {
    const old = retainedOutput(h.deps, h.base.revision, "audio_export", "old.wav", "old bytes");
    const piece = retainedPiece(h.deps, h.base.revision, "part bytes");
    retainedOutput(h.deps, h.base.revision, "audio_export", "new.wav", "new bytes");
    const saved = await saveRevision(h.deps, {
      projectId: h.projectId,
      baseRevisionId: h.base.revision.id,
      idempotencyKey: "rename",
      edit: {
        config: { ...h.config, title: "New title" },
        content: h.base.revision.content,
      },
    });
    expect(saved.ok).toBe(true);
    const response = await h.app.request(h.file(old.recordId), { headers: { range: "bytes=0-2" } });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("audio/wav");
    expect(response.headers.get("content-length")).toBe("9");
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="saved-audio-export.wav"',
    );
    expect(await response.text()).toBe("old bytes");
    const part = await h.app.request(h.file(piece.recordId));
    expect(part.status).toBe(200);
    expect(await part.text()).toBe("part bytes");
    expect((await h.app.request(h.file(old.row.output.id))).status).toBe(404);
  } finally {
    h.close();
  }
});

it("serves selected historical images as a zip and reports missing retained files", async () => {
  const h = await fixture();
  try {
    const image = retainedOutput(
      h.deps,
      h.base.revision,
      "image",
      "image.png",
      "image bytes",
      "image:one",
    );
    const zipped = await h.app.request(h.file("images.zip"));
    expect(zipped.status).toBe(200);
    expect(zipped.headers.get("content-type")).toBe("application/zip");
    expect(Object.keys(unzipSync(new Uint8Array(await zipped.arrayBuffer())))).toEqual([
      "saved-image-99.png",
    ]);
    unlinkSync(outputPath(h.deps.paths, h.projectId, image.row.output.path));
    const missing = await h.app.request(h.file(image.recordId));
    expect(missing.status).toBe(404);
    expect(await missing.json()).toMatchObject({ reason: "missing-file" });
    expect((await h.app.request(h.file("images.zip"))).status).toBe(404);
  } finally {
    h.close();
  }
});

it("opens only the scoped retained file folder and refuses foreign records and origins", async () => {
  const h = await fixture();
  try {
    const old = retainedOutput(h.deps, h.base.revision, "audio_export", "old.wav", "old bytes");
    const options = { method: "POST" };
    expect((await h.app.request(h.folder(old.recordId), options)).status).toBe(200);
    expect(h.openFolder).toHaveBeenCalledWith(
      dirname(outputPath(h.deps.paths, h.projectId, old.row.output.path)),
    );
    h.openFolder.mockClear();
    expect(
      (
        await h.app.request(h.folder(old.recordId), {
          method: "POST",
          headers: { origin: "https://foreign.example" },
        })
      ).status,
    ).toBe(403);
    h.deps.db.exec("INSERT INTO projects VALUES ('other','Other','16:9','{}','old','old')");
    insertRevision(h.deps.db, { ...h.base.revision, id: "other-revision", projectId: "other" });
    expect(
      (await h.app.request(`/files/other/revisions/other-revision/${old.recordId}`)).status,
    ).toBe(404);
    expect(
      (
        await h.app.request(
          `/api/projects/other/revisions/other-revision/${old.recordId}/open-folder`,
          options,
        )
      ).status,
    ).toBe(404);
    expect((await h.app.request(h.folder("%2E%2E%2Fother"), options)).status).toBe(400);
    expect(h.openFolder).not.toHaveBeenCalled();
    unlinkSync(outputPath(h.deps.paths, h.projectId, old.row.output.path));
    expect((await h.app.request(h.folder(old.recordId), options)).status).toBe(404);
    expect(h.openFolder).not.toHaveBeenCalled();
  } finally {
    h.close();
  }
});

it("reports an unavailable desktop without exposing filesystem details", async () => {
  const h = await fixture();
  try {
    const old = retainedOutput(h.deps, h.base.revision, "video", "video.mp4", "video");
    h.openFolder.mockRejectedValueOnce(new Error("private filesystem detail"));
    const response = await h.app.request(h.folder(old.recordId), { method: "POST" });
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private filesystem detail");
  } finally {
    h.close();
  }
});

it.skipIf(process.platform !== "linux")(
  "locates retained output and partial narration records with unchanged byte downloads",
  async () => {
    const h = await fixture({ container: true, hostProjects: "/home/u/Slopify/Projects" });
    try {
      const output = retainedOutput(
        h.deps,
        h.base.revision,
        "audio_export",
        "old.wav",
        "old bytes",
      );
      const piece = retainedPiece(h.deps, h.base.revision, "partial bytes");
      for (const [record, bytes] of [
        [output.recordId, "old bytes"],
        [piece.recordId, "partial bytes"],
      ] as const) {
        const response = await h.app.request(h.folder(record), { method: "POST" });
        expect(await response.json()).toMatchObject({
          opened: false,
          location: "docker-host",
          path: expect.stringContaining(`/Slopify/Projects/${h.projectId}/`),
        });
        expect(await (await h.app.request(h.file(record))).text()).toBe(bytes);
      }
      expect(h.openFolder).not.toHaveBeenCalled();
      expect(
        (
          await h.app.request(h.folder(output.recordId), {
            method: "POST",
            headers: { origin: "https://foreign.example" },
          })
        ).status,
      ).toBe(403);
      expect((await h.app.request(h.folder("unknown"), { method: "POST" })).status).toBe(404);
    } finally {
      h.close();
    }
  },
);
