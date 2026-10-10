import { afterEach, expect, it } from "vitest";
import { waitingReviewFixture } from "./external.fake.js";
import { projectHolds } from "./holds.js";

const open: { readonly close: () => void }[] = [];
afterEach(() => {
  for (const fixture of open.splice(0)) fixture.close();
});

// p1 with its image review waiting for an agent.
function fixture() {
  const f = waitingReviewFixture();
  open.push(f);
  const { db } = f.h.deps;
  const gate = (stage: string, approved = false) =>
    db
      .prepare(
        "INSERT INTO review_checkpoints(project_id,revision_id,checkpoint_id,stage,work_id,fingerprint,state,created_at,approved_at) VALUES ('p1',?,?,?,'images-work',?,?,'2026-09-10T00:02:00.000Z',?)",
      )
      .run(
        f.revisionId,
        `${stage}-gate`,
        stage,
        "c".repeat(64),
        approved ? "released" : "held",
        approved ? "2026-09-10T00:03:00.000Z" : null,
      );
  const stage = (kind: string, state: string) =>
    db
      .prepare(
        "INSERT INTO stages(id,project_id,kind,source,state) VALUES (?,'p1',?,'generate',?) ON CONFLICT(id) DO UPDATE SET state=excluded.state",
      )
      .run(kind, kind, state);
  const prepared = (own: boolean) =>
    db
      .prepare(
        "INSERT INTO prepared_videos(project_id,schedule_id,title,added_checkpoint,prepared_at) VALUES ('p1','s1','Saved',?,'2026-09-10T00:00:00.000Z')",
      )
      .run(own ? 1 : 0);
  const answered = () => db.prepare("UPDATE external_reviews SET state='answered'").run();
  return { db, revisionId: f.revisionId, gate, stage, prepared, answered };
}

// Everything but the video is made: the run is held at the video's checkpoint.
function heldAtVideo(f: ReturnType<typeof fixture>) {
  f.answered();
  for (const kind of ["research", "article", "audio", "images"]) f.stage(kind, "done");
  f.stage("video", "pending");
}

it("reads a project held at its video only by its schedule's own hold as prepared", () => {
  const f = fixture();
  heldAtVideo(f);
  f.gate("video");
  f.prepared(true);
  expect([...projectHolds(f.db).prepared]).toEqual(["p1"]);
  expect([...projectHolds(f.db).waitingForAgent]).toEqual([]);
});

it("leaves a template's own Before Video hold to the person", () => {
  const f = fixture();
  heldAtVideo(f);
  f.gate("video");
  f.prepared(false);
  expect([...projectHolds(f.db).prepared]).toEqual([]);
});

it("reads a prepared project held at an earlier checkpoint as waiting for the person", () => {
  const f = fixture();
  f.answered();
  f.stage("images", "pending");
  f.gate("images");
  f.gate("video");
  f.prepared(true);
  expect([...projectHolds(f.db).prepared]).toEqual([]);
  // Approved, the images checkpoint holds nothing: the run waits for its day again.
  f.db
    .prepare("UPDATE review_checkpoints SET state='released',approved_at='x' WHERE stage='images'")
    .run();
  expect([...projectHolds(f.db).prepared]).toEqual(["p1"]);
});

it("reads a run parked on an agent's review as waiting for the agent", () => {
  const f = fixture();
  expect([...projectHolds(f.db).waitingForAgent]).toEqual(["p1"]);
  f.answered();
  expect([...projectHolds(f.db).waitingForAgent]).toEqual([]);
});

it("still waits for the agent while a checkpoint further on has not been reached", () => {
  const f = fixture();
  f.stage("article", "done");
  f.stage("audio", "pending");
  f.gate("video");
  expect([...projectHolds(f.db).waitingForAgent]).toEqual(["p1"]);
});

it("waits for the person, not the agent, once a checkpoint of theirs holds the run", () => {
  const f = fixture();
  f.stage("article", "done");
  f.stage("audio", "pending");
  f.gate("audio");
  expect([...projectHolds(f.db).waitingForAgent]).toEqual([]);
  // A schedule's own hold is not the person's.
  const g = fixture();
  g.prepared(true);
  for (const kind of ["article", "audio"]) g.stage(kind, "done");
  g.gate("video");
  g.db.prepare("UPDATE stages SET state='done' WHERE kind='images'").run();
  expect([...projectHolds(g.db).waitingForAgent]).toEqual(["p1"]);
});

