import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { waitingReviewFixture } from "../reviews/external.fake.js";
import { saveVerdict } from "../reviews/repo.js";
import { insertOutput } from "../storage/repo.js";
import { needsAttention } from "./attention.js";

const open: { readonly close: () => void }[] = [];
afterEach(() => {
  for (const fixture of open.splice(0)) fixture.close();
});

const now = new Date("2026-09-10T12:00:00.000Z");
const scheduleId = "5c4e0f2a-7b1d-4e3a-9c6f-2d8b1a0e4f71";
const templateId = "9a1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d";
const chunkFailure =
  "Subtitles stopped matching the audio at 1:07:57 in narration chunk 5 of 10. Regenerate narration chunk 5 in Edit project → Narration, then Continue the run.";

function everything() {
  const f = waitingReviewFixture();
  open.push(f);
  const { db, paths } = f.h.deps;
  saveVerdict(db, {
    id: "v1",
    projectId: "p1",
    revisionId: f.revisionId,
    itemKey: "thumbnail:image",
    stage: "thumbnail",
    itemFingerprint: "thumb",
    reviewFingerprint: "thumb-review",
    passed: false,
    reasons: ["The title can't be read at phone size."],
    outcome: "flagged",
    attempt: 1,
    action: null,
    actionAt: null,
    redoState: null,
    redoError: null,
    answeredBy: "model",
    actionBy: null,
    createdAt: "2026-09-10T00:01:00.000Z",
  });
  db.prepare(
    "INSERT INTO review_checkpoints(project_id,revision_id,checkpoint_id,stage,work_id,fingerprint,state,created_at) VALUES ('p1',?,'images-gate','images','images-work',?,'held','2026-09-10T00:02:00.000Z')",
  ).run(f.revisionId, "c".repeat(64));
  // The release calendar reads every schedule, so the row must parse as a real one.
  db.prepare(
    `INSERT INTO schedules(id,name,template_id,template_version,cadence_json,timezone,missed_policy,overlap_policy,items_json,status,version,creation_hash,created_at,updated_at) VALUES (?,'Harbor tales',?,1,'{"kind":"daily","time":"09:00"}','UTC','skip','skip','[]','active',1,'h','2026-09-10T00:00:00.000Z','2026-09-10T00:00:00.000Z')`,
  ).run(scheduleId, templateId);
  db.prepare(
    "INSERT INTO schedule_topics(id,schedule_id,title,state,rank,created_at) VALUES ('t1',?,'The lighthouse keeper','held',1,'2026-09-10T00:03:00.000Z')",
  ).run(scheduleId);
  db.prepare(
    "INSERT INTO stages(id,project_id,kind,source,state,failure_reason,finished_at) VALUES ('video','p1','video','generate','failed',?,'2026-09-10T00:05:00.000Z')",
  ).run(chunkFailure);
  mkdirSync(join(paths.projects, "p1", "video"), { recursive: true });
  writeFileSync(join(paths.projects, "p1", "video", "final.mp4"), "mp4");
  insertOutput(db, {
    id: "o-video",
    projectId: "p1",
    stageKind: "video",
    role: "video",
    path: "video/final.mp4",
    originalFilename: null,
    bytes: 3,
    durationMs: null,
    meta: {},
    createdAt: "2026-09-10T00:05:00.000Z",
  });
  // Released tomorrow at 00:06; the default lead time of 24 hours made it due at 00:06 today.
  db.prepare(
    "INSERT INTO releases(project_id,short,release_at,line,by,set_at) VALUES ('p1',0,'2026-09-11T00:06:00.000Z',NULL,'person','2026-09-10T00:00:00.000Z')",
  ).run();
  db.prepare(
    "INSERT INTO youtube_videos(project_id,short,video_id,recorded_at,upload_state,finish_state,finish_message) VALUES ('p1',1,'abcdefghijk','2026-09-10T00:07:00.000Z','done','failed','The end screen editor did not open.')",
  ).run();
  return f;
}

