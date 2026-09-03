import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { fixedClock } from "../../kernel/clock.fake.js";
import { openDb } from "../../kernel/db/index.js";
import { migrate } from "../../kernel/db/migrate.js";
import type { Ids } from "../../kernel/ids.js";
import type { Log } from "../../kernel/log.js";
import { ensureDirs, layout } from "../../kernel/paths.js";
import type { StageKind, StageState } from "../../kernel/pipeline.js";
import { stageKinds } from "../../kernel/pipeline.js";
import { allPiecesOf } from "../../kernel/runner/piece-repo.js";
import type { StageSource } from "../admission/model.js";
import { stagesOf } from "../admission/repo.js";
import { outputsOf } from "../storage/repo.js";
import type { RerunDeps } from "./index.js";
import { deleteImage, editArticle, regenerateImage, rerunStage, retryStage } from "./index.js";

// The shell of `logic/12`: which rows and which files each action leaves behind. The rule
// that decides *which* stages it touches is `cascade.test.ts`'s and is not repeated here.

const silent: Log = { write: (): void => {} };
const projectId = "p1";

interface Harness {
  readonly db: DatabaseSync;
  readonly dir: string;
  readonly deps: RerunDeps;
}

interface Options {
  readonly states?: Partial<Record<StageKind, StageState>>;
  readonly thumbnailSource?: StageSource;
}

function harness(options: Options = {}): Harness {
  const paths = layout(mkdtempSync(join(tmpdir(), "slopify-reruns-")));
  ensureDirs(paths, { mode: 0o700 });
  const clock = fixedClock("2026-09-03T09:00:00.000Z");
  const db = openDb(paths.db);
  migrate(db, clock);
  const dir = join(paths.projects, projectId);
  mkdirSync(join(dir, "images"), { recursive: true });
  mkdirSync(join(dir, "audio-chunks"), { recursive: true });

  db.prepare("INSERT INTO projects VALUES (?, 'Rope', '16:9', ?, ?, ?)").run(
    projectId,
    JSON.stringify({
      title: "Rope",
      format: "16:9",
      sources: {
        research: "off",
        article: "generate",
        audio: "generate",
        images: "generate",
        thumbnail: options.thumbnailSource ?? "from_prompt",
        video: "generate",
      },
      imagePrompts: [],
      values: {},
      provided: {},
      rendered: {},
      silenceGapSeconds: 3,
    }),
    "2026-09-03",
    "2026-09-03",
  );
  for (const kind of stageKinds) {
    db.prepare(
      "INSERT INTO stages (id, project_id, kind, source, state, attempt_count, progress_current, progress_total, failure_reason) VALUES (?, ?, ?, 'generate', ?, 2, 1, 2, 'it broke')",
    ).run(`s-${kind}`, projectId, kind, options.states?.[kind] ?? "done");
  }

  let n = 0;
  const ids: Ids = {
    next: (): string => {
      n += 1;
      return `new${String(n)}`;
    },
  };
  return { db, dir, deps: { db, paths, ids, clock, log: silent } };
}

function output(
  h: Harness,
  id: string,
  stageKind: StageKind,
  role: string,
  path: string,
  meta: Record<string, unknown> = {},
): void {
  writeFileSync(join(h.dir, path), `${role} bytes`);
  h.db
    .prepare(
      "INSERT INTO outputs (id, project_id, stage_kind, role, path, bytes, meta, created_at) VALUES (?, ?, ?, ?, ?, 9, ?, '2026-09-03')",
    )
    .run(id, projectId, stageKind, role, path, JSON.stringify(meta));
}

function piece(h: Harness, stageId: string, kind: string, idx: number, payload: unknown): void {
  h.db
    .prepare(
      "INSERT INTO stage_pieces (id, stage_id, kind, idx, state, payload) VALUES (?, ?, ?, ?, 'done', ?)",
    )
    .run(`piece-${stageId}-${kind}-${String(idx)}`, stageId, kind, idx, JSON.stringify(payload));
}

