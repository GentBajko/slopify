import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Catalogue } from "../../catalog/schema.js";
import type { StageContext } from "../../kernel/runner/index.js";
import { maySubmit } from "../../kernel/runner/work-authority.js";
import { mutationFixture } from "../revisions/mutation.fake.js";
import { saveRevision } from "../revisions/mutations.js";
import { getRevisionView } from "../revisions/view.js";
import { insertStagedFile } from "../storage/repo.js";
import { insertInvocation } from "./runtime-admission.js";
import { executionPlan } from "./runtime-plan.js";
import { workPieces } from "./work-records.js";

export const exportCatalogue: Catalogue = {
  schemaVersion: 1,
  updatedAt: "2026-09-12",
  providers: {},
  llm: [],
  image: [],
  tts: [],
};
export async function exportFixture(manual = true, audioBytes: Uint8Array = Buffer.from("audio")) {
  const h = await mutationFixture();
  const deps = { ...h.deps, ffmpeg: "fake-ffmpeg", measureAudio: async () => 4000 };
  writeFileSync(join(deps.paths.staging, "audio"), audioBytes);
  insertStagedFile(deps.db, {
    id: "audio",
    stageKind: "audio",
    path: "audio",
    originalFilename: "audio.wav",
    bytes: audioBytes.length,
    state: "staged",
    createdAt: deps.clock.now().toISOString(),
  });
  const saved = await saveRevision(deps, {
    projectId: h.projectId,
    baseRevisionId: h.base.revision.id,
    idempotencyKey: "audio",
    edit: {
      config: {
        ...h.config,
        sources: { ...h.config.sources, audio: "provide" },
        subtitles: {
          mode: "files",
          language: "en",
          fontId: "default",
          fontSize: 48,
          position: "bottom",
        },
      },
      content: {
        ...h.base.revision.content,
        ...(manual
          ? {
              subtitleCues: {
                audioFingerprint: "pending",
                cues: [{ id: "one", text: "Edited caption.", start: 0, end: 3 }],
              },
            }
          : {}),
      },
      uploads: [{ stagedFileId: "audio", destination: { kind: "provided", stage: "audio" } }],
    },
  });
  if (!saved.ok) throw new Error(JSON.stringify(saved));
  const view = (revisionId = saved.view.revision.id): typeof saved.view => {
    const current = getRevisionView(deps, h.projectId, revisionId);
    if (current === undefined) throw new Error("Missing view");
    return current;
  };
  const grant = (key: string, revisionId = saved.view.revision.id) => {
    const current = view(revisionId);
    const recipe = executionPlan(deps, current, exportCatalogue).recipes.find(
      (row) => row.key === key,
    );
    if (recipe === undefined) throw new Error(`Missing ${key}`);
    deps.db
      .prepare("DELETE FROM revision_work_reservations WHERE revision_id=? AND work_key=?")
      .run(current.revision.id, key);
    const work = insertInvocation(
      deps,
      current,
      recipe,
      exportCatalogue,
      { key, fingerprint: current.revision.fingerprints[key] ?? recipe.logicalFingerprint },
      false,
    );
    const piece = workPieces(deps.db, work.workId)[0];
    if (piece === undefined) throw new Error("Missing work piece");
    const context: StageContext = {
      work,
      stage: { id: work.stageId, projectId: h.projectId, kind: work.kind, state: "running", work },
      signal: new AbortController().signal,
      maySubmit: (id) => maySubmit(deps.db, work, id),
      emit: () => undefined,
    };
    return { context, piece };
  };
  return { ...h, deps, view, grant };
}
