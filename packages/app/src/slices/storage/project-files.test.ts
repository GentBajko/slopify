import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { revisionFixture } from "../revisions/revision.fake.js";
import type { Output } from "./model.js";
import { groupOf, projectFiles } from "./project-files.js";
import { insertOutput } from "./repo.js";

const open: { readonly close: () => void }[] = [];
afterEach(() => {
  for (const fixture of open.splice(0)) fixture.close();
});

it("names the folder a place is in", () => {
  expect(groupOf("Upload/video.mp4")).toBe("Upload");
  expect(groupOf("Working/Images/01.png")).toBe("Working");
  expect(groupOf("History/2026-10-04/video.mp4")).toBe("History");
});

it("lists each file with its group, place, path now and /files URL", () => {
  const h = revisionFixture();
  open.push(h);
  const dir = join(h.deps.paths.projects, h.projectId);
  mkdirSync(join(dir, "video"), { recursive: true });
  writeFileSync(join(dir, "video", "final.mp4"), "mp4");
  const video: Output = {
    id: "o1",
    projectId: h.projectId,
    stageKind: "video",
    role: "video",
    path: "video/final.mp4",
    originalFilename: null,
    bytes: 3,
    durationMs: null,
    meta: {},
    createdAt: "2026-09-10T00:00:00.000Z",
  };
  insertOutput(h.deps.db, video);
  expect(projectFiles(h.deps, h.projectId)).toEqual([
    {
      group: "Upload",
      place: "Upload/video.mp4",
      role: "video",
      path: join(dir, "video", "final.mp4"),
      url: `/files/${h.projectId}/video`,
    },
  ]);
  expect(projectFiles(h.deps, "nope")).toBeUndefined();
});