it("reads one project's holds alone, and the stage standings a caller already read", () => {
  const f = fixture();
  expect([...projectHolds(f.db, { projectId: "p1" }).waitingForAgent]).toEqual(["p1"]);
  expect([...projectHolds(f.db, { projectId: "other" }).waitingForAgent]).toEqual([]);
  f.stage("article", "done");
  f.stage("audio", "pending");
  f.gate("audio");
  // The audio's checkpoint isn't reached by the standings the caller passes: no article yet.
  const standings = new Map([
    [
      "p1",
      [
        {
          kind: "article" as const,
          state: "pending" as const,
          progressCurrent: null,
          progressTotal: null,
        },
      ],
    ],
  ]);
  expect([...projectHolds(f.db, { standings }).waitingForAgent]).toEqual(["p1"]);
  expect([...projectHolds(f.db).waitingForAgent]).toEqual([]);
});

it("waits for the person, not the agent, while another step is held for Continue the run", () => {
  const f = fixture();
  // The review's own step, held where it waits, still waits for the agent.
  f.db.prepare("UPDATE revision_work SET dispatch_state='held' WHERE id='images-work'").run();
  expect([...projectHolds(f.db).waitingForAgent]).toEqual(["p1"]);
  // The video's step, held by a restart.
  f.stage("video", "pending");
  f.db
    .prepare(
      "INSERT INTO revision_work(id,project_id,revision_id,stage_id,kind,fingerprint,state,dispatch_state,recipe_context,created_at) VALUES ('video-work','p1',?,'video','video','v','pending','held','{}','2026-09-10T00:00:00.000Z')",
    )
    .run(f.revisionId);
  f.db
    .prepare(
      "INSERT INTO revision_work_reservations(project_id,revision_id,work_key,work_id,fingerprint) VALUES ('p1',?,'export:video','video-work','v')",
    )
    .run(f.revisionId);
  expect([...projectHolds(f.db).waitingForAgent]).toEqual([]);
  expect([...projectHolds(f.db).stopped]).toEqual(["p1"]);
  // A finished stage's leftover step holds nothing.
  f.stage("video", "done");
  expect([...projectHolds(f.db).waitingForAgent]).toEqual(["p1"]);
  expect([...projectHolds(f.db).stopped]).toEqual([]);
});

// What a restart leaves while an agent reviews an image: the review's own step parked, the
// thumbnail's held for Continue the run, and the video's kept allowed behind the template's
// Before Video checkpoint (`recoverCheckpointWork`), which the run hasn't reached.
function stoppedBehindVideoGate() {
  const f = fixture();
  f.db.prepare("UPDATE revision_work SET dispatch_state='held' WHERE id='images-work'").run();
  for (const [kind, state] of [
    ["article", "done"],
    ["audio", "done"],
    ["thumbnail", "pending"],
    ["video", "pending"],
  ] as const)
    f.stage(kind, state);
  const work = (id: string, kind: string, key: string, dispatch: string) => {
    f.db
      .prepare(
        "INSERT INTO revision_work(id,project_id,revision_id,stage_id,kind,fingerprint,state,dispatch_state,recipe_context,created_at) VALUES (?,'p1',?,?,?,?,'pending',?,'{}','2026-09-10T00:00:00.000Z')",
      )
      .run(id, f.revisionId, kind, kind, id.padEnd(64, "0"), dispatch);
    f.db
      .prepare(
        "INSERT INTO revision_work_reservations(project_id,revision_id,work_key,work_id,fingerprint) VALUES ('p1',?,?,?,?)",
      )
      .run(f.revisionId, key, id, key);
  };
  work("video-work", "video", "export:video", "allowed");
  work("thumb-work", "thumbnail", "thumbnail:image", "held");
  f.gate("video");
  return f;
}

it("reads a run a restart stopped as Stopped, though a step behind a checkpoint is allowed", () => {
  const f = stoppedBehindVideoGate();
  const holds = projectHolds(f.db);
  expect([...holds.stopped]).toEqual(["p1"]);
  expect([...holds.waitingForAgent]).toEqual([]);
  expect(holds.holding.get("p1")).toBeUndefined();
  expect([...projectHolds(f.db, { projectId: "p1" }).stopped]).toEqual(["p1"]);
  expect([...projectHolds(f.db, { projectId: "other" }).stopped]).toEqual([]);
});

it("is not Stopped while paused, while a step runs, or while a checkpoint of the person's holds it", () => {
  const f = stoppedBehindVideoGate();
  f.db.prepare("INSERT INTO project_controls(project_id,paused) VALUES ('p1',1)").run();
  expect([...projectHolds(f.db).stopped]).toEqual([]);
  f.db.prepare("UPDATE project_controls SET paused=0").run();
  f.stage("thumbnail", "running");
  expect([...projectHolds(f.db).stopped]).toEqual([]);
  f.stage("thumbnail", "done");
  f.answered();
  f.stage("images", "done");
  // Everything the video needs is made: its checkpoint holds the run for the person.
  expect(
    projectHolds(f.db)
      .holding.get("p1")
      ?.map((hold) => hold.waitsFor),
  ).toEqual(["person"]);
  expect([...projectHolds(f.db).stopped]).toEqual([]);
});

