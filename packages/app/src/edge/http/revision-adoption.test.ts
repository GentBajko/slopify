import { readFileSync, writeFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
import type { CatalogueStore } from "../../catalog/store.js";
import { stageKinds } from "../../kernel/pipeline.js";
import { exportCatalogue } from "../../slices/rebuild/runtime-export.fake.js";
import { currentRevisionId } from "../../slices/revisions/repo.js";
import { revisionFixture } from "../../slices/revisions/revision.fake.js";
import { getRevisionView } from "../../slices/revisions/view.js";
import { outputPath } from "../../slices/storage/layout.js";
import { createHub } from "../events/hub.js";
import { createApp } from "./app.js";

it("adopts retained history before a direct legacy article mutation without a preceding GET", async () => {
  const h = revisionFixture();
  try {
    for (const kind of stageKinds)
      h.deps.db
        .prepare("INSERT INTO stages(id,project_id,kind,source,state) VALUES (?,?,?,?,?)")
        .run(
          kind,
          h.projectId,
          kind,
          h.config.sources[kind],
          kind === "article" ? "provided" : "skipped",
        );
    for (const [role, path] of [
      ["article_md", "article.md"],
      ["article_txt", "article.txt"],
    ]) {
      if (role === undefined || path === undefined) throw new Error("Missing legacy path");
      writeFileSync(outputPath(h.deps.paths, h.projectId, path), "Saved article.");
      h.deps.db
        .prepare(
          "INSERT INTO outputs(id,project_id,stage_kind,role,path,bytes,meta,created_at) VALUES (?,?,'article',?,?,14,'{}','today')",
        )
        .run(role, h.projectId, role, path);
    }
    const tick = vi.fn();
    const catalogue: CatalogueStore = {
      read: () => exportCatalogue,
      models: () => [],
      refresh: async () => undefined,
      status: () => ({ updatedAt: "2026-09-12", path: "unused", warning: null, source: "test" }),
    };
    const app = createApp({
      ...h.deps,
      catalogue,
      hub: createHub(h.deps),
      runner: {
        tick,
        abortProject: async () => undefined,
        abortAll: async () => undefined,
        settled: async () => undefined,
      },
      version: "test",
      webDist: "/unused",
      flushSoon: () => undefined,
      probe: async () => ({ ran: false, stdout: "" }),
    });
    expect(currentRevisionId(h.deps.db, h.projectId)).toBeUndefined();
    const response = await app.request(`/api/projects/${h.projectId}/article`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ markdown: "New article." }),
    });
    expect(response.status, await response.clone().text()).toBe(200);
    const revisions = h.deps.db
      .prepare("SELECT id FROM project_revisions WHERE project_id=? ORDER BY rowid")
      .all(h.projectId);
    expect(revisions).toHaveLength(2);
    const origin = revisions[0]?.id;
    const head = currentRevisionId(h.deps.db, h.projectId);
    if (typeof origin !== "string" || head === undefined) throw new Error("No history");
    expect(getRevisionView(h.deps, h.projectId, origin)?.articleMarkdown?.trim()).toBe(
      "Saved article.",
    );
    expect(getRevisionView(h.deps, h.projectId, head)?.articleMarkdown).toBe("New article.");
    expect(readFileSync(outputPath(h.deps.paths, h.projectId, "article.md"), "utf8")).toBe(
      "Saved article.",
    );
    expect(
      h.deps.db
        .prepare("SELECT count(*) AS n FROM revision_work WHERE dispatch_state='allowed'")
        .get()?.n,
    ).toBe(0);
    expect(h.deps.db.prepare("SELECT count(*) AS n FROM attempts").get()?.n).toBe(0);
    expect(tick).not.toHaveBeenCalled();
  } finally {
    h.close();
  }
});
