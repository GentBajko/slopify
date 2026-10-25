import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import type { LogFields } from "../../kernel/log.js";
import { addUnreadableReview, waitingReviewFixture } from "../reviews/external-repo.fake.js";
import { saveVerdict } from "../reviews/repo.js";
import { insertOutput } from "../storage/repo.js";
import { type AttentionDeps, needsAttention } from "./attention.js";

const open: { readonly close: () => void }[] = [];
afterEach(() => {
  for (const fixture of open.splice(0)) fixture.close();
});

const now = new Date("2026-09-10T12:00:00.000Z");
const quiet = { write: () => undefined };

// The fixture's deps with what needs_attention logs collected.
function logged(f: { readonly h: { readonly deps: Omit<AttentionDeps, "log"> } }) {
  const lines: { event: string; fields: LogFields | undefined }[] = [];
  const deps: AttentionDeps = {
    db: f.h.deps.db,
    paths: f.h.deps.paths,
    log: { write: (_level, event, fields) => lines.push({ event, fields }) },
  };
  return { deps, lines };
}
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
  const entries = needsAttention({ ...f.h.deps, log: quiet }, now);
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
  const failed = () =>
    needsAttention({ ...f.h.deps, log: quiet }, now).find((entry) => entry.kind === "failed-step");
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
    needsAttention({ ...f.h.deps, log: quiet }, now).find(
      (entry) => entry.kind === "flagged-verdict",
    )?.autoRetryInFlight,
  ).toBe(true);
  db.prepare("UPDATE review_verdicts SET redo_state=NULL, action='overruled' WHERE id='v1'").run();
  expect(
    needsAttention({ ...f.h.deps, log: quiet }, now).some(
      (entry) => entry.kind === "flagged-verdict",
    ),
  ).toBe(false);
});

it("lists a paused run as one an agent may continue, whoever paused it", () => {
  const f = everything();
  f.h.deps.db.prepare("INSERT INTO project_controls(project_id,paused) VALUES ('p1',1)").run();
  expect(
    needsAttention({ ...f.h.deps, log: quiet }, now).find((entry) => entry.kind === "paused-run"),
  ).toMatchObject({
    agentCanAct: true,
    ids: { id: "p1", baseRevisionId: f.revisionId },
    tools: ["get_project", "resume_project"],
  });
});

// A restart held its images' step and nothing else moves it on: like a paused run, the agent
// may continue it.
it("lists a stopped run as one an agent may continue", () => {
  const f = waitingReviewFixture();
  open.push(f);
  const { db } = f.h.deps;
  const stopped = () =>
    needsAttention({ ...f.h.deps, log: quiet }, now).filter(
      (entry) => entry.kind === "stopped-run",
    );
  // Parked on the agent's review, it waits for the agent, not for Continue the run.
  expect(stopped()).toEqual([]);
  db.prepare("UPDATE external_reviews SET state='answered'").run();
  db.prepare("UPDATE revision_work SET dispatch_state='held'").run();
  expect(stopped()).toEqual([
    expect.objectContaining({
      projectId: "p1",
      title: "Saved",
      agentCanAct: true,
      autoRetryInFlight: false,
      ids: { id: "p1", baseRevisionId: f.revisionId },
      tools: ["get_project", "resume_project"],
    }),
  ]);
  expect(stopped()[0]?.reason).toContain("resume_project");
  // In the Trash, nothing is asked of anyone.
  db.prepare("INSERT INTO project_trash VALUES ('p1','2026-09-10T01:00:00.000Z')").run();
  expect(stopped()).toEqual([]);
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
    needsAttention({ ...f.h.deps, log: quiet }, now)
      .filter((entry) => entry.kind === "checkpoint")
      .map((entry) => entry.stage),
  ).toEqual(["images"]);
  // A Before Video hold the template had itself is the person's to approve, prepared or not,
  // once everything the video needs is made.
  db.prepare("UPDATE prepared_videos SET added_checkpoint=0").run();
  db.prepare("UPDATE stages SET state='done' WHERE project_id='p1' AND kind='images'").run();
  expect(
    needsAttention({ ...f.h.deps, log: quiet }, now)
      .filter((entry) => entry.kind === "checkpoint")
      .map((entry) => entry.stage),
  ).toEqual(["images", "video"]);
  db.prepare("UPDATE prepared_videos SET added_checkpoint=1").run();
  db.prepare(
    "INSERT INTO project_set_aside(project_id,revision_id,set_at) VALUES ('p1',?,'t')",
  ).run(f.revisionId);
  expect(needsAttention({ ...f.h.deps, log: quiet }, now).map((entry) => entry.kind)).toEqual([
    "held-topics",
  ]);
  db.prepare("DELETE FROM project_set_aside").run();
  db.prepare("INSERT INTO project_trash VALUES ('p1','2026-09-10T01:00:00.000Z')").run();
  expect(needsAttention({ ...f.h.deps, log: quiet }, now).map((entry) => entry.kind)).toEqual([
    "held-topics",
  ]);
});

