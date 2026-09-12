import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import type { StageContext } from "../../kernel/runner/index.js";
import { maySubmit } from "../../kernel/runner/work-authority.js";
import type { RunConfig } from "../admission/model.js";
import { insertInvocation } from "../rebuild/runtime-admission.js";
import { exportCatalogue } from "../rebuild/runtime-export.fake.js";
import { revisionAudio } from "../rebuild/runtime-export-inputs.js";
import { executionPlan } from "../rebuild/runtime-plan.js";
import { insertOutput } from "../storage/repo.js";
import { ensureBaseline } from "./adopt.js";
import { saveRevision } from "./mutations.js";
import { revisionFixture } from "./revision.fake.js";
import { getRevisionView } from "./view.js";

it.each(["audio_intro", "audio_outro", "audio_body"] as const)(
  "reuses retained %s as provided narration without changing its source history",
  async (sourceRole) => {
    const h = revisionFixture();
    try {
      const config: RunConfig = {
        ...h.config,
        sources: { ...h.config.sources, audio: "generate" },
        audio: { provider: "voice", model: "tts", voice: "v" },
        intro: { name: "Intro", mode: "text" },
        outro: { name: "Outro", mode: "text" },
        rendered: { intro: "Welcome", outro: "Goodbye" },
        silenceGapSeconds: 0.5,
      };
      h.deps.db
        .prepare("UPDATE projects SET config=? WHERE id=?")
        .run(JSON.stringify(config), h.projectId);
      for (const role of ["audio_intro", "audio_body", "audio_outro"] as const) {
        const path = `${role}.wav`;
        writeFileSync(join(h.deps.paths.projects, h.projectId, path), role);
        insertOutput(h.deps.db, {
          id: role,
          projectId: h.projectId,
          stageKind: "audio",
          role,
          path,
          originalFilename: `original-${role}.wav`,
          bytes: Buffer.byteLength(role),
          durationMs: role === "audio_body" ? 4000 : 1000,
          meta: {},
          createdAt: h.deps.clock.now().toISOString(),
        });
      }
      const baseline = await ensureBaseline(h.deps, h.projectId);
      if (!baseline.ok) throw new Error(JSON.stringify(baseline));
      const source = baseline.view.outputs.find((row) => row.output.role === sourceRole);
      if (source === undefined) throw new Error("Missing retained audio fixture.");
      const originalAssets = h.deps.db.prepare("SELECT * FROM project_assets ORDER BY id").all();
      const sourcePath = join(h.deps.paths.projects, h.projectId, source.output.path);
      const measuredPaths: string[] = [];
      const deps = {
        ...h.deps,
        ffmpeg: "unused",
        measureAudio: async (path: string) => {
          measuredPaths.push(path);
          return 2500;
        },
      };
      const saved = await saveRevision(deps, {
        projectId: h.projectId,
        baseRevisionId: baseline.view.revision.id,
        idempotencyKey: "retained-audio",
        edit: {
          config: { ...config, sources: { ...config.sources, audio: "provide" } },
          content: {
            ...baseline.view.revision.content,
            provided: { ...baseline.view.revision.content.provided, audio: source.assetId },
          },
        },
      });
      expect(saved.ok).toBe(true);
      if (!saved.ok) throw new Error(JSON.stringify(saved));
      const plan = executionPlan(deps, saved.view, exportCatalogue);
      expect(plan.work.find((row) => row.key === "audio:provided")?.disposition).toBe("reuse");
      const recipe = plan.recipes.find((row) => row.key === "export:wav");
      if (recipe === undefined) throw new Error("Missing WAV export recipe.");
      deps.db
        .prepare("DELETE FROM revision_work_reservations WHERE revision_id=? AND work_key=?")
        .run(saved.view.revision.id, recipe.key);
      const work = insertInvocation(
        deps,
        saved.view,
        recipe,
        exportCatalogue,
        { key: recipe.key, fingerprint: recipe.logicalFingerprint },
        false,
      );
      const context: StageContext = {
        work,
        stage: {
          id: work.stageId,
          projectId: h.projectId,
          kind: work.kind,
          state: "running",
          work,
        },
        signal: new AbortController().signal,
        maySubmit: (id) => maySubmit(deps.db, work, id),
        emit: () => undefined,
      };
      await expect(revisionAudio(deps, context, saved.view)).resolves.toEqual([
        { kind: "body", path: sourcePath, seconds: 2.5 },
      ]);
      const provided = saved.view.outputs.find(
        (row) => row.selected && row.workKey === "audio:provided",
      );
      expect(provided).toMatchObject({
        assetId: source.assetId,
        slot: "audio:audio_body",
        available: true,
        state: "ready",
        output: {
          ...source.output,
          id: expect.any(String),
          role: "audio_body",
          durationMs: 2500,
        },
      });
      expect(provided?.output.id).not.toBe(source.output.id);
      expect(measuredPaths).toEqual([sourcePath]);
      expect(readFileSync(sourcePath, "utf8")).toBe(sourceRole);
      expect(h.deps.db.prepare("SELECT * FROM project_assets ORDER BY id").all()).toEqual(
        expect.arrayContaining(originalAssets),
      );
      expect(getRevisionView(deps, h.projectId, baseline.view.revision.id)?.outputs).toEqual(
        baseline.view.outputs,
      );
    } finally {
      h.close();
    }
  },
);
