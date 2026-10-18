import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { causedBy } from "../../kernel/errors.js";
import type { Log } from "../../kernel/log.js";
import type { Paths } from "../../kernel/paths.js";
import { liveProject } from "../admission/repo.js";
import { externalReviewOf } from "../reviews/external-rows.js";
import { waitingExternalReviewRows } from "../reviews/external-waiting.js";
import { type ProjectHolds, projectHolds } from "../reviews/holds.js";
import { templateSampleProjects } from "../template-studio/repo.js";
import { setAsideProjects } from "../uploads/repo.js";
import {
  extensionFailures,
  failedSteps,
  heldTopics,
  lateUploads,
  pausedRuns,
  rowsOf,
  type SkipRow,
  stoppedRuns,
} from "./attention-work.js";

export const attentionKinds = [
  "external-review",
  "flagged-verdict",
  "checkpoint",
  "failed-step",
  "paused-run",
  "stopped-run",
  "held-topics",
  "late-upload",
  "extension-failure",
] as const;
export type AttentionKind = (typeof attentionKinds)[number];

// One thing waiting for someone, as an agent reads Home's work list.
export interface AttentionEntry {
  readonly kind: AttentionKind;
  readonly since: string;
  // Null for a schedule's held topics.
  readonly projectId: string | null;
  // The project's title, or the schedule's name.
  readonly title: string;
  readonly stage: string | null;
  readonly itemKey: string | null;
  readonly reason: string;
  // Slopify is already retrying or redoing it: an agent leaves it alone.
  readonly autoRetryInFlight: boolean;
  // False for what an agent only reports (a late upload, the extension's failures) and for
  // anything in flight.
  readonly agentCanAct: boolean;
  // The fixing tools' arguments by name, and those tools in the order the routine uses them.
  readonly ids: Readonly<Record<string, string>>;
  readonly tools: readonly string[];
}

export interface AttentionDeps {
  readonly db: DatabaseSync;
  readonly paths: Paths;
  readonly log: Pick<Log, "write">;
}

const projectOf = z.object({ project_id: z.string() });

// Oldest first. A project Kept as is waits for nobody, so none of its entries is listed. Each
// source is read on its own: one that fails is logged and left out, and the others still list.
export function needsAttention(deps: AttentionDeps, now: Date): readonly AttentionEntry[] {
  const { db, log } = deps;
  const skip: SkipRow = (source, value, error) => {
    const project = projectOf.safeParse(value);
    log.write("error", "attention.row", {
      ...(project.success ? { projectId: project.data.project_id } : {}),
      detail: `needs_attention left out one of the ${source} it could not read: ${causedBy(error)}`,
    });
  };
  // Read once for the checkpoints and the stopped runs, when the first of them asks.
  let heldOnce: ProjectHolds | undefined;
  const holds = (): ProjectHolds => {
    heldOnce ??= projectHolds(db, {
      skip: (value, error) => skip("review checkpoints", value, error),
    });
    return heldOnce;
  };
  const sources: readonly (readonly [string, () => readonly AttentionEntry[]])[] = [
    ["external reviews", () => externalReviews(db, skip)],
    ["flagged verdicts", () => flaggedVerdicts(db, skip)],
    ["review checkpoints", () => heldCheckpoints(db, holds())],
    ["failed steps", () => failedSteps(db, skip)],
    ["paused runs", () => pausedRuns(db, skip)],
    ["stopped runs", () => stoppedRuns(db, holds().stopped, skip)],
    ["held topics", () => heldTopics(db, skip)],
    ["late uploads", () => lateUploads(deps, now)],
    ["extension failures", () => extensionFailures(db, skip)],
  ];
  const aside = setAsideProjects(db);
  const samples = templateSampleProjects(db);
  return sources
    .flatMap(([source, entries]) => {
      try {
        return entries();
      } catch (error) {
        log.write("error", "attention.source", {
          detail: `needs_attention left out all ${source} because reading them failed: ${causedBy(error)}`,
        });
        return [];
      }
    })
    .filter(
      (entry) =>
        entry.projectId === null || (!aside.has(entry.projectId) && !samples.has(entry.projectId)),
    )
    .toSorted((a, b) => a.since.localeCompare(b.since));
}