// The usual prepared project: everything but the video made, held at its schedule's own Before
// Video hold, which waits for its day, not for anyone.
it("leaves out a prepared project held at its day's hold, and lists the template's own", () => {
  const f = waitingReviewFixture();
  open.push(f);
  const { db } = f.h.deps;
  db.prepare("UPDATE external_reviews SET state='answered'").run();
  for (const kind of ["article", "audio"])
    db.prepare(
      "INSERT INTO stages(id,project_id,kind,source,state) VALUES (?,'p1',?,'generate','done')",
    ).run(kind, kind);
  db.prepare("UPDATE stages SET state='done' WHERE kind='images'").run();
  db.prepare(
    "INSERT INTO stages(id,project_id,kind,source,state) VALUES ('video','p1','video','generate','pending')",
  ).run();
  db.prepare(
    "INSERT INTO review_checkpoints(project_id,revision_id,checkpoint_id,stage,work_id,fingerprint,state,created_at) VALUES ('p1',?,'video-gate','video','images-work',?,'held','2026-09-10T00:02:00.000Z')",
  ).run(f.revisionId, "c".repeat(64));
  db.prepare(
    "INSERT INTO prepared_videos(project_id,schedule_id,title,added_checkpoint,prepared_at) VALUES ('p1','s1','Saved',1,'2026-09-10T00:00:00.000Z')",
  ).run();
  const checkpoints = () =>
    needsAttention({ ...f.h.deps, log: quiet }, now).filter((entry) => entry.kind === "checkpoint");
  expect(checkpoints()).toEqual([]);
  // Its template's own Before Video hold instead: the person's, and listed.
  db.prepare("UPDATE prepared_videos SET added_checkpoint=0").run();
  expect(checkpoints().map((entry) => entry.stage)).toEqual(["video"]);
});

it("lists a checkpoint only once the run reaches it", () => {
  const f = everything();
  const { db } = f.h.deps;
  // The audio's checkpoint waits for an article that isn't written yet.
  db.prepare(
    "INSERT INTO stages(id,project_id,kind,source,state) VALUES ('article','p1','article','generate','pending')",
  ).run();
  db.prepare(
    "INSERT INTO review_checkpoints(project_id,revision_id,checkpoint_id,stage,work_id,fingerprint,state,created_at) VALUES ('p1',?,'audio-gate','audio','images-work',?,'held','2026-09-10T00:02:30.000Z')",
  ).run(f.revisionId, "e".repeat(64));
  const checkpoints = () =>
    needsAttention({ ...f.h.deps, log: quiet }, now)
      .filter((entry) => entry.kind === "checkpoint")
      .map((entry) => entry.stage);
  expect(checkpoints()).toEqual(["images"]);
  db.prepare("UPDATE stages SET state='done' WHERE kind='article'").run();
  expect(checkpoints()).toEqual(["images", "audio"]);
});

it("still lists the rest when one source fails, and says in the log which one", () => {
  const f = everything();
  const { deps, lines } = logged(f);
  // A schedule the release calendar can't read makes the late-uploads source throw.
  f.h.deps.db
    .prepare(
      `INSERT INTO schedules(id,name,template_id,template_version,cadence_json,timezone,missed_policy,overlap_policy,items_json,status,version,creation_hash,created_at,updated_at) VALUES ('broken','Broken',?,1,'{"kind":"never"}','UTC','skip','skip','[]','active',1,'h2','2026-09-10T00:00:00.000Z','2026-09-10T00:00:00.000Z')`,
    )
    .run(templateId);
  const kinds = needsAttention(deps, now).map((entry) => entry.kind);
  expect(kinds).not.toContain("late-upload");
  expect(kinds).toEqual(
    expect.arrayContaining(["external-review", "flagged-verdict", "checkpoint"]),
  );
  expect(lines).toEqual([
    {
      event: "attention.source",
      fields: { detail: expect.stringContaining("late uploads") },
    },
  ]);
});

