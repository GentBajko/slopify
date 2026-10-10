import { afterEach, expect, it } from "vitest";
import { recordAgentConnection } from "../../slices/agents/connection.js";
import { recordAgentAction } from "../../slices/agents/repo.js";
import { mcpFixture } from "../mcp/mcp.fake.js";

const open: { readonly close: () => void }[] = [];
afterEach(() => {
  for (const fixture of open.splice(0)) fixture.close();
});

it("answers when an agent last connected, or null before the first, and what agents did", async () => {
  const h = mcpFixture();
  open.push(h);
  expect(await (await h.app.request("/api/settings/agents")).json()).toEqual({
    lastConnectedAt: null,
    recent: [],
  });
  recordAgentConnection(h.deps.db, "2026-09-10T08:00:00.000Z");
  recordAgentAction(h.deps.db, {
    id: "a1",
    projectId: h.projectId,
    scheduleId: null,
    tool: "resume_project",
    title: "Continue the run",
    revisionId: null,
    createdAt: "2026-09-10T08:01:00.000Z",
  });
  expect(await (await h.app.request("/api/settings/agents")).json()).toMatchObject({
    lastConnectedAt: "2026-09-10T08:00:00.000Z",
    recent: [{ title: "Continue the run", subject: "Saved" }],
  });
});
