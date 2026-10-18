import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { expect, it } from "vitest";
import { updateProjectConfig } from "../admission/repo.js";
import { outputPath } from "../storage/layout.js";
import type { OutputRole } from "../storage/model.js";
import { insertOutput } from "../storage/repo.js";
import { ensureBaseline } from "./adopt.js";
import type { RevisionOutputView, RevisionPieceView } from "./model.js";
import { insertRevision } from "./repo.js";
import { revisionFixture } from "./revision.fake.js";
import {
  donePiece,
  getRevisionView,
  isDonePiece,
  isReadyOutput,
  readyOutput,
  resolvedArticleMarkdown,
} from "./view.js";

it("resolves a provided article without mutating its immutable snapshot", async () => {
  const h = revisionFixture();
  try {
    const baseline = await ensureBaseline(h.deps, h.projectId);
    if (!baseline.ok) throw new Error("Expected adopted baseline.");
    const view = getRevisionView(h.deps, h.projectId, baseline.view.revision.id);
    expect(view?.articleMarkdown).toBe("Saved article.");
    expect(view?.revision.content.articleEdited).toBe(false);
    expect(view?.revision.content.articleMarkdown).toBeUndefined();
  } finally {
    h.close();
  }
});

it("keeps generated article provenance and resolves the selected immutable file", async () => {
  const h = revisionFixture();
  try {
    const config = {
      ...h.config,
      sources: { ...h.config.sources, article: "generate" as const },
      provided: {},
      rendered: { article: "Write" },
    };
    updateProjectConfig(h.deps.db, h.projectId, config, h.deps.clock.now().toISOString());
    const article = outputPath(h.deps.paths, h.projectId, "article.md");
    writeFileSync(article, "Generated **article**.");
    insertOutput(h.deps.db, {
      id: "article",
      projectId: h.projectId,
      stageKind: "article",
      role: "article_md",
      path: "article.md",
      originalFilename: null,
      bytes: 22,
      durationMs: null,
      meta: {},
      createdAt: h.deps.clock.now().toISOString(),
    });
    const result = await ensureBaseline(h.deps, h.projectId);
    if (!result.ok) throw new Error("Expected baseline.");
    expect(result.view.articleMarkdown).toBe("Generated **article**.");
    expect(result.view.revision.content.articleMarkdown).toBe("Generated **article**.");
    expect(result.view.revision.content.articleEdited).toBe(false);
    expect(
      resolvedArticleMarkdown(
        h.deps,
        {
          ...result.view.revision,
          content: {
            ...result.view.revision.content,
            articleEdited: true,
            articleMarkdown: "Manual revision.",
          },
        },
        result.view.outputs,
      ),
    ).toBe("Manual revision.");
    rmSync(article);
    const missing = getRevisionView(h.deps, h.projectId, result.view.revision.id);
    expect(missing?.outputs[0]?.available).toBe(false);
    expect(missing?.articleMarkdown).toBeNull();
    expect(missing?.revision.content.articleMarkdown).toBe("Generated **article**.");
  } finally {
    h.close();
  }
});
it("reports retained directories as unavailable files", async () => {
  const h = revisionFixture();
  try {
    mkdirSync(outputPath(h.deps.paths, h.projectId, "article.md"));
    insertOutput(h.deps.db, {
      id: "article",
      projectId: h.projectId,
      stageKind: "article",
      role: "article_md",
      path: "article.md",
      originalFilename: null,
      bytes: 22,
      durationMs: null,
      meta: {},
      createdAt: h.deps.clock.now().toISOString(),
    });
    const result = await ensureBaseline(h.deps, h.projectId);
    if (!result.ok) throw new Error("Expected baseline.");
    expect(result.view.outputs[0]?.available).toBe(false);
    expect(result.view.articleMarkdown).toBe("Saved article.");
  } finally {
    h.close();
  }
});
it("isolates revision reads by project and reports historical head status", async () => {
  const h = revisionFixture();
  try {
    const result = await ensureBaseline(h.deps, h.projectId);
    if (!result.ok) throw new Error("Expected baseline.");
    expect(getRevisionView(h.deps, "other", result.view.revision.id)).toBeUndefined();
    expect(getRevisionView(h.deps, h.projectId, "absent")).toBeUndefined();
    insertRevision(h.deps.db, {
      ...result.view.revision,
      id: "next",
      parentId: result.view.revision.id,
    });
    h.deps.db
      .prepare("UPDATE project_heads SET revision_id=? WHERE project_id=?")
      .run("next", h.projectId);
    expect(getRevisionView(h.deps, h.projectId, result.view.revision.id)?.current).toBe(false);
    expect(getRevisionView(h.deps, h.projectId, "next")?.current).toBe(true);
  } finally {
    h.close();
  }
});

it("finds a selected, on-disk, finished output, narrowed by role and step", () => {
  const output = (
    workKey: string,
    role: OutputRole,
    rest: Partial<RevisionOutputView> = {},
  ): RevisionOutputView =>
    ({
      slot: workKey,
      workKey,
      assetId: workKey,
      output: { role, path: `${workKey}.bin`, meta: {} },
      fingerprint: "f",
      state: "ready",
      recordId: workKey,
      publicationId: null,
      selected: true,
      available: true,
      ...rest,
    }) as unknown as RevisionOutputView;
  const view = {
    outputs: [
      output("subtitles:timing", "subtitle_words", { selected: false }),
      output("subtitles:timing", "subtitle_words", { available: false, recordId: "gone" }),
      output("subtitles:timing", "subtitle_words", { state: "failed" } as never),
      output("subtitles:timing", "subtitle_words", { recordId: "timing" }),
      output("export:video", "video"),
    ],
  };
  expect(readyOutput(view, { workKey: "subtitles:timing" })?.recordId).toBe("timing");
  expect(readyOutput(view, { role: "subtitle_words" })?.recordId).toBe("timing");
  expect(readyOutput(view, { role: "video" })?.workKey).toBe("export:video");
  expect(readyOutput(view, { role: "video", workKey: "subtitles:timing" })).toBeUndefined();
  expect(readyOutput(view)?.recordId).toBe("timing");
  expect(view.outputs.filter((row) => isReadyOutput(row))).toHaveLength(2);
});

it("finds a selected, on-disk, done piece by its key", () => {
  const piece = (key: string, rest: Partial<RevisionPieceView> = {}): RevisionPieceView =>
    ({
      key,
      stageKind: "narration",
      piece: { state: "done", idx: 0, payload: null },
      assetId: null,
      fingerprint: "f",
      recordId: key,
      publicationId: null,
      selected: true,
      available: true,
      ...rest,
    }) as unknown as RevisionPieceView;
  const view = {
    pieces: [
      piece("a", { selected: false }),
      piece("a", { available: false }),
      piece("a", { piece: { state: "running" } } as never),
      piece("a", { recordId: "done" }),
      piece("b"),
    ],
  };
  expect(donePiece(view, "a")?.recordId).toBe("done");
  expect(donePiece(view, "c")).toBeUndefined();
  expect(isDonePiece(piece("b"), "b")).toBe(true);
  expect(isDonePiece(piece("b"), "a")).toBe(false);
});