// A project that finished: an article, two narrated chunks joined into a body, three
// images with their pieces, a thumbnail and a rendered video.
function finished(options: Options = {}): Harness {
  const h = harness(options);
  output(h, "o-md", "article", "article_md", "article.md");
  output(h, "o-txt", "article", "article_txt", "article.txt");
  output(h, "o-sources", "article", "sources", "sources.txt");
  output(h, "o-sent", "article", "instructions", "instructions-article.txt");
  output(h, "o-body", "audio", "audio_body", "audio-body.mp3");
  for (const idx of [1, 2]) {
    writeFileSync(join(h.dir, "audio-chunks", `00${String(idx)}.mp3`), "chunk");
    piece(h, "s-audio", "chunk", idx, {
      text: `chunk ${String(idx)}`,
      file: `audio-chunks/00${String(idx)}.mp3`,
    });
  }
  for (const idx of [1, 2, 3]) {
    const path = `images/00${String(idx)}.png`;
    output(h, `o-image-${String(idx)}`, "images", "image", path, { index: idx });
    piece(h, "s-images", "image", idx, {
      promptName: "Wide",
      prompt: "a coil of rope",
      promptIndex: 1,
      indexInPrompt: idx,
      file: path,
    });
  }
  output(h, "o-thumb", "thumbnail", "thumbnail", "thumbnail.png");
  output(h, "o-video", "video", "video", "video.mp4");
  output(h, "o-render", "video", "render_params", "render.json");
  return h;
}

function states(h: Harness): Record<string, StageState> {
  return Object.fromEntries(stagesOf(h.db, projectId).map((stage) => [stage.kind, stage.state]));
}

function paths(h: Harness): string[] {
  return outputsOf(h.db, projectId).map((one) => one.path);
}

describe("the precondition every action shares", () => {
  // §Q106: "no stage of the project is `running`".
  it("refuses while a stage is running", () => {
    const h = finished({ states: { video: "running" } });

    expect(rerunStage(h.deps, projectId, "audio")).toEqual({ ok: false, reason: "running" });
    expect(editArticle(h.deps, projectId, "new")).toEqual({ ok: false, reason: "running" });
    expect(deleteImage(h.deps, projectId, "o-image-1")).toEqual({ ok: false, reason: "running" });
    expect(regenerateImage(h.deps, projectId, "o-image-1")).toEqual({
      ok: false,
      reason: "running",
    });
    expect(retryStage(h.deps, projectId, "audio")).toEqual({ ok: false, reason: "running" });
    expect(paths(h)).toContain("video.mp4");
  });

  it("refuses when no project has that id", () => {
    const h = finished();

    expect(rerunStage(h.deps, "nope", "audio")).toEqual({ ok: false, reason: "no-project" });
  });
});

