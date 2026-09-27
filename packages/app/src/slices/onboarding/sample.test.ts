import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseCatalogue } from "../../catalog/store.js";
import { fixedClock } from "../../kernel/clock.fake.js";
import { openDb } from "../../kernel/db/index.js";
import { migrate } from "../../kernel/db/migrate.js";
import { ulidIds } from "../../kernel/ids.js";
import { ensureDirs, layout } from "../../kernel/paths.js";
import { derive } from "../../kernel/runner/graph.js";
import { stagesOf } from "../admission/repo.js";
import { executionPlan } from "../rebuild/runtime-plan.js";
import { currentRevisionId } from "../revisions/repo.js";
import { getRevisionView } from "../revisions/view.js";
import { deleteProject } from "../storage/delete-project.js";
import { outputPath } from "../storage/layout.js";
import { projectTitle } from "../storage/repo.js";
import {
  copySample,
  isSampleProject,
  restoreSample,
  type SampleDeps,
  sampleArchive,
  sampleProjectId,
  seedSample,
} from "./sample.js";

const catalogue = parseCatalogue(
  readFileSync(new URL("../../assets/models.yaml", import.meta.url), "utf8"),
);
const cleanup: (() => void)[] = [];
afterEach(() => {
  for (const done of cleanup.splice(0)) done();
});

function fixture(archive = sampleArchive): SampleDeps & { readonly catalogue: typeof catalogue } {
  const paths = layout(mkdtempSync(join(tmpdir(), "slopify-sample-")));
  ensureDirs(paths, { mode: 0o700 });
  const db = openDb(":memory:");
  const clock = fixedClock("2026-09-27T10:00:00.000Z");
  migrate(db, clock);
  cleanup.push(() => {
    db.close();
    rmSync(paths.dataDir, { recursive: true, force: true });
  });
  return {
    db,
    paths,
    clock,
    ids: ulidIds,
    log: { write: () => undefined },
    appVersion: "test",
    archive,
    catalogue,
  };
}

// What a rebuild of the whole project would do: every step reused means nothing to pay for.
function work(deps: ReturnType<typeof fixture>, projectId: string): readonly string[] {
  const revisionId = currentRevisionId(deps.db, projectId);
  const view = revisionId === undefined ? undefined : getRevisionView(deps, projectId, revisionId);
  if (view === undefined) throw new Error("no revision");
  return executionPlan(deps, view, catalogue)
    .work.filter((row) => row.disposition !== "reuse")
    .map((row) => row.key);
}

describe("the bundled sample", () => {
  it("ships small enough for the package", () => {
    expect(existsSync(sampleArchive)).toBe(true);
    expect(readFileSync(sampleArchive).byteLength).toBeLessThan(25 * 1024 * 1024);
  });

  it("is seeded once as a finished project with nothing left to make", async () => {
    const deps = fixture();
    expect(await seedSample(deps)).toBe("seeded");
    const id = sampleProjectId(deps.db);
    if (id === undefined) throw new Error("not seeded");
    expect(isSampleProject(deps.db, id)).toBe(true);
    expect(projectTitle(deps.db, id)).toBe("The Library of Alexandria");
    expect(derive(stagesOf(deps.db, id))).toBe("done");
    expect(work(deps, id)).toEqual([]);
    const view = getRevisionView(deps, id, currentRevisionId(deps.db, id) ?? "");
    const roles = new Set(
      view?.outputs.filter((row) => row.selected).map((row) => row.output.role),
    );
    for (const role of [
      "video",
      "short_video",
      "article_txt",
      "document_pdf",
      "youtube_description",
      "image",
      "thumbnail",
    ] as const)
      expect(roles).toContain(role);
    // The library of the machine that built it never comes along.
    expect(deps.db.prepare("SELECT count(*) AS n FROM prompts").get()).toEqual({ n: 0 });
    expect(
      deps.db.prepare("SELECT count(*) AS n FROM settings WHERE key NOT LIKE 'onboarding.%'").get(),
    ).toEqual({ n: 0 });
    // A second launch, or one after the user deleted it, leaves it as it is.
    expect(await seedSample(deps)).toBe("already-seeded");
    deps.db.prepare("DELETE FROM projects WHERE id=?").run(id);
    expect(await seedSample(deps)).toBe("already-seeded");
    expect(sampleProjectId(deps.db)).toBeUndefined();
  });

  it("says so, and seeds nothing, when the archive is missing", async () => {
    const deps = fixture("/nowhere/sample.tar");
    expect(await seedSample(deps)).toBe("missing");
    expect(await restoreSample(deps)).toMatchObject({ ok: false, status: 500 });
  });

  it("restores the original after it was deleted", async () => {
    const deps = fixture();
    await seedSample(deps);
    const id = sampleProjectId(deps.db);
    deleteProject(deps, id ?? "");
    const restored = await restoreSample(deps);
    expect(restored).toEqual({ ok: true, projectId: id });
    expect(derive(stagesOf(deps.db, id ?? ""))).toBe("done");
    // Restoring over a present sample replaces it.
    expect(await restoreSample(deps)).toEqual({ ok: true, projectId: id });
  });

  it("copies into an ordinary project that has nothing to rebuild", async () => {
    const deps = fixture();
    await seedSample(deps);
    const id = sampleProjectId(deps.db) ?? "";
    const copied = copySample(deps, id);
    if (!copied.ok) throw new Error(copied.detail);
    expect(copied.projectId).not.toBe(id);
    expect(isSampleProject(deps.db, copied.projectId)).toBe(false);
    expect(projectTitle(deps.db, copied.projectId)).toBe("The Library of Alexandria (my copy)");
    expect(derive(stagesOf(deps.db, copied.projectId))).toBe("done");
    expect(work(deps, copied.projectId)).toEqual([]);
    const view = getRevisionView(
      deps,
      copied.projectId,
      currentRevisionId(deps.db, copied.projectId) ?? "",
    );
    const video = view?.outputs.find((row) => row.selected && row.output.role === "video");
    if (video === undefined) throw new Error("no video");
    expect(existsSync(outputPath(deps.paths, copied.projectId, video.output.path))).toBe(true);
    // The sample itself is untouched and can be copied again.
    expect(work(deps, id)).toEqual([]);
    expect(copySample(deps, id)).toMatchObject({ ok: true });
    expect(copySample(deps, copied.projectId)).toMatchObject({ ok: false, status: 404 });
  });
});
