import { afterEach, expect, it } from "vitest";
import { saveVerdict } from "../../slices/reviews/repo.js";
import { connectAgent, mcpFixture } from "../mcp/mcp.fake.js";

const open: { readonly close: () => void }[] = [];
afterEach(() => {
  for (const fixture of open.splice(0)) fixture.close();
});

it("refuses to overrule or redo a verdict twice, saying it was already decided", async () => {
  const h = mcpFixture();
  open.push(h);
  saveVerdict(h.deps.db, {
    id: "v1",
    projectId: h.projectId,
    revisionId: "r0",
    itemKey: "article:body",
    stage: "article",
    itemFingerprint: "f",
    reviewFingerprint: "g",
    passed: false,
    reasons: ["A section repeats another."],
    outcome: "flagged",
    attempt: 1,
    action: null,
    actionAt: null,
    redoState: null,
    redoError: null,
    answeredBy: "model",
    actionBy: null,
    createdAt: "2026-09-10T00:00:00.000Z",
  });
  const agent = await connectAgent(h.app);
  const first = await agent.callTool({
    name: "overrule_review",
    arguments: { id: h.projectId, verdictId: "v1" },
  });
  expect(first.isError).toBeUndefined();
  const second = await agent.callTool({
    name: "overrule_review",
    arguments: { id: h.projectId, verdictId: "v1" },
  });
  expect(second.isError).toBe(true);
  expect(JSON.stringify(second.content)).toContain("already decided");
  const redo = await agent.callTool({
    name: "redo_review",
    arguments: {
      id: h.projectId,
      verdictId: "v1",
      body: { baseRevisionId: "r0", idempotencyKey: "4f1c2b8e-0d7a-4c3e-9b1a-2e6f5d7c8a90" },
    },
  });
  expect(JSON.stringify(redo.content)).toContain("already decided");
});
