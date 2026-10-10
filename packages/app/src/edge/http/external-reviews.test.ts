import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { config, emptyView } from "../../slices/rebuild/recipe-fixture.js";
import { externalReviewById, openExternalReview } from "../../slices/reviews/external.js";
import { insertRevision } from "../../slices/revisions/repo.js";
import { connectAgent, mcpFixture } from "../mcp/mcp.fake.js";

const open: { readonly close: () => void }[] = [];
afterEach(() => {
  for (const fixture of open.splice(0)) fixture.close();
});

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

// p1's current version reserves one image review ("er1") that waits for an agent.
function waiting() {
  const h = mcpFixture();
  open.push(h);
  const { db } = h.deps;
  mkdirSync(join(h.deps.paths.projects, h.projectId, "images"), { recursive: true });
  writeFileSync(join(h.deps.paths.projects, h.projectId, "images", "one.png"), png);
  const view = emptyView(config);
  insertRevision(db, view.revision);
  db.prepare("INSERT INTO project_heads VALUES (?,?)").run(h.projectId, view.revision.id);
  db.prepare(
    "INSERT INTO stages(id,project_id,kind,source,state) VALUES ('images',?,'images','generate','pending')",
  ).run(h.projectId);
  db.prepare(
    "INSERT INTO revision_work(id,project_id,revision_id,stage_id,kind,fingerprint,state,dispatch_state,created_at) VALUES ('w0',?,?,'images','images',?,'pending','held',?)",
  ).run(h.projectId, view.revision.id, "a".repeat(64), h.deps.clock.now().toISOString());
  db.prepare(
    `INSERT INTO revision_work_pieces(id,work_id,work_key,request_fingerprint,fingerprint,input_json,state,dispatch_state) VALUES ('piece0','w0','review:image:one','req','review','{"kind":"local"}','pending','allowed')`,
  ).run();
  db.prepare(
    "INSERT INTO revision_work_reservations(project_id,revision_id,work_key,work_id,piece_id,fingerprint) VALUES (?,?,'review:image:one','w0','piece0','review')",
  ).run(h.projectId, view.revision.id);
  openExternalReview(h.deps.db, {
    id: "er1",
    projectId: h.projectId,
    revisionId: view.revision.id,
    workId: "w0",
    pieceId: "piece0",
    workKey: "review:image:one",
    itemKey: "image:one",
    stage: "images",
    itemFingerprint: "item",
    reviewFingerprint: "review",
    material: {
      request: {
        stage: "images",
        instruction: "Check the hands.",
        sections: [{ label: "Brief the image was drawn from", text: "A lighthouse at dusk." }],
        images: ["the image to review"],
      },
      images: [{ stored: "images/one.png", name: "the image to review" }],
    },
    waitingSince: "2026-09-10T00:00:00.000Z",
    deadlineAt: "2026-09-10T02:00:00.000Z",
  });
  return h;
}

it("refuses a failed verdict with no reason, and the review keeps waiting", async () => {
  const h = waiting();
  const agent = await connectAgent(h.app);
  const refused = await agent.callTool({
    name: "submit_review_verdict",
    arguments: { id: h.projectId, reviewId: "er1", body: { verdict: "fail", reasons: [] } },
  });
  expect(refused.isError).toBe(true);
  expect(JSON.stringify(refused.content)).toContain("a failed verdict names no reason");
  expect(externalReviewById(h.deps.db, h.projectId, "er1")?.state).toBe("waiting");
});

it("saves the agent's verdict, wakes the run, and refuses a second one", async () => {
  const h = waiting();
  const agent = await connectAgent(h.app);
  const saved = await agent.callTool({
    name: "submit_review_verdict",
    arguments: { id: h.projectId, reviewId: "er1", body: { verdict: "pass", reasons: [] } },
  });
  expect(saved.isError).toBeUndefined();
  expect(externalReviewById(h.deps.db, h.projectId, "er1")).toMatchObject({
    state: "answered",
    answeredBy: "agent",
  });
  expect(h.ticks).toContain(h.projectId);
  const again = await agent.callTool({
    name: "submit_review_verdict",
    arguments: {
      id: h.projectId,
      reviewId: "er1",
      body: { verdict: "fail", reasons: ["Too dark."] },
    },
  });
  expect(JSON.stringify(again.content)).toContain("This review was already answered");
});

