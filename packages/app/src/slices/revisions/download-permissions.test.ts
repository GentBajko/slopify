import { statSync } from "node:fs";
import { expect, it, vi } from "vitest";
import { retainedOutput } from "./downloads.fake.js";
import { findRevisionDownload, revisionImagesZip } from "./downloads.js";
import { mutationFixture } from "./mutation.fake.js";
import { getRevisionView } from "./view.js";

vi.mock("node:fs", async (importOriginal) => {
  const fs = await importOriginal<typeof import("node:fs")>();
  return { ...fs, statSync: vi.fn(fs.statSync) };
});

it("propagates filesystem access errors instead of reporting historical files missing", async () => {
  const h = await mutationFixture();
  try {
    const image = retainedOutput(h.deps, h.base.revision, "image", "image.png", "bytes");
    for (const read of [
      () => findRevisionDownload(h.deps, h.projectId, h.base.revision.id, image.recordId),
      () => revisionImagesZip(h.deps, h.projectId, h.base.revision.id),
      () => getRevisionView(h.deps, h.projectId, h.base.revision.id),
    ]) {
      vi.mocked(statSync).mockImplementationOnce(() => {
        throw new Error("EACCES: permission denied");
      });
      expect(read).toThrow("EACCES: permission denied");
    }
    expect(
      h.deps.db.prepare("SELECT id FROM project_assets WHERE id=?").get(image.row.assetId),
    ).toBeDefined();
  } finally {
    h.close();
  }
});
