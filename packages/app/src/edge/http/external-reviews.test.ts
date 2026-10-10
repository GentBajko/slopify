import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { externalReviewById, openExternalReview } from "../../slices/reviews/external.js";
import { connectAgent, mcpFixture } from "../mcp/mcp.fake.js";

const open: { readonly close: () => void }[] = [];
afterEach(() => {
  for (const fixture of open.splice(0)) fixture.close();
});

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

function waiting() {
  const h = mcpFixture();
  open.push(h);
  mkdirSync(join(h.deps.paths.projects, h.projectId, "images"), { recursive: true });
  writeFileSync(join(h.deps.paths.projects, h.projectId, "images", "one.png"), png);
  openExternalReview(h.deps.db, {
    id: "er1",
    projectId: h.projectId,
    revisionId: "r0",
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
