import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import type { Paths } from "../../kernel/paths.js";
import { liveProject } from "../admission/repo.js";
import { waitingExternalReviews } from "../reviews/external.js";
import { setAsideProjects } from "../uploads/repo.js";
import {
  extensionFailures,
  failedSteps,
  heldTopics,
  lateUploads,
  pausedRuns,
} from "./attention-work.js";

export const attentionKinds = [
  "external-review",
  "flagged-verdict",
  "checkpoint",
  "failed-step",
  "paused-run",
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
}

// Oldest first. A project Kept as is waits for nobody, so none of its entries is listed.
export function needsAttention(deps: AttentionDeps, now: Date): readonly AttentionEntry[] {
  const aside = setAsideProjects(deps.db);
  return [
    ...externalReviews(deps.db),
    ...flaggedVerdicts(deps.db),
    ...heldCheckpoints(deps.db),
    ...failedSteps(deps.db),
    ...pausedRuns(deps.db),
    ...heldTopics(deps.db),
    ...lateUploads(deps, now),
    ...extensionFailures(deps.db),
  ]
    .filter((entry) => entry.projectId === null || !aside.has(entry.projectId))
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

function externalReviews(db: DatabaseSync): readonly AttentionEntry[] {
  const named = titles(db);
  return waitingExternalReviews(db).map(
    (review) =>
      ({
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
      }) satisfies AttentionEntry,
  );
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
function flaggedVerdicts(db: DatabaseSync): readonly AttentionEntry[] {
  return db
    .prepare(
      `SELECT v.id, v.project_id, p.title, v.stage, v.item_key, v.reasons, v.created_at, v.redo_state, v.redo_error, h.revision_id AS head
       FROM review_verdicts v
       JOIN projects p ON p.id=v.project_id
       JOIN project_heads h ON h.project_id=v.project_id AND h.revision_id=v.revision_id
       WHERE v.passed=0 AND v.action IS NULL AND ${liveProject("v", "project_id")}
         AND NOT EXISTS (SELECT 1 FROM review_verdicts n WHERE n.project_id=v.project_id
           AND n.item_key=v.item_key AND (n.created_at>v.created_at OR (n.created_at=v.created_at AND n.rowid>v.rowid)))`,
    )
    .all()
    .map((value) => {
      const row = verdictRow.parse(value);
      const reasons = z.array(z.string()).parse(JSON.parse(row.reasons));
      const redoing = row.redo_state === "pending" || row.redo_state === "started";
      return {
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
      } satisfies AttentionEntry;
    });
}

const gateRow = z.object({
  project_id: z.string(),
  title: z.string(),
  checkpoint_id: z.string(),
  stage: z.string(),
  revision_id: z.string(),
  fingerprint: z.string(),
  created_at: z.string(),
});

// A prepared project's own Before Video hold waits for its scheduled day, not for anyone.
function heldCheckpoints(db: DatabaseSync): readonly AttentionEntry[] {
  return db
    .prepare(
      `SELECT c.project_id, p.title, c.checkpoint_id, c.stage, c.revision_id, c.fingerprint, c.created_at
       FROM review_checkpoints c
       JOIN projects p ON p.id=c.project_id
       JOIN project_heads h ON h.project_id=c.project_id AND h.revision_id=c.revision_id
       WHERE c.state IN ('held','pending-review') AND c.approved_at IS NULL AND ${liveProject("c", "project_id")}
         AND NOT (c.stage='video' AND EXISTS (SELECT 1 FROM prepared_videos v WHERE v.project_id=c.project_id))`,
    )
    .all()
    .map((value) => {
      const row = gateRow.parse(value);
      return {
        kind: "checkpoint",
        since: row.created_at,
        projectId: row.project_id,
        title: row.title,
        stage: row.stage,
        itemKey: null,
        reason: `Waiting for your review before ${row.stage}: held until it is approved.`,
        autoRetryInFlight: false,
        agentCanAct: true,
        ids: {
          id: row.project_id,
          checkpointId: row.checkpoint_id,
          revisionId: row.revision_id,
          fingerprint: row.fingerprint,
        },
        tools: ["get_checkpoints", "approve_checkpoint"],
      } satisfies AttentionEntry;
    });
}