describe("re-running one stage", () => {
  // Step 2 with §Q102 and §Q106: the audio is remade and the video with it, and neither
  // keeps the output it had.
  it("drops the stage's outputs, its pieces and its chunk files, and the video with them", () => {
    const h = finished();

    expect(rerunStage(h.deps, projectId, "audio")).toEqual({
      ok: true,
      redone: ["audio", "video"],
    });

    expect(states(h)).toMatchObject({ audio: "pending", video: "pending", images: "done" });
    expect(paths(h)).toEqual([
      "article.md",
      "article.txt",
      "sources.txt",
      "instructions-article.txt",
      "images/001.png",
      "images/002.png",
      "images/003.png",
      "thumbnail.png",
    ]);
    expect(existsSync(join(h.dir, "audio-body.mp3"))).toBe(false);
    expect(existsSync(join(h.dir, "video.mp4"))).toBe(false);
    expect(existsSync(join(h.dir, "render.json"))).toBe(false);
    // `logic/08` §Q66's chunks are named by their pieces, not by an output row, so the
    // re-run has to take them away itself or the next run would reuse the old narration.
    expect(existsSync(join(h.dir, "audio-chunks", "001.mp3"))).toBe(false);
    expect(allPiecesOf(h.db, "s-audio")).toEqual([]);
    expect(allPiecesOf(h.db, "s-images")).toHaveLength(3);
  });

  // `logic/01` §Q5: "the stage re-runs from scratch with a fresh attempt budget".
  it("clears the error, the progress and the attempt count off the row", () => {
    const h = finished({ states: { video: "failed" } });

    rerunStage(h.deps, projectId, "video");

    expect(h.db.prepare("SELECT * FROM stages WHERE kind = 'video'").get()).toMatchObject({
      state: "pending",
      failure_reason: null,
      attempt_count: 0,
      progress_current: null,
      progress_total: null,
    });
  });

  it("refuses a provided, a skipped and a pending stage", () => {
    const h = finished({
      states: { audio: "provided", thumbnail: "skipped", video: "pending" },
    });

    for (const kind of ["audio", "thumbnail", "video"] as const) {
      expect(rerunStage(h.deps, projectId, kind)).toEqual({
        ok: false,
        reason: "not-rerunnable",
      });
    }
  });
});

describe("retrying a stage", () => {
  // `logic/13` step 5: a canceled stage resumes exactly like a failed one, so what the
  // run before it finished is still there for it.
  it("puts the stage back to pending and keeps every piece and output", () => {
    const h = finished({ states: { audio: "canceled" } });

    expect(retryStage(h.deps, projectId, "audio")).toEqual({ ok: true, redone: ["audio"] });

    expect(states(h).audio).toBe("pending");
    expect(allPiecesOf(h.db, "s-audio")).toHaveLength(2);
    expect(existsSync(join(h.dir, "audio-chunks", "001.mp3"))).toBe(true);
    expect(paths(h)).toContain("audio-body.mp3");
  });

  it("refuses a stage that is done", () => {
    const h = finished();

    expect(retryStage(h.deps, projectId, "audio")).toEqual({
      ok: false,
      reason: "not-retryable",
    });
  });
});

describe("editing the article", () => {
  // Step 1: "the inline editor replaces the stored markdown; the plain-text narration
  // source and the sources and glossary files are rebuilt".
  it("replaces the article and its derived files and redoes the audio and the video", () => {
    const h = finished();

    const result = editArticle(
      h.deps,
      projectId,
      "# Knots\n\nRope holds.\n\n## Sources Consulted\n\nA book\n",
    );

    expect(result).toEqual({ ok: true, redone: ["audio", "video"] });
    expect(readFileSync(join(h.dir, "article.md"), "utf8")).toContain("Rope holds.");
    expect(readFileSync(join(h.dir, "article.txt"), "utf8")).toBe("Knots\n\nRope holds.\n");
    expect(readFileSync(join(h.dir, "sources.txt"), "utf8")).toContain("A book");
    expect(states(h)).toMatchObject({ article: "done", audio: "pending", video: "pending" });
    // §Q106: one output per stage. The four rows are replaced, not doubled.
    expect(paths(h).filter((path) => path === "article.md")).toEqual(["article.md"]);
    // §Q101: "prompt-based images are untouched".
    expect(paths(h)).toContain("images/002.png");
    expect(existsSync(join(h.dir, "images", "002.png"))).toBe(true);
    // §Q57's record of what was actually sent to the model is not an edit's to remove.
    expect(paths(h)).toContain("instructions-article.txt");
  });

  // §Q63: no such heading means no file, not an empty one - so a heading the edit removed
  // leaves neither a row nor a file behind.
  it("removes the sources file when the new article has no end matter", () => {
    const h = finished();

    editArticle(h.deps, projectId, "# Knots\n\nRope holds.\n");

    expect(paths(h)).not.toContain("sources.txt");
    expect(existsSync(join(h.dir, "sources.txt"))).toBe(false);
  });

  it("redoes an LLM-written thumbnail and its written prompt", () => {
    const h = finished({ thumbnailSource: "prompt_by_llm" });
    piece(h, "s-thumbnail", "prompt_written", 1, { prompt: "a rope", sent: "asked" });

    expect(editArticle(h.deps, projectId, "# Knots\n\nRope holds.\n")).toEqual({
      ok: true,
      redone: ["audio", "thumbnail", "video"],
    });
    expect(allPiecesOf(h.db, "s-thumbnail")).toEqual([]);
    expect(existsSync(join(h.dir, "thumbnail.png"))).toBe(false);
  });

  it("refuses an empty article", () => {
    const h = finished();

    expect(editArticle(h.deps, projectId, "   \n ")).toEqual({
      ok: false,
      reason: "empty-article",
    });
    expect(readFileSync(join(h.dir, "article.md"), "utf8")).toBe("article_md bytes");
  });

  it("refuses when the article stage has not produced one yet", () => {
    const h = finished({ states: { article: "failed" } });

    expect(editArticle(h.deps, projectId, "# Knots")).toEqual({ ok: false, reason: "no-article" });
  });
});

