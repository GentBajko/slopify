import { afterEach, expect, it } from "vitest";
import { connectAgent, mcpFixture } from "./mcp.fake.js";

const open: { readonly close: () => void }[] = [];
afterEach(() => {
  for (const fixture of open.splice(0)) fixture.close();
});

it("tells a connecting agent the attend routine and offers it as a prompt", async () => {
  const h = mcpFixture();
  open.push(h);
  const agent = await connectAgent(h.app);
  expect(agent.getInstructions()).toContain("needs_attention");
  const prompts = await agent.listPrompts();
  expect(prompts.prompts.map((prompt) => prompt.name)).toContain("attend");
  const routine = JSON.stringify((await agent.getPrompt({ name: "attend" })).messages);
  for (const step of [
    "autoRetryInFlight",
    "agentCanAct",
    "whoever paused it",
    "stopped-run",
    "submit_review_verdict",
    "approve_topics",
    "read_narration_chunks",
    "save_revision",
    "preview_rebuild",
    "start_rebuild",
    "resume_project",
    "confirmed: true",
    "Ready to upload",
    "Settings → Backup & storage",
    "sample project Edit template makes for a template never appears there",
    "get_template_studio",
  ])
    expect(routine).toContain(step);
  const queue = await agent.callTool({ name: "needs_attention", arguments: {} });
  expect(queue.content).toEqual([{ type: "text", text: '{"entries":[]}' }]);
});
