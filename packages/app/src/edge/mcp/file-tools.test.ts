import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { z } from "zod";
import { config, emptyView } from "../../slices/rebuild/recipe-fixture.js";
import { insertRevision } from "../../slices/revisions/repo.js";
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
  writeFileSync(
    join(dir, "audio", "words.json"),
    JSON.stringify({ key: "k", words: [{ text: "Hello", start: 0, end: 0.4 }], omissions: [] }),
  );
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
    durationMs: role === "audio_body" ? 3000 : role === "audio_intro" ? 2000 : null,
    meta,
    createdAt: "2026-09-10T00:00:00.000Z",
  });
  insertOutput(h.deps.db, output("o1", "image", "images/one.png", "images", { index: 1 }));
  insertOutput(h.deps.db, output("o2", "audio_body", "audio/body.mp3", "audio"));
  insertOutput(h.deps.db, output("o3", "subtitle_words", "audio/words.json", "video"));
  return { ...h, output };
}

// The project's current version speaks generated narration, so its word timing is for it.
const narrated = { ...config, sources: { ...config.sources, audio: "generate" as const } };
function narratedHead(h: ReturnType<typeof withFiles>): void {
  insertRevision(h.deps.db, {
    ...emptyView(narrated).revision,
    id: "head",
    projectId: h.projectId,
  });
  h.deps.db.prepare("INSERT INTO project_heads VALUES (?, 'head')").run(h.projectId);
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
  narratedHead(h);
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

it("gives word timing with the current narration only, not an intro or an older version", () => {
  const h = withFiles();
  narratedHead(h);
  const { db } = h.deps;
  const dir = join(h.deps.paths.projects, h.projectId);
  writeFileSync(join(dir, "audio", "intro.mp3"), Buffer.from("mp3"));
  insertOutput(db, h.output("o4", "audio_intro", "audio/intro.mp3", "audio"));
  mkdirSync(join(dir, "History"), { recursive: true });
  writeFileSync(join(dir, "History", "body-old.mp3"), Buffer.from("mp3"));
  const view = emptyView();
  insertRevision(db, { ...view.revision, projectId: h.projectId });
  db.prepare(
    "INSERT INTO project_assets(id,project_id,path,bytes,created_at) VALUES ('a-old',?,'History/body-old.mp3',3,'2026-09-09T00:00:00.000Z')",
  ).run(h.projectId);
  db.prepare(
    "INSERT INTO revision_outputs(id,project_id,revision_id,slot,work_key,asset_id,fingerprint,state,descriptor,selected,created_at) VALUES ('ro-old',?,?,'audio_body','audio:body:concat','a-old','f','ready',?,0,'2026-09-09T00:00:00.000Z')",
  ).run(
    h.projectId,
    view.revision.id,
    JSON.stringify(h.output("o-old", "audio_body", "History/body-old.mp3", "audio")),
  );
  const said = (url: string) => JSON.stringify(projectFile(h.deps, h.projectId, url).content);
  const intro = said(`/files/${h.projectId}/audio-intro`);
  expect(intro).toContain("intro.mp3");
  expect(intro).not.toContain("wordTimings");
  const older = said(`/files/${h.projectId}/revisions/${view.revision.id}/ro-old`);
  expect(older).toContain("body-old.mp3");
  expect(older).not.toContain("wordTimings");
  expect(said(`/files/${h.projectId}/audio-body`)).toContain("wordTimings");
});

it("puts the word timing on the body's own clock for the body file, without the intro's words", () => {
  const h = withFiles();
  narratedHead(h);
  const { db } = h.deps;
  const dir = join(h.deps.paths.projects, h.projectId);
  writeFileSync(join(dir, "audio", "intro.mp3"), Buffer.from("mp3"));
  insertOutput(db, h.output("o4", "audio_intro", "audio/intro.mp3", "audio"));
  db.prepare("UPDATE project_revisions SET config=? WHERE id='head'").run(
    JSON.stringify({
      ...narrated,
      intro: { name: "Intro", mode: "llm" },
      edgeSilenceSeconds: 1,
      silenceGapSeconds: 0.5,
    }),
  );
  // Edge 1 s, intro 2 s, gap 0.5 s: the body starts at 3.5 s and ends at 6.5 s.
  const words = [
    { text: "Welcome", start: 1.2, end: 1.8 },
    { text: "Hello", start: 3.6, end: 4 },
    { text: "harbor", start: 6.2, end: 6.5 },
  ];
  writeFileSync(
    join(dir, "audio", "words.json"),
    JSON.stringify({ key: "k", words, omissions: [{ start: 1.5, text: "uh" }] }),
  );
  const timing = (url: string) =>
    JSON.parse(
      z
        .object({ wordTimings: z.string() })
        .parse(
          JSON.parse(
            z
              .array(z.object({ text: z.string() }))
              .parse(projectFile(h.deps, h.projectId, url).content)[0]?.text ?? "{}",
          ),
        ).wordTimings,
    );
  const body = timing(`/files/${h.projectId}/audio-body`);
  expect(body.words.map((word: { text: string }) => word.text)).toEqual(["Hello", "harbor"]);
  expect(body.words[0].start).toBeCloseTo(0.1);
  expect(body.words[1].end).toBeCloseTo(3);
  expect(body.omissions).toEqual([]);
});