describe("deleting one image", () => {
  // §Q75 and step 5: the row, the file and the piece all go, and the video re-renders.
  it("removes the row, the file and the piece, and leaves the other images in order", () => {
    const h = finished();

    expect(deleteImage(h.deps, projectId, "o-image-2")).toEqual({ ok: true, redone: ["video"] });

    expect(paths(h).filter((path) => path.startsWith("images/"))).toEqual([
      "images/001.png",
      "images/003.png",
    ]);
    expect(existsSync(join(h.dir, "images", "002.png"))).toBe(false);
    expect(allPiecesOf(h.db, "s-images").map((one) => one.idx)).toEqual([1, 3]);
    // `logic/11` sorts on `meta.index`, so the gap the delete leaves is harmless.
    expect(
      outputsOf(h.db, projectId)
        .filter((one) => one.role === "image")
        .map((one) => one.meta.index),
    ).toEqual([1, 3]);
    expect(states(h)).toMatchObject({ images: "done", video: "pending" });
    expect(existsSync(join(h.dir, "video.mp4"))).toBe(false);
  });

  // §Q103's invariant: "at least one image always remains".
  it("refuses the last image and changes nothing", () => {
    const h = finished();
    deleteImage(h.deps, projectId, "o-image-1");
    deleteImage(h.deps, projectId, "o-image-2");

    expect(deleteImage(h.deps, projectId, "o-image-3")).toEqual({
      ok: false,
      reason: "last-image",
    });
    expect(existsSync(join(h.dir, "images", "003.png"))).toBe(true);
    expect(allPiecesOf(h.db, "s-images")).toHaveLength(1);
  });

  it("refuses an id that is not an image of this project", () => {
    const h = finished();

    expect(deleteImage(h.deps, projectId, "o-thumb")).toEqual({
      ok: false,
      reason: "unknown-image",
    });
  });
});

describe("regenerating one image", () => {
  // §Q103: "one new call with that image's stored prompt text, replacing it in place at
  // the same index". The piece carries both, so it stays.
  it("takes away only that image and keeps the plan that made it", () => {
    const h = finished();

    expect(regenerateImage(h.deps, projectId, "o-image-2")).toEqual({
      ok: true,
      redone: ["images", "video"],
    });

    expect(existsSync(join(h.dir, "images", "002.png"))).toBe(false);
    expect(existsSync(join(h.dir, "images", "001.png"))).toBe(true);
    expect(allPiecesOf(h.db, "s-images").map((one) => one.idx)).toEqual([1, 2, 3]);
    expect(states(h)).toMatchObject({ images: "pending", video: "pending" });
  });
});