it("says a run parked on the review is waiting for the agent, on list_projects and get_project", async () => {
  const h = waiting();
  h.deps.db
    .prepare(
      "INSERT INTO stages(id,project_id,kind,source,state) VALUES ('article',?,'article','generate','done')",
    )
    .run(h.projectId);
  const agent = await connectAgent(h.app);
  for (const [name, args] of [
    ["list_projects", {}],
    ["get_project", { id: h.projectId }],
  ] as const) {
    const answer = JSON.stringify((await agent.callTool({ name, arguments: args })).content);
    expect(answer).toContain('\\"stateWord\\":\\"Waiting for the agent\\"');
  }
});

it("reads the review's material with its instruction and its picture as an image", async () => {
  const h = waiting();
  const agent = await connectAgent(h.app);
  const material = await agent.callTool({
    name: "get_external_review",
    arguments: { id: h.projectId, reviewId: "er1" },
  });
  const said = JSON.stringify(material.content);
  expect(said).toContain("Check the hands.");
  expect(said).toContain("A lighthouse at dusk.");
  expect(said).toContain("submit_review_verdict");
  expect(material.content).toContainEqual({
    type: "image",
    data: png.toString("base64"),
    mimeType: "image/png",
  });
});

async function verdictOn(h: ReturnType<typeof waiting>, body: Record<string, unknown>) {
  const agent = await connectAgent(h.app);
  const answer = await agent.callTool({
    name: "submit_review_verdict",
    arguments: { id: h.projectId, reviewId: "er1", body },
  });
  return { refused: answer.isError === true, said: JSON.stringify(answer.content) };
}

it("refuses more than ten reasons, or a reason over 500 characters, and the review keeps waiting", async () => {
  const h = waiting();
  const many = await verdictOn(h, {
    verdict: "fail",
    reasons: Array.from({ length: 11 }, (_, index) => `Problem ${String(index + 1)}.`),
  });
  expect(many.refused).toBe(true);
  expect(many.said).toContain("at most 10 reasons");
  expect(many.said).toContain("The review is still waiting");
  const long = await verdictOn(h, { verdict: "fail", reasons: ["x".repeat(501)] });
  expect(long.refused).toBe(true);
  expect(long.said).toContain("a reason is at most 500 characters");
  expect(externalReviewById(h.deps.db, h.projectId, "er1")?.state).toBe("waiting");
});

it("says a review was replaced when its item was made again before the verdict came", async () => {
  const h = waiting();
  h.deps.db.prepare("DELETE FROM revision_work_reservations WHERE work_id='w0'").run();
  const late = await verdictOn(h, { verdict: "pass", reasons: [] });
  expect(late.refused).toBe(true);
  expect(late.said).toContain("This review was replaced");
  expect(late.said).toContain("needs_attention");
});

it("says a review already passed at its deadline when a verdict comes after", async () => {
  const h = waiting();
  h.deps.db.prepare("UPDATE external_reviews SET state='auto-passed' WHERE id='er1'").run();
  const late = await verdictOn(h, { verdict: "fail", reasons: ["Too dark."] });
  expect(late.refused).toBe(true);
  expect(late.said).toContain("it passed at its 2-hour deadline");
});

it("takes no verdict for a project in the Trash and says how to get it back", async () => {
  const h = waiting();
  h.deps.db
    .prepare(
      "INSERT INTO project_trash(project_id,deleted_at) VALUES (?, '2026-09-10T00:00:00.000Z')",
    )
    .run(h.projectId);
  const trashed = await verdictOn(h, { verdict: "pass", reasons: [] });
  expect(trashed.refused).toBe(true);
  expect(trashed.said).toContain("Settings → Backup & storage → Trash");
  expect(externalReviewById(h.deps.db, h.projectId, "er1")?.state).toBe("waiting");
});

it.each([
  ["a body that isn't JSON", { "content-type": "application/json" }, '{"verdict":"pass",'],
  ["a body sent without saying it is JSON", {}, '{"verdict":"pass","reasons":[]}'],
])(
  "says how to send the verdict again after %s, and the review keeps waiting",
  async (_case, headers, body) => {
    const h = waiting();
    const response = await h.app.request(
      `/api/projects/${h.projectId}/external-reviews/er1/verdict`,
      {
        method: "POST",
        headers,
        body,
      },
    );
    expect(response.status).toBe(400);
    const { detail } = (await response.json()) as { detail: string };
    expect(detail).toMatch(
      /^The verdict wasn't saved: .*JSON.*\. The review is still waiting: send \{verdict/,
    );
    expect(externalReviewById(h.deps.db, h.projectId, "er1")?.state).toBe("waiting");
  },
);