it("reads a prepared project a restart stopped as Stopped, not Prepared", () => {
  const f = stoppedBehindVideoGate();
  f.prepared(true);
  const holds = projectHolds(f.db);
  expect([...holds.stopped]).toEqual(["p1"]);
  expect([...holds.prepared]).toEqual([]);
});

// A saved edit's step waits for the person to choose what to remake, not for Continue the run:
// between two stages, with the next one's admitted step about to start, the run isn't stopped.
it("is not Stopped by a saved edit's step that was never admitted", () => {
  const f = fixture();
  f.answered();
  f.stage("images", "done");
  f.stage("thumbnail", "pending");
  f.stage("video", "pending");
  const work = (id: string, kind: string, dispatch: string, context: string | null) => {
    f.db
      .prepare(
        "INSERT INTO revision_work(id,project_id,revision_id,stage_id,kind,fingerprint,state,dispatch_state,recipe_context,created_at) VALUES (?,'p1',?,?,?,?,'pending',?,?,'2026-09-10T00:00:00.000Z')",
      )
      .run(id, f.revisionId, kind, kind, id.padEnd(64, "0"), dispatch, context);
    f.db
      .prepare(
        "INSERT INTO revision_work_reservations(project_id,revision_id,work_key,work_id,fingerprint) VALUES ('p1',?,?,?,?)",
      )
      .run(f.revisionId, `${kind}:key`, id, kind);
  };
  work("video-work", "video", "allowed", "{}");
  work("thumb-edit", "thumbnail", "held", null);
  expect([...projectHolds(f.db).stopped]).toEqual([]);
  // A restart held the admitted thumbnail step: only Continue the run starts it.
  f.db.prepare("UPDATE revision_work SET recipe_context='{}' WHERE id='thumb-edit'").run();
  expect([...projectHolds(f.db).stopped]).toEqual(["p1"]);
});

// At its day's hold with the thumbnail's step held by a restart: Continue the run moves it on,
// so its day's hold doesn't hold it now and nothing offers to render the video early.
it("holds a prepared run a restart stopped at its day's hold for Continue the run alone", () => {
  const f = stoppedBehindVideoGate();
  f.answered();
  f.stage("images", "done");
  f.prepared(true);
  const holds = projectHolds(f.db);
  expect([...holds.stopped]).toEqual(["p1"]);
  expect([...holds.prepared]).toEqual([]);
  expect(holds.holding.get("p1")).toBeUndefined();
  // Continued, the run waits for its day again.
  f.stage("thumbnail", "done");
  expect(
    projectHolds(f.db)
      .holding.get("p1")
      ?.map((hold) => hold.waitsFor),
  ).toEqual(["day"]);
});

// An uploaded project with nothing admitted reads Done (`uploadedAndSettled`): its leftover
// held steps are nothing to continue.
it("is not Stopped once uploaded with nothing admitted, as it reads Done", () => {
  const f = stoppedBehindVideoGate();
  f.db.prepare("UPDATE revision_work SET dispatch_state='held' WHERE id='video-work'").run();
  expect([...projectHolds(f.db).stopped]).toEqual(["p1"]);
  f.db
    .prepare("INSERT INTO project_uploads(project_id,uploaded_at) VALUES ('p1','2026-09-11')")
    .run();
  expect([...projectHolds(f.db).stopped]).toEqual([]);
  expect([...projectHolds(f.db, { projectId: "p1" }).stopped]).toEqual([]);
});

it("lists the checkpoints holding a run once reached, and whom each waits for", () => {
  const f = fixture();
  f.answered();
  f.stage("article", "pending");
  f.gate("audio");
  f.gate("images");
  f.gate("video");
  f.prepared(true);
  // The article isn't written: the audio's and the video's checkpoints aren't reached.
  const gate = {
    revisionId: f.revisionId,
    fingerprint: "c".repeat(64),
    since: "2026-09-10T00:02:00.000Z",
  };
  expect(projectHolds(f.db).holding.get("p1")).toEqual([
    { checkpointId: "images-gate", stage: "images", waitsFor: "person", ...gate },
  ]);
  heldAtVideo(f);
  f.db
    .prepare("UPDATE review_checkpoints SET state='released',approved_at='x' WHERE stage!='video'")
    .run();
  expect(projectHolds(f.db).holding.get("p1")).toEqual([
    { checkpointId: "video-gate", stage: "video", waitsFor: "day", ...gate },
  ]);
});
