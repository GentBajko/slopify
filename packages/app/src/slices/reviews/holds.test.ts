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
  return { db, gate, stage, prepared, answered };
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
