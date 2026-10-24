import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { stageKinds } from "../../kernel/pipeline.js";
import type { ListingOutputs, ProjectListing } from "./model.js";

// What a list row says about finished work, for every project in three statements: what the run
// made (the video, its shorts, the PDF, the listening files), how long the video runs, when the
// run last finished a step, which steps failed, and whether an edit left an output outdated.
// Home and Projects show it so finished projects can be told apart without opening them.

export type ListingFacts = Pick<
  ProjectListing,
  "finishedAt" | "durationSeconds" | "outputs" | "failedSteps" | "outdated"
>;

const outputRow = z.object({
  project_id: z.string(),
  role: z.string(),
  count: z.number(),
  duration_ms: z.number().nullable(),
});

const stageRow = z.object({
  project_id: z.string(),
  kind: z.enum(stageKinds),
  state: z.string(),
  finished_at: z.string().nullable(),
});

const outdatedRow = z.object({ project_id: z.string() });

// The roles a row names. A sound-only run's length comes from its export.
const namedRoles = [
  "video",
  "short_video",
  "document_pdf",
  "audio_mp3",
  "audio_m4b",
  "audio_export",
] as const;

const audioRoles: ReadonlySet<string> = new Set(["audio_mp3", "audio_m4b", "audio_export"]);

interface Gathered {
  outputs: { video: boolean; shorts: number; pdf: boolean; audio: boolean };
  videoMs: number | null;
  audioMs: number | null;
  finishedAt: string | null;
  failed: (typeof stageKinds)[number][];
}

export function listingFacts(db: DatabaseSync): ReadonlyMap<string, ListingFacts> {
  const gathered = new Map<string, Gathered>();
  const of = (projectId: string): Gathered => {
    let one = gathered.get(projectId);
    if (one === undefined) {
      one = {
        outputs: { video: false, shorts: 0, pdf: false, audio: false },
        videoMs: null,
        audioMs: null,
        finishedAt: null,
        failed: [],
      };
      gathered.set(projectId, one);
    }
    return one;
  };
  const roles = namedRoles.map(() => "?").join(",");
  for (const row of db
    .prepare(
      `SELECT project_id, role, COUNT(*) AS count, MAX(duration_ms) AS duration_ms FROM outputs WHERE role IN (${roles}) GROUP BY project_id, role`,
    )
    .all(...namedRoles)) {
    const parsed = outputRow.parse(row);
    const one = of(parsed.project_id);
    if (parsed.role === "video") {
      one.outputs.video = true;
      one.videoMs = parsed.duration_ms;
    } else if (parsed.role === "short_video") one.outputs.shorts = parsed.count;
    else if (parsed.role === "document_pdf") one.outputs.pdf = true;
    else if (audioRoles.has(parsed.role)) {
      one.outputs.audio = true;
      if (parsed.duration_ms !== null) one.audioMs = Math.max(one.audioMs ?? 0, parsed.duration_ms);
    }
  }
  for (const row of db
    .prepare(
      "SELECT project_id, kind, state, finished_at FROM stages WHERE state IN ('done','failed','provided') ORDER BY rowid",
    )
    .all()) {
    const parsed = stageRow.parse(row);
    const one = of(parsed.project_id);
    if (
      parsed.finished_at !== null &&
      (one.finishedAt === null || parsed.finished_at > one.finishedAt)
    )
      one.finishedAt = parsed.finished_at;
    if (parsed.state === "failed") one.failed.push(parsed.kind);
  }
  const outdated = new Set(
    db
      .prepare(
        "SELECT DISTINCT revision_outputs.project_id FROM revision_outputs JOIN project_heads ON project_heads.project_id = revision_outputs.project_id AND project_heads.revision_id = revision_outputs.revision_id WHERE revision_outputs.selected = 1 AND revision_outputs.state = 'outdated'",
      )
      .all()
      .map((row) => outdatedRow.parse(row).project_id),
  );
  const facts = new Map<string, ListingFacts>();
  for (const [projectId, one] of gathered) {
    const made = one.outputs;
    const ms = one.videoMs ?? one.audioMs;
    facts.set(projectId, {
      ...(one.finishedAt === null ? {} : { finishedAt: one.finishedAt }),
      ...(ms === null || ms <= 0 ? {} : { durationSeconds: Math.round(ms / 1000) }),
      ...(made.video || made.shorts > 0 || made.pdf || made.audio
        ? { outputs: { ...made } satisfies ListingOutputs }
        : {}),
      ...(one.failed.length === 0 ? {} : { failedSteps: one.failed }),
      ...(outdated.has(projectId) ? { outdated: true as const } : {}),
    });
  }
  for (const projectId of outdated)
    if (!facts.has(projectId)) facts.set(projectId, { outdated: true });
  return facts;
}
