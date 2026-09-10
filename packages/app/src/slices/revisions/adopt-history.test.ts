import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { afterEach, expect, it } from "vitest";
import { insertPiece } from "../../kernel/runner/piece-repo.js";
import { projectById, updateProjectConfig } from "../admission/repo.js";
import { deletePrompt, insertPrompt, replacePrompt } from "../library/repo.js";
import { outputPath } from "../storage/layout.js";
import type { Output } from "../storage/model.js";
import { insertOutput } from "../storage/repo.js";
import { ensureBaseline } from "./adopt.js";
import { revisionFixture } from "./revision.fake.js";

const fixtures: ReturnType<typeof revisionFixture>[] = [];
afterEach(() => {
  for (const h of fixtures.splice(0)) h.close();
});
function setup(): ReturnType<typeof revisionFixture> {
  const h = revisionFixture();
  fixtures.push(h);
  return h;
}
function output(
  h: ReturnType<typeof revisionFixture>,
  id: string,
  role: Output["role"],
  file = `${id}.dat`,
  exists = true,
): Output {
  const row: Output = {
    id,
    projectId: h.projectId,
    stageKind: role === "article_md" ? "article" : "video",
    role,
    path: file,
    bytes: 123,
    durationMs: role === "audio_export" ? 5000 : null,
    originalFilename: null,
    meta: {},
    createdAt: h.deps.clock.now().toISOString(),
  };
  insertOutput(h.deps.db, row);
  if (exists) {
    const path = outputPath(h.deps.paths, h.projectId, file);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `contents:${id}`);
  }
  return row;
}