it("lists every kind of waiting decision oldest first, with what the fixing tools need", () => {
  const f = everything();
  const entries = needsAttention(f.h.deps, now);
  expect(entries.map((entry) => entry.kind)).toEqual([
    "external-review",
    "flagged-verdict",
    "checkpoint",
    "held-topics",
    "failed-step",
    "late-upload",
    "extension-failure",
  ]);
  expect(entries[0]).toMatchObject({
    title: "Saved",
    agentCanAct: true,
    ids: { id: "p1", reviewId: "er1" },
  });
  expect(entries[1]).toMatchObject({
    reason: "The title can't be read at phone size.",
    ids: { id: "p1", verdictId: "v1", baseRevisionId: f.revisionId },
  });
  expect(entries[2]).toMatchObject({
    stage: "images",
    ids: {
      id: "p1",
      checkpointId: "images-gate",
      revisionId: f.revisionId,
      fingerprint: "c".repeat(64),
    },
  });
  expect(entries[3]).toMatchObject({
    projectId: null,
    title: "Harbor tales",
    ids: { id: scheduleId },
  });
  expect(entries[4]).toMatchObject({
    stage: "video",
    reason: chunkFailure,
    autoRetryInFlight: false,
    agentCanAct: true,
    ids: { id: "p1", kind: "video", baseRevisionId: f.revisionId },
  });
  expect(entries[5]).toMatchObject({ agentCanAct: false, ids: { id: "p1", short: "0" } });
  expect(entries[5]?.reason).toContain("Late · upload now");
  expect(entries[6]).toMatchObject({ agentCanAct: false, itemKey: "short:1" });
  expect(entries[6]?.reason).toContain("The end screen editor did not open.");
});

it("marks a failed narration step as in flight while Slopify re-records its chunk", () => {
  const f = everything();
  const { db } = f.h.deps;
  const failed = () => needsAttention(f.h.deps, now).find((entry) => entry.kind === "failed-step");
  db.prepare(
    "INSERT INTO narration_retries(project_id,chunk_key,tries,state,detail,updated_at) VALUES ('p1','narration:5',1,'pending',NULL,'2026-09-10T00:04:00.000Z')",
  ).run();
  expect(failed()).toMatchObject({ autoRetryInFlight: true, agentCanAct: false });
  db.prepare(
    "UPDATE narration_retries SET state='started', updated_at='2026-09-10T00:06:00.000Z'",
  ).run();
  expect(failed()?.autoRetryInFlight).toBe(true);
  db.prepare(
    "UPDATE narration_retries SET tries=2, state='started', updated_at='2026-09-10T00:04:30.000Z'",
  ).run();
  expect(failed()?.autoRetryInFlight).toBe(false);
});

it("marks a flagged verdict whose redo is under way as in flight, and leaves decided ones out", () => {
  const f = everything();
  const { db } = f.h.deps;
  db.prepare("UPDATE review_verdicts SET redo_state='pending' WHERE id='v1'").run();
  expect(
    needsAttention(f.h.deps, now).find((entry) => entry.kind === "flagged-verdict")
      ?.autoRetryInFlight,
  ).toBe(true);
  db.prepare("UPDATE review_verdicts SET redo_state=NULL, action='overruled' WHERE id='v1'").run();
  expect(needsAttention(f.h.deps, now).some((entry) => entry.kind === "flagged-verdict")).toBe(
    false,
  );
});

it("lists a paused run as one an agent may continue, whoever paused it", () => {
  const f = everything();
  f.h.deps.db.prepare("INSERT INTO project_controls(project_id,paused) VALUES ('p1',1)").run();
  expect(needsAttention(f.h.deps, now).find((entry) => entry.kind === "paused-run")).toMatchObject({
    agentCanAct: true,
    ids: { id: "p1", baseRevisionId: f.revisionId },
    tools: ["get_project", "resume_project"],
  });
});

it("leaves out a prepared project's own video checkpoint, a project kept as is, and a trashed one", () => {
  const f = everything();
  const { db } = f.h.deps;
  db.prepare(
    "INSERT INTO review_checkpoints(project_id,revision_id,checkpoint_id,stage,work_id,fingerprint,state,created_at) VALUES ('p1',?,'video-gate','video','images-work',?,'held','2026-09-10T00:02:30.000Z')",
  ).run(f.revisionId, "d".repeat(64));
  db.prepare(
    "INSERT INTO prepared_videos(project_id,schedule_id,title,added_checkpoint,prepared_at) VALUES ('p1',?,'Saved',1,'2026-09-10T00:00:00.000Z')",
  ).run(scheduleId);
  expect(
    needsAttention(f.h.deps, now)
      .filter((entry) => entry.kind === "checkpoint")
      .map((entry) => entry.stage),
  ).toEqual(["images"]);
  db.prepare(
    "INSERT INTO project_set_aside(project_id,revision_id,set_at) VALUES ('p1',?,'t')",
  ).run(f.revisionId);
  expect(needsAttention(f.h.deps, now).map((entry) => entry.kind)).toEqual(["held-topics"]);
  db.prepare("DELETE FROM project_set_aside").run();
  db.prepare("INSERT INTO project_trash VALUES ('p1','2026-09-10T01:00:00.000Z')").run();
  expect(needsAttention(f.h.deps, now).map((entry) => entry.kind)).toEqual(["held-topics"]);
});