it("skips a row it can't read, logs it, and lists the others", () => {
  const f = everything();
  const { deps, lines } = logged(f);
  f.h.deps.db.prepare("UPDATE review_verdicts SET reasons='not json' WHERE id='v1'").run();
  const kinds = needsAttention(deps, now).map((entry) => entry.kind);
  expect(kinds).not.toContain("flagged-verdict");
  expect(kinds).toContain("external-review");
  expect(lines).toEqual([
    {
      event: "attention.row",
      fields: { projectId: "p1", detail: expect.stringContaining("flagged verdicts") },
    },
  ]);
});

it("lists the other checkpoints when one can't be read, and logs that one", () => {
  const f = everything();
  const { db } = f.h.deps;
  db.exec("PRAGMA ignore_check_constraints=ON");
  db.prepare(
    "INSERT INTO review_checkpoints(project_id,revision_id,checkpoint_id,stage,work_id,fingerprint,state,created_at) VALUES ('p1',?,'odd-gate','sound','images-work',?,'held','2026-09-10T00:02:30.000Z')",
  ).run(f.revisionId, "e".repeat(64));
  db.exec("PRAGMA ignore_check_constraints=OFF");
  const { deps, lines } = logged(f);
  expect(
    needsAttention(deps, now)
      .filter((entry) => entry.kind === "checkpoint")
      .map((entry) => entry.ids.checkpointId),
  ).toEqual(["images-gate"]);
  expect(lines).toEqual([
    {
      event: "attention.row",
      fields: { projectId: "p1", detail: expect.stringContaining("review checkpoints") },
    },
  ]);
});

it("gives a failed redo's error as the reason, and lists only each item's latest verdict", () => {
  const f = everything();
  const { db } = f.h.deps;
  const flagged = () =>
    needsAttention({ ...f.h.deps, log: quiet }, now).filter(
      (entry) => entry.kind === "flagged-verdict",
    );
  const redoError =
    "Slopify couldn't make this item again automatically: the image provider has no key. Fix that in Settings → Keys & services, then use Redo beside it.";
  db.prepare("UPDATE review_verdicts SET redo_state='failed', redo_error=? WHERE id='v1'").run(
    redoError,
  );
  expect(flagged()).toMatchObject([{ reason: redoError, agentCanAct: true }]);
  const later = (id: string, passed: boolean, at: string) =>
    saveVerdict(db, {
      id,
      projectId: "p1",
      revisionId: f.revisionId,
      itemKey: "thumbnail:image",
      stage: "thumbnail",
      itemFingerprint: `thumb-${id}`,
      reviewFingerprint: `thumb-review-${id}`,
      passed,
      reasons: passed ? [] : ["The face is cut off."],
      outcome: passed ? "passed" : "flagged",
      attempt: 1,
      action: null,
      actionAt: null,
      redoState: null,
      redoError: null,
      answeredBy: "model",
      actionBy: null,
      createdAt: at,
    });
  later("v2", false, "2026-09-10T00:10:00.000Z");
  expect(flagged().map((entry) => [entry.ids.verdictId, entry.reason])).toEqual([
    ["v2", "The face is cut off."],
  ]);
  later("v3", true, "2026-09-10T00:20:00.000Z");
  expect(flagged()).toEqual([]);
});

it("lists the pinned comment's and the A/B test's failures on their own", () => {
  const f = everything();
  f.h.deps.db
    .prepare(
      "UPDATE youtube_videos SET finish_state='done', comment_state='failed', comment_message='The comment box was missing.', ab_state='failed', ab_message=NULL, ab_at='2026-09-10T00:08:00.000Z'",
    )
    .run();
  const failures = needsAttention({ ...f.h.deps, log: quiet }, now).filter(
    (entry) => entry.kind === "extension-failure",
  );
  expect(failures.map((entry) => [entry.since, entry.reason])).toEqual([
    [
      "2026-09-10T00:07:00.000Z",
      "The pinned comment failed: The comment box was missing. Fixing it is the extension's or the person's: report it.",
    ],
    [
      "2026-09-10T00:08:00.000Z",
      "The A/B test failed: the extension gave no reason. Fixing it is the extension's or the person's: report it.",
    ],
  ]);
});

