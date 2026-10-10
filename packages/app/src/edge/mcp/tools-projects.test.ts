import { afterEach, expect, it } from "vitest";
import { projectTrashed } from "../../slices/admission/repo.js";
import { writeSampleRecord } from "../../slices/onboarding/state.js";
import { connectAgent, mcpFixture } from "./mcp.fake.js";

const open: { readonly close: () => void }[] = [];
afterEach(() => {
  for (const fixture of open.splice(0)) fixture.close();
});

function withStage() {
  const h = mcpFixture();
  open.push(h);
  h.deps.db
    .prepare(
      "INSERT INTO stages(id,project_id,kind,source,state) VALUES ('s1',?,'article','generate','pending')",
    )
    .run(h.projectId);
  return h;
}

it("says each project's and each step's state in the pages' own words", async () => {
  const h = withStage();
  const agent = await connectAgent(h.app);
  const listed = JSON.stringify(
    (await agent.callTool({ name: "list_projects", arguments: {} })).content,
  );
  expect(listed).toContain('\\"stateWord\\":\\"Queued\\"');
  const read = JSON.stringify(
    (await agent.callTool({ name: "get_project", arguments: { id: h.projectId } })).content,
  );
  expect(read).toContain('\\"stateWord\\":\\"Not started\\"');
});

it("asks before moving a project to the trash, then moves it", async () => {
  const h = withStage();
  const agent = await connectAgent(h.app);
  const asked = await agent.callTool({ name: "trash_project", arguments: { id: h.projectId } });
  expect(asked.isError).toBe(true);
  expect(JSON.stringify(asked.content)).toContain("Settings → Backup & storage → Trash");
  expect(projectTrashed(h.deps.db, h.projectId)).toBe(false);
  const done = await agent.callTool({
    name: "trash_project",
    arguments: { id: h.projectId, confirmed: true },
  });
  expect(done.isError).toBeUndefined();
  expect(projectTrashed(h.deps.db, h.projectId)).toBe(true);
});

it("marks a video uploaded through the same route as Home", async () => {
  const h = withStage();
  const agent = await connectAgent(h.app);
  const marked = await agent.callTool({
    name: "mark_uploaded",
    arguments: { id: h.projectId, body: { uploaded: true } },
  });
  expect(JSON.stringify(marked.content)).toContain("2026-09-10T00:00:00.000Z");
});

it("keeps the sample project read-only for agents, with the page's own sentence", async () => {
  const h = withStage();
  writeSampleRecord(h.deps.db, { projectId: h.projectId, seededAt: "2026-09-10T00:00:00.000Z" });
  const agent = await connectAgent(h.app);
  const refused = await agent.callTool({
    name: "mark_uploaded",
    arguments: { id: h.projectId, body: { uploaded: true } },
  });
  expect(refused.isError).toBe(true);
  expect(JSON.stringify(refused.content)).toContain("Make my own copy");
});

it("answers an unknown project with the route's own sentence", async () => {
  const h = withStage();
  const agent = await connectAgent(h.app);
  const missing = await agent.callTool({ name: "get_project", arguments: { id: "nope" } });
  expect(missing.isError).toBe(true);
  expect(JSON.stringify(missing.content)).toContain("Go back to Projects to pick another.");
});