function titles(db: DatabaseSync): ReadonlyMap<string, string> {
  return new Map(
    db
      .prepare("SELECT id, title FROM projects")
      .all()
      .map((row) => {
        const parsed = z.object({ id: z.string(), title: z.string() }).parse(row);
        return [parsed.id, parsed.title] as const;
      }),
  );
}

function externalReviews(db: DatabaseSync, skip: SkipRow): readonly AttentionEntry[] {
  const named = titles(db);
  return rowsOf(waitingExternalReviewRows(db), "external reviews", skip, (value) => {
    const review = externalReviewOf(value);
    return [
      {
        kind: "external-review",
        since: review.waitingSince,
        projectId: review.projectId,
        title: named.get(review.projectId) ?? "",
        stage: review.stage,
        itemKey: review.itemKey,
        reason: `Waiting for an agent's verdict; it passes without review at ${review.deadlineAt}.`,
        autoRetryInFlight: false,
        agentCanAct: true,
        ids: { id: review.projectId, reviewId: review.id },
        tools: ["get_external_review", "submit_review_verdict"],
      } satisfies AttentionEntry,
    ];
  });
}

const verdictRow = z.object({
  id: z.string(),
  project_id: z.string(),
  title: z.string(),
  stage: z.string(),
  item_key: z.string(),
  reasons: z.string(),
  created_at: z.string(),
  redo_state: z.enum(["pending", "started", "failed"]).nullable(),
  redo_error: z.string().nullable(),
  head: z.string(),
});

// Each item's latest failed verdict nobody has acted on, in the current version.
function flaggedVerdicts(db: DatabaseSync, skip: SkipRow): readonly AttentionEntry[] {
  const rows = db
    .prepare(
      `SELECT v.id, v.project_id, p.title, v.stage, v.item_key, v.reasons, v.created_at, v.redo_state, v.redo_error, h.revision_id AS head
       FROM review_verdicts v
       JOIN projects p ON p.id=v.project_id
       JOIN project_heads h ON h.project_id=v.project_id AND h.revision_id=v.revision_id
       WHERE v.passed=0 AND v.action IS NULL AND ${liveProject("v", "project_id")}
         AND NOT EXISTS (SELECT 1 FROM review_verdicts n WHERE n.project_id=v.project_id
           AND n.item_key=v.item_key AND (n.created_at>v.created_at OR (n.created_at=v.created_at AND n.rowid>v.rowid)))`,
    )
    .all();
  return rowsOf(rows, "flagged verdicts", skip, (value) => {
    const row = verdictRow.parse(value);
    const reasons = z.array(z.string()).parse(JSON.parse(row.reasons));
    const redoing = row.redo_state === "pending" || row.redo_state === "started";
    return [
      {
        kind: "flagged-verdict",
        since: row.created_at,
        projectId: row.project_id,
        title: row.title,
        stage: row.stage,
        itemKey: row.item_key,
        reason:
          row.redo_state === "failed" && row.redo_error !== null
            ? row.redo_error
            : reasons.join(" "),
        autoRetryInFlight: redoing,
        agentCanAct: !redoing,
        ids: { id: row.project_id, verdictId: row.id, baseRevisionId: row.head },
        tools: ["list_reviews", "overrule_review", "redo_review"],
      } satisfies AttentionEntry,
    ];
  });
}

// Only a checkpoint that holds the run for the person (`reviews/holds.ts`): one whose stage's
// inputs aren't made yet holds nothing, and a Before Video hold a schedule added waits for its
// scheduled day, not for anyone.
function heldCheckpoints(db: DatabaseSync, { holding }: ProjectHolds): readonly AttentionEntry[] {
  const named = titles(db);
  return [...holding].flatMap(([projectId, holds]) =>
    holds
      .filter((hold) => hold.waitsFor === "person")
      .map(
        (hold) =>
          ({
            kind: "checkpoint",
            since: hold.since,
            projectId,
            title: named.get(projectId) ?? "",
            stage: hold.stage,
            itemKey: null,
            reason: `Waiting for your review before ${hold.stage}: held until it is approved.`,
            autoRetryInFlight: false,
            agentCanAct: true,
            ids: {
              id: projectId,
              checkpointId: hold.checkpointId,
              revisionId: hold.revisionId,
              fingerprint: hold.fingerprint,
            },
            tools: ["get_checkpoints", "approve_checkpoint"],
          }) satisfies AttentionEntry,
      ),
  );
}
