import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { systemClock } from "../../kernel/clock.js";
import { openDb } from "../../kernel/db/index.js";
import { migrate } from "../../kernel/db/migrate.js";
import { ulidIds } from "../../kernel/ids.js";
import { ensureDirs, layout } from "../../kernel/paths.js";
import type { StageContext } from "../../kernel/runner/index.js";
import { insertPiece } from "../../kernel/runner/piece-repo.js";
import { insertProject, insertStage, projectById, updateProjectConfig } from "../admission/repo.js";
import { insertOutput } from "../storage/repo.js";
import type { VideoDeps } from "../video/run.js";
import { defaultSubtitles } from "./model.js";
import { prepareSubtitles } from "./prepare.js";

function fixture(): { deps: VideoDeps; context: StageContext; dir: string; texts: string[] } {
  const paths = layout(mkdtempSync(join(tmpdir(), "slopify-captions-")));
  ensureDirs(paths, { mode: 0o700 });
  const db = openDb(paths.db);
  migrate(db, systemClock);
  const dir = join(paths.projects, "p1");
  mkdirSync(dir);
  const texts: string[] = [];
  const deps: VideoDeps = {
    db,
    paths,
    clock: systemClock,
    ids: ulidIds,
    log: { write: () => {} },
    ffmpeg: "unused",
    count: () => {},
    alignSubtitles: async (request) => {
      texts.push(request.text);
      return [{ text: request.text, start: 0.1, end: 0.4 }];
    },
  };
  insertProject(db, {
    id: "p1",
    title: "Captions",
    format: "16:9",
    createdAt: "2026",
    updatedAt: "2026",
    config: {
      title: "Captions",
      format: "16:9",
      sources: {
        research: "off",
        article: "provide",
        audio: "generate",
        images: "provide",
        thumbnail: "off",
        video: "generate",
      },
      imagePrompts: [],
      values: {},
      provided: {},
      rendered: {},
      silenceGapSeconds: 2,
      subtitles: { ...defaultSubtitles, mode: "files" },
    },
  });
  for (const kind of ["article", "audio", "video"] as const)
    insertStage(db, {
      id: `s-${kind}`,
      projectId: "p1",
      kind,
      source: "generate",
      state: "done",
      failureReason: null,
      attemptCount: 0,
      progressCurrent: null,
      progressTotal: null,
      startedAt: null,
      finishedAt: null,
    });
  for (const category of ["intro", "outro"])
    insertPiece(db, {
      id: category,
      stageId: "s-article",
      kind: "segment",
      idx: category === "intro" ? 1 : 2,
      state: "done",
      payload: JSON.stringify({ category, text: category }),
    });
  insertPiece(db, {
    id: "body",
    stageId: "s-audio",
    kind: "chunk",
    idx: 1,
    state: "done",
    payload: JSON.stringify({ text: "Exact spoken body." }),
  });
  for (const kind of ["intro", "body", "outro"]) writeFileSync(join(dir, `${kind}.mp3`), kind);
  const context: StageContext = {
    stage: { id: "s-video", projectId: "p1", kind: "video", state: "running" },
    signal: new AbortController().signal,
    emit: () => {},
  };
  return { deps, context, dir, texts };
}

describe("subtitle preparation", () => {
  it("aligns exact retained narration and adds actual intro/body/outro gaps", async () => {
    const one = fixture();
    const prepared = await prepareSubtitles(
      one.deps,
      one.context,
      [
        { kind: "intro", path: join(one.dir, "intro.mp3"), seconds: 0.5 },
        { kind: "gap", path: null, seconds: 2 },
        { kind: "body", path: join(one.dir, "body.mp3"), seconds: 1 },
        { kind: "gap", path: null, seconds: 2 },
        { kind: "outro", path: join(one.dir, "outro.mp3"), seconds: 0.5 },
      ],
      { width: 1920, height: 1080 },
    );
    expect(one.texts).toEqual(["intro", "Exact spoken body.", "outro"]);
    expect(prepared).toBeDefined();
    const file = prepared?.assets.find((asset) => asset.role === "subtitles_srt");
    const text = readFileSync(join(one.dir, file?.path ?? "missing"), "utf8");
    expect(text).toContain("00:00:02,600 --> 00:00:02,900");
    expect(text).toContain("00:00:05,600 --> 00:00:05,900");
  });
  it("reuses timed words for styling, invalidates when audio bytes change", async () => {
    const one = fixture();
    const audio = [{ kind: "body" as const, path: join(one.dir, "body.mp3"), seconds: 1 }];
    const prepared = await prepareSubtitles(one.deps, one.context, audio, {
      width: 1920,
      height: 1080,
    });
    for (const asset of prepared?.assets ?? [])
      insertOutput(one.deps.db, {
        id: asset.role,
        projectId: "p1",
        stageKind: "video",
        role: asset.role,
        path: asset.path,
        originalFilename: null,
        bytes: 1,
        durationMs: null,
        meta: {},
        createdAt: "2026",
      });
    const saved = projectById(one.deps.db, "p1");
    if (saved === undefined) throw new Error("Missing project fixture");
    updateProjectConfig(
      one.deps.db,
      "p1",
      {
        ...saved.config,
        subtitles: { ...defaultSubtitles, mode: "burn-in", position: "upper-middle" },
      },
      "2026",
    );
    const repositioned = await prepareSubtitles(one.deps, one.context, audio, {
      width: 1080,
      height: 1920,
    });
    const ass = repositioned?.assets.find((asset) => asset.role === "subtitle_ass");
    expect(readFileSync(join(one.dir, ass?.path ?? "missing"), "utf8")).toContain(
      "{\\an5\\pos(540,480)}",
    );
    expect(one.texts).toHaveLength(1);
    writeFileSync(join(one.dir, "body.mp3"), "changed recording");
    await prepareSubtitles(one.deps, one.context, audio, { width: 1920, height: 1080 });
    expect(one.texts).toHaveLength(2);
    expect(existsSync(join(one.dir, prepared?.assets[0]?.path ?? "missing"))).toBe(true);
  });
});
