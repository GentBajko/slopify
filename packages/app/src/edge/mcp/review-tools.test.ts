import { expect, it } from "vitest";
import { layout } from "../../kernel/paths.js";
import { waitingReviewFixture } from "../../slices/reviews/external-repo.fake.js";
import { routeCallDeps } from "./mcp.fake.js";
import { externalReviewMaterial } from "./review-tools.js";

it("says a review that isn't there may belong to a deleted project, and where to look now", () => {
  const { db } = routeCallDeps(async () => new Response(null, { status: 404 }));
  const answer = externalReviewMaterial({ db, paths: layout("/nowhere") }, "p1", "missing");
  expect(answer.isError).toBe(true);
  expect(answer.content).toEqual([
    {
      type: "text",
      text: "This external review doesn't exist: the project may have been deleted. Call needs_attention to see what is waiting now.",
    },
  ]);
});

// What get_external_review says of p1's review "er1" once `close` has run on the database.
function read(close: (db: ReturnType<typeof waitingReviewFixture>["h"]["deps"]["db"]) => void) {
  const f = waitingReviewFixture();
  try {
    close(f.h.deps.db);
    const answer = externalReviewMaterial(
      { db: f.h.deps.db, paths: layout("/nowhere") },
      "p1",
      "er1",
    );
    const [first] = answer.content;
    if (first?.type !== "text") throw new Error("a text answer expected");
    return JSON.parse(first.text) as Record<string, unknown>;
  } finally {
    f.close();
  }
}

it("asks for a verdict only while the review waits", () => {
  const said = read(() => undefined);
  expect(said).toMatchObject({ state: "waiting" });
  expect(said.answer).toContain("Call submit_review_verdict");
  expect(said).not.toHaveProperty("explanation");
});

it("says a canceled run's review waits for nobody and asks for no verdict", () => {
  const said = read((db) => {
    db.prepare("UPDATE stages SET state='canceled' WHERE id='images'").run();
  });
  expect(said).toMatchObject({
    state: "canceled",
    explanation:
      "This review's run was canceled, so nothing waits on it and it takes no verdict: a canceled run's reviews never pass. Call needs_attention to see what is waiting now.",
  });
  expect(said).not.toHaveProperty("answer");
});

it("says a review of a project in the Trash waits for nobody until it is restored", () => {
  const said = read((db) => {
    db.prepare(
      "INSERT INTO project_trash(project_id,deleted_at) VALUES ('p1','2026-09-10T01:00:00.000Z')",
    ).run();
  });
  expect(said).toMatchObject({ state: "trashed" });
  expect(said.explanation).toContain("Restore the project in Settings → Backup & storage → Trash");
  expect(said).not.toHaveProperty("answer");
});

it("says an answered review takes no other verdict", () => {
  const said = read((db) => {
    db.prepare("UPDATE external_reviews SET state='answered' WHERE id='er1'").run();
  });
  expect(said).toMatchObject({ state: "answered" });
  expect(said.explanation).toContain("already answered");
  expect(said).not.toHaveProperty("answer");
});

// Its item made again, the review is replaced at once, before the next settle marks it so.
it("says a review its item was made again for is replaced, while it is still marked waiting", () => {
  const said = read((db) => {
    db.prepare("DELETE FROM revision_work_reservations WHERE work_key='review:image:one'").run();
  });
  expect(said).toMatchObject({
    state: "superseded",
    explanation:
      "This review was replaced: its item was made again or edited, and the new one waits for its own verdict. Call needs_attention to see it.",
  });
  expect(said).not.toHaveProperty("answer");
});

it("says a replaced review takes no verdict and points to the new one", () => {
  const said = read((db) => {
    db.prepare("UPDATE external_reviews SET state='superseded' WHERE id='er1'").run();
  });
  expect(said).toMatchObject({
    state: "superseded",
    explanation:
      "This review was replaced: its item was made again or edited, and the new one waits for its own verdict. Call needs_attention to see it.",
  });
});

it("says a review that passed at its deadline takes no verdict now", () => {
  const said = read((db) => {
    db.prepare("UPDATE external_reviews SET state='auto-passed' WHERE id='er1'").run();
  });
  expect(said).toMatchObject({
    state: "auto-passed",
    explanation:
      "This review passed at its 2-hour deadline with no verdict, so it takes none now. Call needs_attention to see what is waiting now.",
  });
});
