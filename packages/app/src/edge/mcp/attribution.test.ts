import { afterEach, expect, it } from "vitest";
import { agentActionsOf, recentAgentActions } from "../../slices/agents/repo.js";
import type { ReviewRecord } from "../../slices/reviews/model.js";
import { saveVerdict, verdictById } from "../../slices/reviews/repo.js";
import { subjectsOf } from "./attribution.js";
import { connectAgent, mcpFixture } from "./mcp.fake.js";
import type { RouteTool } from "./route-tool.js";

const open: { readonly close: () => void }[] = [];
afterEach(() => {
  for (const fixture of open.splice(0)) fixture.close();
});

const flagged = (id: string, projectId: string): ReviewRecord => ({
  id,
  projectId,
  revisionId: "r0",
  itemKey: `image:${id}`,
  stage: "images",
  itemFingerprint: id,
  reviewFingerprint: `review-${id}`,
  passed: false,
  reasons: ["Stray letters in the sky."],
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

const tool = (route: string): RouteTool => ({ name: "t", route, title: "T", description: "" });

it("names the projects and the schedule a call changed", () => {
  expect(subjectsOf(tool("POST /api/projects/:id/resume"), { id: "p1" }, {})).toEqual({
    projectIds: ["p1"],
    scheduleId: null,
  });
  expect(
    subjectsOf(tool("POST /api/storage/projects/:id/old-versions/delete"), { id: "p2" }, {}),
  ).toEqual({ projectIds: ["p2"], scheduleId: null });
  expect(subjectsOf(tool("PUT /api/studio/releases/:projectId"), { projectId: "p3" }, {})).toEqual({
    projectIds: ["p3"],
    scheduleId: null,
  });
  expect(
    subjectsOf(
      tool("POST /api/projects/move-channel"),
      { body: { projectIds: ["p4", "p5"], channelId: "c" } },
      { moved: 2 },
    ),
  ).toEqual({ projectIds: ["p4", "p5"], scheduleId: null });
  expect(
    subjectsOf(
      tool("POST /api/trash/bulk/delete"),
      {
        body: {
          items: [
            { kind: "project", id: "p6" },
            { kind: "prompt", id: "x" },
          ],
        },
      },
      {},
    ),
  ).toEqual({ projectIds: ["p6"], scheduleId: null });
  expect(subjectsOf(tool("POST /api/schedules/:id/topics/held/approve"), { id: "s1" }, {})).toEqual(
    { projectIds: [], scheduleId: "s1" },
  );
  expect(
    subjectsOf(tool("POST /api/drafts/:id/start"), { id: "d1" }, { projectIds: ["p7"] }),
  ).toEqual({ projectIds: ["p7"], scheduleId: null });
});

it("records an agent's change, to a project or to none, and neither its reads nor its refused calls", async () => {
  const h = mcpFixture();
  open.push(h);
  const agent = await connectAgent(h.app);
  await agent.callTool({ name: "list_projects", arguments: {} });
  await agent.callTool({
    name: "overrule_review",
    arguments: { id: h.projectId, verdictId: "missing" },
  });
  await agent.callTool({
    name: "mark_uploaded",
    arguments: { id: h.projectId, body: { uploaded: true } },
  });
  await agent.callTool({
    name: "set_notification_url",
    arguments: { body: { url: "https://ntfy.sh/lighthouse-runs" } },
  });
  expect(agentActionsOf(h.deps.db, h.projectId).map((one) => [one.tool, one.title])).toEqual([
    ["mark_uploaded", "Mark uploaded"],
  ]);
  expect(recentAgentActions(h.deps.db).map((one) => one.tool)).toEqual([
    "set_notification_url",
    "mark_uploaded",
  ]);
  const history = await h.app.request(`/api/projects/${h.projectId}/revisions`);
  expect(await history.json()).toMatchObject({ agentActions: [{ tool: "mark_uploaded" }] });
});

it("records who overruled a verdict: the agent through MCP, the person through the page", async () => {
  const h = mcpFixture();
  open.push(h);
  saveVerdict(h.deps.db, flagged("one", h.projectId));
  saveVerdict(h.deps.db, flagged("two", h.projectId));
  const agent = await connectAgent(h.app);
  await agent.callTool({
    name: "overrule_review",
    arguments: { id: h.projectId, verdictId: "one" },
  });
  await h.app.request(`/api/projects/${h.projectId}/reviews/two/overrule`, { method: "POST" });
  expect(verdictById(h.deps.db, h.projectId, "one")?.actionBy).toBe("agent");
  expect(verdictById(h.deps.db, h.projectId, "two")?.actionBy).toBe("person");
});
