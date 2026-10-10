import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import type { Output } from "../../slices/storage/model.js";
import { insertOutput } from "../../slices/storage/repo.js";
import { listProjectFiles, projectFile } from "./file-tools.js";
import { mcpFixture } from "./mcp.fake.js";

const open: { readonly close: () => void }[] = [];
afterEach(() => {
  for (const fixture of open.splice(0)) fixture.close();
});

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

function withFiles() {
  const h = mcpFixture();
  open.push(h);
  const dir = join(h.deps.paths.projects, h.projectId);
  mkdirSync(join(dir, "images"), { recursive: true });
  mkdirSync(join(dir, "audio"), { recursive: true });
  writeFileSync(join(dir, "images", "one.png"), png);
  writeFileSync(join(dir, "audio", "body.mp3"), Buffer.from("mp3"));
  writeFileSync(join(dir, "audio", "words.json"), '[{"word":"Hello","start":0,"end":0.4}]');
  const output = (
    id: string,
    role: Output["role"],
    path: string,
    stageKind: Output["stageKind"],
    meta: Output["meta"] = {},
  ): Output => ({
    id,
    projectId: h.projectId,
    stageKind,
    role,
    path,
    originalFilename: null,
    bytes: 3,
    durationMs: null,
    meta,
    createdAt: "2026-09-10T00:00:00.000Z",
  });
  insertOutput(h.deps.db, output("o1", "image", "images/one.png", "images", { index: 1 }));
  insertOutput(h.deps.db, output("o2", "audio_body", "audio/body.mp3", "audio"));
  insertOutput(h.deps.db, output("o3", "subtitle_words", "audio/words.json", "video"));
  return h;
}

it("lists the files in their folder groups with path and URL", () => {
  const h = withFiles();
  const listed = JSON.stringify(listProjectFiles(h.deps, h.projectId).content);
  expect(listed).toContain('\\"group\\":\\"Working\\"');
  expect(listed).toContain(`/files/${h.projectId}/image-1`);
  expect(listed).toContain("Working/Narration/body.mp3");
});

it("returns a picture as image content, and audio as its path, URL and word timing", () => {
  const h = withFiles();
  const picture = projectFile(h.deps, h.projectId, `/files/${h.projectId}/image-1`);
  expect(picture.content[0]).toMatchObject({
    type: "image",
    mimeType: "image/png",
    data: png.toString("base64"),
  });
  const narration = JSON.stringify(
    projectFile(h.deps, h.projectId, `/files/${h.projectId}/audio-body`).content,
  );
  expect(narration).toContain(`/files/${h.projectId}/audio-body`);
  expect(narration).toContain(join(h.deps.paths.projects, h.projectId, "audio", "body.mp3"));
  expect(narration).toContain("Hello");
});

it("says which tool finds the right address for a file it cannot find", () => {
  const h = withFiles();
  for (const url of ["nothing", `/files/${h.projectId}/nothing`, "/files/other/image-1"]) {
    const missing = projectFile(h.deps, h.projectId, url);
    expect(missing.isError).toBe(true);
    expect(JSON.stringify(missing.content)).toContain("list_project_files");
  }
});
