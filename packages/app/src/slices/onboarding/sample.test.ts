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
import { type SampleId, sampleIds } from "./model.js";
import {
  copySample,
  isSampleProject,
  restoreSamples,
  type SampleDeps,
  sampleArchives,
  sampleProjectId,
  sampleProjectIds,
  seedSamples,
} from "./sample.js";

const catalogue = parseCatalogue(
  readFileSync(new URL("../../assets/models.yaml", import.meta.url), "utf8"),
);
const cleanup: (() => void)[] = [];
afterEach(() => {
  for (const done of cleanup.splice(0)) done();
});

function fixture(
  archives: Partial<Record<SampleId, string>> = sampleArchives,
): SampleDeps & { readonly catalogue: typeof catalogue } {
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
    archives,
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

function selectedRoles(deps: ReturnType<typeof fixture>, projectId: string): Set<string> {
  const view = getRevisionView(deps, projectId, currentRevisionId(deps.db, projectId) ?? "");
  return new Set(
    view?.outputs.filter((row) => row.selected).map((row) => row.output.role as string),
  );
}

function seeded(deps: ReturnType<typeof fixture>): Record<SampleId, string> {
  const ids = sampleProjectIds(deps.db);
  const { library, audiobook, podcast } = ids;
  if (library === null || audiobook === null || podcast === null)
    throw new Error(`not seeded: ${JSON.stringify(ids)}`);
  return { library, audiobook, podcast };
}

const titles: Record<SampleId, string> = {
  library: "The Library of Alexandria",
  audiobook: "The Wind in the Willows: The River Bank",
  podcast: "The Antikythera Mechanism",
};

// Each unpacks and plans three whole sample projects: under two seconds alone, but past the
// default five on a runner busy with the rest of the suite.
describe("the bundled samples", { timeout: 30_000 }, () => {
  it("ship small enough for the package", () => {
    expect(readFileSync(sampleArchives.library).byteLength).toBeLessThan(25 * 1024 * 1024);
    for (const id of ["audiobook", "podcast"] as const) {
      expect(existsSync(sampleArchives[id])).toBe(true);
      expect(readFileSync(sampleArchives[id]).byteLength).toBeLessThanOrEqual(10_000_000);
    }
  });

  it("are seeded once as finished projects with nothing left to make", async () => {
    const deps = fixture();
    expect(await seedSamples(deps)).toEqual({
      library: "seeded",
      audiobook: "seeded",
      podcast: "seeded",
    });
    const ids = seeded(deps);
    expect(sampleProjectId(deps.db)).toBe(ids.library);
    for (const id of sampleIds) {
      const projectId = ids[id];
      expect(isSampleProject(deps.db, projectId)).toBe(true);
      expect(projectTitle(deps.db, projectId)).toBe(titles[id]);
      expect(derive(stagesOf(deps.db, projectId))).toBe("done");
      expect(work(deps, projectId)).toEqual([]);
      const view = getRevisionView(deps, projectId, currentRevisionId(deps.db, projectId) ?? "");
      // The bundled builds are the real ones: pictures painted ahead of time, not procedural art.
      expect(view?.revision.config.images).toEqual({
        provider: "sample-artist",
        model: "codex-painted",
      });
      const roles = selectedRoles(deps, projectId);
      for (const role of [
        "video",
        "short_video",
        "youtube_description",
        "image",
        "thumbnail",
      ] as const)
        expect(roles).toContain(role);
    }
    expect(selectedRoles(deps, ids.library)).toContain("document_pdf");
    // The demos are spoken by Inworld stock voices, a speaker each, with delivery cues, and
    // come with the MP3 and M4B with chapters.
    for (const id of ["audiobook", "podcast"] as const) {
      const config = getRevisionView(deps, ids[id], currentRevisionId(deps.db, ids[id]) ?? "")
        ?.revision.config;
      expect(config?.voices?.format).toBe(id);
      expect(config?.narrationPrompt).toBeTruthy();
      for (const speaker of config?.voices?.speakers ?? []) {
        expect(speaker.voice.provider).toBe("inworld");
        expect(speaker.voice.voice).not.toContain("__");
      }
      const roles = selectedRoles(deps, ids[id]);
      expect(roles).toContain("audio_mp3");
      expect(roles).toContain("audio_m4b");
    }
    const podcast = getRevisionView(
      deps,
      ids.podcast,
      currentRevisionId(deps.db, ids.podcast) ?? "",
    )?.revision.config.voices;
    expect(podcast?.speakers.map((speaker) => speaker.portrait !== undefined)).toEqual([
      true,
      true,
    ]);
    // The library of the machine that built them never comes along.
    expect(deps.db.prepare("SELECT count(*) AS n FROM prompts").get()).toEqual({ n: 0 });
    expect(
      deps.db.prepare("SELECT count(*) AS n FROM settings WHERE key NOT LIKE 'onboarding.%'").get(),
    ).toEqual({ n: 0 });
    // A second launch, or one after the user deleted one, leaves them as they are.
    expect(Object.values(await seedSamples(deps))).toEqual([
      "already-seeded",
      "already-seeded",
      "already-seeded",
    ]);
    deps.db.prepare("DELETE FROM projects WHERE id=?").run(ids.podcast);
    expect((await seedSamples(deps)).podcast).toBe("already-seeded");
    expect(sampleProjectIds(deps.db).podcast).toBeNull();
  });

  it("adds a demo once to an install that already had the first sample", async () => {
    const deps = fixture({
      ...sampleArchives,
      audiobook: "/nowhere/a.tar",
      podcast: "/nowhere/p.tar",
    });
    expect(await seedSamples(deps)).toEqual({
      library: "seeded",
      audiobook: "missing",
      podcast: "missing",
    });
    const later = { ...deps, archives: sampleArchives };
    expect(await seedSamples(later)).toEqual({
      library: "already-seeded",
      audiobook: "seeded",
      podcast: "seeded",
    });
  });

  it("says so, and seeds nothing, when the archives are missing", async () => {
    const deps = fixture({
      library: "/nowhere/sample.tar",
      audiobook: "/nowhere/a.tar",
      podcast: "/nowhere/p.tar",
    });
    expect(Object.values(await seedSamples(deps))).toEqual(["missing", "missing", "missing"]);
    expect(await restoreSamples(deps)).toMatchObject({ ok: false, status: 500 });
  });

  it("restores the originals after they were deleted", async () => {
    const deps = fixture();
    await seedSamples(deps);
    const ids = seeded(deps);
    deleteProject(deps, ids.library);
    deleteProject(deps, ids.audiobook);
    const restored = await restoreSamples(deps);
    expect(restored).toEqual({ ok: true, samples: ids });
    for (const id of sampleIds) expect(derive(stagesOf(deps.db, ids[id]))).toBe("done");
    // Restoring over present samples replaces them.
    expect(await restoreSamples(deps)).toEqual({ ok: true, samples: ids });
  });

  it("copies each into an ordinary project that has nothing to rebuild", async () => {
    const deps = fixture();
    await seedSamples(deps);
    const ids = seeded(deps);
    for (const id of sampleIds) {
      const copied = copySample(deps, ids[id]);
      if (!copied.ok) throw new Error(copied.detail);
      expect(copied.projectId).not.toBe(ids[id]);
      expect(isSampleProject(deps.db, copied.projectId)).toBe(false);
      expect(projectTitle(deps.db, copied.projectId)).toBe(`${titles[id]} (my copy)`);
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
      expect(work(deps, ids[id])).toEqual([]);
      expect(copySample(deps, ids[id])).toMatchObject({ ok: true });
      expect(copySample(deps, copied.projectId)).toMatchObject({ ok: false, status: 404 });
    }
  });
});
