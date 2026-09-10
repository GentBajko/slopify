import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { expect, it } from "vitest";
import { insertPiece } from "../../kernel/runner/piece-repo.js";
import { outputPath } from "../storage/layout.js";
import { ensureBaseline } from "./adopt.js";
import { revisionFixture } from "./revision.fake.js";

it("adopts a chunk as well as its output without copying either", async () => {
  const h = revisionFixture();
  try {
    const file = "audio-chunks/chunk-1.mp3";
    mkdirSync(dirname(outputPath(h.deps.paths, h.projectId, file)), { recursive: true });
    writeFileSync(outputPath(h.deps.paths, h.projectId, file), "chunk", { mode: 0o600 });
    h.deps.db
      .prepare("INSERT INTO stages (id,project_id,kind,source,state) VALUES (?,?,?,?,?)")
      .run("s-audio", h.projectId, "audio", "generate", "failed");
    insertPiece(h.deps.db, {
      id: "piece-1",
      stageId: "s-audio",
      kind: "chunk",
      idx: 1,
      state: "done",
      payload: JSON.stringify({ text: "hello", file }),
    });
    const first = await ensureBaseline(h.deps, h.projectId);
    const again = await ensureBaseline(h.deps, h.projectId);
    expect(first.ok && first.created).toBe(true);
    expect(again.ok && again.created).toBe(false);
    if (!first.ok) throw new Error("Expected adopted baseline.");
    expect(first.view.pieces).toHaveLength(1);
    expect(first.view.pieces[0]?.assetId).not.toBeNull();
    expect(h.deps.db.prepare("SELECT path FROM project_assets").all()).toContainEqual({
      path: file,
    });
    expect(readFileSync(outputPath(h.deps.paths, h.projectId, file), "utf8")).toBe("chunk");
  } finally {
    h.close();
  }
});