it("marks a video step whose shorts pick stopped as in flight while its chunk is re-recorded, but not another stage", () => {
  const f = everything();
  const { db } = f.h.deps;
  const pickStopped =
    "The shorts pick stopped: subtitles stopped matching the audio in narration chunk 2 of 4. Regenerate narration chunk 2 in Edit project → Narration, then Continue the run.";
  db.prepare("UPDATE stages SET failure_reason=? WHERE id='video'").run(pickStopped);
  db.prepare(
    "UPDATE stages SET state='failed', failure_reason='The image provider refused.', finished_at='2026-09-10T00:05:00.000Z' WHERE id='images'",
  ).run();
  db.prepare(
    "INSERT INTO narration_retries(project_id,chunk_key,tries,state,detail,updated_at) VALUES ('p1','narration:2',1,'started',NULL,'2026-09-10T00:06:00.000Z')",
  ).run();
  const failed = needsAttention({ ...f.h.deps, log: quiet }, now).filter(
    (entry) => entry.kind === "failed-step",
  );
  expect(failed.map((entry) => [entry.stage, entry.reason, entry.autoRetryInFlight])).toEqual(
    expect.arrayContaining([
      ["video", pickStopped, true],
      ["images", "The image provider refused.", false],
    ]),
  );
});

it("lists the other waiting reviews when one can't be read back, and logs that one", () => {
  const f = everything();
  addUnreadableReview(f);
  const { deps, lines } = logged(f);
  expect(
    needsAttention(deps, now)
      .filter((entry) => entry.kind === "external-review")
      .map((entry) => entry.ids.reviewId),
  ).toEqual(["er1"]);
  expect(lines).toEqual([
    {
      event: "attention.row",
      fields: { projectId: "p1", detail: expect.stringContaining("external reviews") },
    },
  ]);
});

// A template's studio sample is made on a hidden project: its failures and checkpoints show in
// the studio, never here.
it("leaves out every entry of a template studio's hidden sample project", () => {
  const f = everything();
  const { db } = f.h.deps;
  const before = needsAttention({ ...f.h.deps, log: quiet }, now).map((entry) => entry.kind);
  expect(before).toContain("failed-step");
  db.prepare(
    "INSERT INTO project_templates(id,head_version,creation_hash,created_at) VALUES (?,1,'h','t')",
  ).run(templateId);
  db.prepare(
    "INSERT INTO template_samples(template_id,project_id,topic,topic_source,full_script,created_at) VALUES (?,'p1','The history of the lighthouse','fixed',0,'t')",
  ).run(templateId);
  expect(needsAttention({ ...f.h.deps, log: quiet }, now).map((entry) => entry.kind)).toEqual([
    "held-topics",
  ]);
});

it("reports an active schedule whose template has no version it may run, for the person to fix", () => {
  const f = everything();
  const sentence =
    "Not started: Harbor template has no version approved for schedules. Open it in Templates → Edit template and choose More → Approve for schedules.";
  const entries = needsAttention(
    { ...f.h.deps, log: quiet, notReady: (id) => (id === templateId ? sentence : undefined) },
    now,
  );
  expect(entries.filter((entry) => entry.kind === "template-not-ready")).toEqual([
    {
      kind: "template-not-ready",
      since: now.toISOString(),
      projectId: null,
      title: "Harbor tales",
      stage: null,
      itemKey: null,
      reason: `${sentence} Marking a version ready is the person's: report it.`,
      autoRetryInFlight: false,
      agentCanAct: false,
      ids: { id: scheduleId, templateId },
      tools: ["get_schedule", "get_template_checks"],
    },
  ]);
  f.h.deps.db.prepare("UPDATE schedules SET status='paused' WHERE id=?").run(scheduleId);
  const paused = needsAttention({ ...f.h.deps, log: quiet, notReady: () => sentence }, now);
  expect(paused.some((entry) => entry.kind === "template-not-ready")).toBe(false);
});
