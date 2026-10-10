import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { z } from "zod";
import type { LogFields, LogLevel } from "../../kernel/log.js";
import type { RunConfig } from "../../slices/admission/model.js";
import { config, emptyView } from "../../slices/rebuild/recipe-fixture.js";
import { insertRevision } from "../../slices/revisions/repo.js";
import type { Output } from "../../slices/storage/model.js";
import { insertOutput } from "../../slices/storage/repo.js";
import { listProjectFiles, measuredOnce, projectFile } from "./file-tools.js";
import { connectAgent, mcpFixture } from "./mcp.fake.js";

const open: { readonly close: () => void }[] = [];
afterEach(() => {
  for (const fixture of open.splice(0)) fixture.close();
});

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

function withFiles(options: Parameters<typeof mcpFixture>[0] = {}) {
  const h = mcpFixture(options);
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
function narratedHead(
  h: ReturnType<typeof withFiles>,
  runConfig: RunConfig = narrated,
  durationMs: number | null = 3000,
): void {
  const { db } = h.deps;
  insertRevision(db, { ...emptyView(runConfig).revision, id: "head", projectId: h.projectId });
  db.prepare("INSERT INTO project_heads VALUES (?, 'head')").run(h.projectId);
  // The head's narration, as the subtitles stage timed its words on it.
  db.prepare(
    "INSERT INTO project_assets(id,project_id,path,bytes,created_at) VALUES ('a-body',?,'audio/body.mp3',3,'2026-09-10T00:00:00.000Z')",
  ).run(h.projectId);
  db.prepare(
    "INSERT INTO revision_outputs(id,project_id,revision_id,slot,work_key,asset_id,fingerprint,state,descriptor,selected,created_at) VALUES ('ro-body',?,'head','audio_body','audio:body:concat','a-body','f','ready',?,1,'2026-09-10T00:00:00.000Z')",
  ).run(
    h.projectId,
    JSON.stringify({ ...h.output("o2", "audio_body", "audio/body.mp3", "audio"), durationMs }),
  );
}

it("lists the files in their folder groups with path and URL", () => {
  const h = withFiles();
  const listed = JSON.stringify(listProjectFiles(h.deps, h.projectId).content);
  expect(listed).toContain('\\"group\\":\\"Working\\"');
  expect(listed).toContain(`/files/${h.projectId}/image-1`);
  expect(listed).toContain("Working/Narration/body.mp3");
});

it("returns a picture as image content, and audio as its path, URL and word timing", async () => {
  const h = withFiles();
  narratedHead(h);
  const picture = await projectFile(h.deps, h.projectId, `/files/${h.projectId}/image-1`);
  expect(picture.content[0]).toMatchObject({
    type: "image",
    mimeType: "image/png",
    data: png.toString("base64"),
  });
  const narration = JSON.stringify(
    (await projectFile(h.deps, h.projectId, `/files/${h.projectId}/audio-body`)).content,
  );
  expect(narration).toContain(`/files/${h.projectId}/audio-body`);
  expect(narration).toContain(join(h.deps.paths.projects, h.projectId, "audio", "body.mp3"));
  expect(narration).toContain("Hello");
});

it("says which tool finds the right address for a file it cannot find", async () => {
  const h = withFiles();
  for (const url of ["nothing", `/files/${h.projectId}/nothing`, "/files/other/image-1"]) {
    const missing = await projectFile(h.deps, h.projectId, url);
    expect(missing.isError).toBe(true);
    expect(JSON.stringify(missing.content)).toContain("list_project_files");
  }
});

it("gives word timing with the current narration only, not an intro or an older version", async () => {
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
  const said = async (url: string) =>
    JSON.stringify((await projectFile(h.deps, h.projectId, url)).content);
  const intro = await said(`/files/${h.projectId}/audio-intro`);
  expect(intro).toContain("intro.mp3");
  expect(intro).not.toContain("wordTimings");
  const older = await said(`/files/${h.projectId}/revisions/${view.revision.id}/ro-old`);
  expect(older).toContain("body-old.mp3");
  expect(older).not.toContain("wordTimings");
  expect(await said(`/files/${h.projectId}/audio-body`)).toContain("wordTimings");
});

it("gives the audio export its word timing as it is: both play on the export's clock", async () => {
  const h = withFiles();
  // An edge of silence would move the body file's words back by a second.
  narratedHead(h, { ...narrated, edgeSilenceSeconds: 1 });
  const dir = join(h.deps.paths.projects, h.projectId);
  writeFileSync(join(dir, "audio", "export.mp3"), Buffer.from("mp3"));
  insertOutput(h.deps.db, h.output("o5", "audio_export", "audio/export.mp3", "video"));
  const answer = await projectFile(h.deps, h.projectId, `/files/${h.projectId}/audio-export`);
  const first = answer.content[0];
  const said = z
    .object({ wordTimings: z.string() })
    .parse(JSON.parse(first?.type === "text" ? first.text : "{}"));
  expect(said.wordTimings).toBe(readFileSync(join(dir, "audio", "words.json"), "utf8"));
});

it("leaves the body's word timing out, and logs why, when it can't be read", async () => {
  const h = withFiles();
  narratedHead(h);
  writeFileSync(join(h.deps.paths.projects, h.projectId, "audio", "words.json"), "{not json");
  const lines: string[] = [];
  const deps = {
    ...h.deps,
    log: {
      write: (_level: LogLevel, event: string, fields?: LogFields) =>
        void lines.push(`${event} [${fields?.projectId ?? ""}] ${fields?.detail ?? ""}`),
    },
  };
  const said = JSON.stringify(
    (await projectFile(deps, h.projectId, `/files/${h.projectId}/audio-body`)).content,
  );
  expect(said).not.toContain("wordTimings");
  expect(lines).toEqual([
    expect.stringMatching(
      /^mcp\.word-timing \[p1\] The narration's word timing was left out of get_project_file: .*JSON/,
    ),
  ]);
});

// An uploaded narration has no length recorded: it is measured, as the export measures it.
it("gives an uploaded narration its word timing, measuring the file", async () => {
  const h = withFiles();
  narratedHead(h, { ...config, sources: { ...config.sources, audio: "provide" } }, null);
  const measured: string[] = [];
  const deps = {
    ...h.deps,
    measureAudio: async (path: string) => {
      measured.push(path);
      return 3000;
    },
  };
  const said = JSON.stringify(
    (await projectFile(deps, h.projectId, `/files/${h.projectId}/audio-body`)).content,
  );
  expect(said).toContain("wordTimings");
  expect(said).toContain("Hello");
  expect(measured).toEqual([join(h.deps.paths.projects, h.projectId, "audio", "body.mp3")]);
});

it("measures a narration once while the file stays the same, and again once it changes", async () => {
  const h = withFiles();
  const path = join(h.deps.paths.projects, h.projectId, "audio", "body.mp3");
  const measured: string[] = [];
  const length = measuredOnce(async (file) => {
    measured.push(file);
    return 3000;
  });
  expect(await Promise.all([length(path), length(path)])).toEqual([3000, 3000]);
  expect(await length(path)).toBe(3000);
  expect(measured).toHaveLength(1);
  writeFileSync(path, Buffer.from("a longer narration"));
  await length(path);
  expect(measured).toHaveLength(2);
});

it("gives an uploaded narration it can't measure its words unclipped, and logs why", async () => {
  const h = withFiles();
  narratedHead(h, { ...config, sources: { ...config.sources, audio: "provide" } }, null);
  const lines: string[] = [];
  const deps = {
    ...h.deps,
    measureAudio: async () => {
      throw new Error("ffmpeg timed out");
    },
    log: {
      write: (_level: LogLevel, event: string, fields?: LogFields) =>
        void lines.push(`${event} [${fields?.projectId ?? ""}] ${fields?.detail ?? ""}`),
    },
  };
  const said = JSON.stringify(
    (await projectFile(deps, h.projectId, `/files/${h.projectId}/audio-body`)).content,
  );
  expect(said).toContain("Hello");
  expect(lines).toEqual([expect.stringMatching(/^mcp\.word-timing \[p1\] .*ffmpeg timed out/)]);
});

it("measures an uploaded narration once for an agent that asks for its timing again", async () => {
  const measured: string[] = [];
  const h = withFiles({
    measureAudio: async (path) => {
      measured.push(path);
      return 3000;
    },
  });
  narratedHead(h, { ...config, sources: { ...config.sources, audio: "provide" } }, null);
  const agent = await connectAgent(h.app);
  for (let call = 0; call < 2; call++) {
    const answer = await agent.callTool({
      name: "get_project_file",
      arguments: { id: h.projectId, url: `/files/${h.projectId}/audio-body` },
    });
    expect(JSON.stringify(answer.content)).toContain("wordTimings");
  }
  expect(measured).toHaveLength(1);
});