it("retains every export role and text-only or malformed legacy piece", async () => {
  const h = setup();
  for (const role of [
    "audio_export",
    "subtitles_srt",
    "subtitles_vtt",
    "subtitle_ass",
    "subtitle_font",
    "subtitle_words",
    "render_params",
  ] as const)
    output(h, role, role);
  h.deps.db
    .prepare("INSERT INTO stages(id,project_id,kind,source,state) VALUES (?,?,?,?,?)")
    .run("research", h.projectId, "research", "generate", "failed");
  const payloads = [JSON.stringify({ title: "notes", notes: "Kept chapter" }), "{broken", null];
  for (const [index, payload] of payloads.entries())
    insertPiece(h.deps.db, {
      id: `piece${index}`,
      stageId: "research",
      kind: "chapter",
      idx: index,
      state: "done",
      payload,
    });
  const result = await ensureBaseline(h.deps, h.projectId);
  if (!result.ok) throw new Error("Expected baseline.");
  expect(result.view.outputs).toHaveLength(7);
  expect(
    result.view.outputs.every((row) => row.selected && row.available && row.state === "ready"),
  ).toBe(true);
  expect(result.view.pieces.map((row) => row.piece.payload)).toEqual(payloads);
  expect(
    result.view.pieces.every((row) => row.available && row.selected && row.assetId === null),
  ).toBe(true);
});
it("serializes concurrent adoption without changing saved project configuration", async () => {
  const h = setup();
  const original = projectById(h.deps.db, h.projectId);
  const results = await Promise.all(
    Array.from({ length: 5 }, () => ensureBaseline(h.deps, h.projectId)),
  );
  expect(results.filter((row) => row.ok && row.created)).toHaveLength(1);
  expect(h.deps.db.prepare("SELECT id FROM project_revisions").all()).toHaveLength(1);
  expect(projectById(h.deps.db, h.projectId)).toEqual(original);
  expect(results[0]?.ok && results[0].view.revision.config).toEqual(original?.config);
});
it("does not invent a project or head for a missing project", async () => {
  const h = setup();
  expect(await ensureBaseline(h.deps, "missing")).toEqual({ ok: false, reason: "no-project" });
  expect(h.deps.db.prepare("SELECT * FROM project_heads").all()).toEqual([]);
});
it("preserves missing output bytes and nullable missing chunk bytes", async () => {
  const h = setup();
  output(h, "lost", "audio_export", "missing.wav", false);
  h.deps.db
    .prepare("INSERT INTO stages(id,project_id,kind,source,state) VALUES (?,?,?,?,?)")
    .run("audio", h.projectId, "audio", "generate", "failed");
  insertPiece(h.deps.db, {
    id: "chunk",
    stageId: "audio",
    kind: "chunk",
    idx: 1,
    state: "done",
    payload: '{"text":"hello","file":"missing.mp3"}',
  });
  const result = await ensureBaseline(h.deps, h.projectId);
  if (!result.ok) throw new Error("Expected baseline.");
  expect(result.view.outputs[0]?.available).toBe(false);
  expect(result.view.pieces[0]?.available).toBe(false);
  expect(h.deps.db.prepare("SELECT path,bytes FROM project_assets ORDER BY path").all()).toEqual([
    { path: "missing.mp3", bytes: null },
    { path: "missing.wav", bytes: 123 },
  ]);
});
it("deduplicates identical retained paths and selects the first singleton without losing later records", async () => {
  const h = setup();
  output(h, "first", "audio_export", "same.wav");
  output(h, "second", "audio_export", "same.wav");
  const result = await ensureBaseline(h.deps, h.projectId);
  if (!result.ok) throw new Error("Expected baseline.");
  expect(result.view.outputs).toHaveLength(2);
  expect(result.view.outputs.filter((row) => row.selected).map((row) => row.output.id)).toEqual([
    "first",
  ]);
  expect(new Set(result.view.outputs.map((row) => row.assetId)).size).toBe(1);
  expect(h.deps.db.prepare("SELECT * FROM project_assets").all()).toHaveLength(1);
});
it.each(["missing", "changed"])(
  "preserves rendered literals when the original library entry is %s",
  async (state) => {
    const h = setup();
    const config = {
      ...h.config,
      articlePrompt: "old",
      rendered: {
        article: "Exact {literal} text",
        thumbnailPrompt: "Recorded",
        "imagePrompts.0": "An image",
      },
    };
    updateProjectConfig(h.deps.db, h.projectId, config, h.deps.clock.now().toISOString());
    const prompt = {
      id: "old",
      kind: "article" as const,
      name: "old",
      body: "Original {template}",
      slots: ["template"],
      updatedAt: h.deps.clock.now().toISOString(),
    };
    insertPrompt(h.deps.db, prompt);
    if (state === "changed") replacePrompt(h.deps.db, { ...prompt, body: "Different {template}" });
    else deletePrompt(h.deps.db, prompt.id);
    const result = await ensureBaseline(h.deps, h.projectId);
    if (!result.ok) throw new Error("Expected baseline.");
    expect(result.view.revision.config.rendered).toEqual(config.rendered);
    expect(result.view.revision.content.promptTemplates).toEqual({
      article: null,
      thumbnailPrompt: null,
      "imagePrompts.0": null,
    });
  },
);
it("rolls back all captured state after a late failure and leaves files intact", async () => {
  const h = setup();
  output(h, "one", "audio_export");
  h.deps.db.exec(
    "CREATE TRIGGER refuse_head BEFORE INSERT ON project_heads BEGIN SELECT RAISE(ABORT,'head refused'); END",
  );
  await expect(ensureBaseline(h.deps, h.projectId)).rejects.toThrow("head refused");
  for (const table of [
    "project_heads",
    "project_assets",
    "project_revisions",
    "revision_outputs",
    "revision_pieces",
  ])
    expect(h.deps.db.prepare(`SELECT * FROM ${table}`).all()).toEqual([]);
  expect(readFileSync(outputPath(h.deps.paths, h.projectId, "one.dat"), "utf8")).toBe(
    "contents:one",
  );
  expect(readdirSync(dirname(outputPath(h.deps.paths, h.projectId, "one.dat")))).toEqual([
    "one.dat",
  ]);
});
it("refuses unsafe retained file paths before establishing a baseline", async () => {
  const h = setup();
  output(h, "unsafe", "audio_export", "../outside.wav", false);
  await expect(ensureBaseline(h.deps, h.projectId)).rejects.toThrow("outside");
  expect(h.deps.db.prepare("SELECT * FROM project_heads").all()).toEqual([]);
  expect(h.deps.db.prepare("SELECT * FROM project_assets").all()).toEqual([]);
});
