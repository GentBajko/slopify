import { afterEach, describe, expect, it } from "vitest";
import type { AssistantTurnAccess } from "../../slices/assistant/access.js";
import { asksOf, consumeGrant, decideAsk, openAsk } from "../../slices/assistant/asks.js";
import type { PricedWork } from "../../slices/assistant/cost.js";
import {
  assistantCostlyTools,
  assistantExcludedTools,
  assistantOutwardTools,
} from "../../slices/assistant/gate.js";
import { createTurnTokens } from "../../slices/assistant/tokens.js";
import type { RevisionDeps } from "../../slices/revisions/model.js";
import { assistantRouteTools } from "./assistant.js";
import { connectAgent, mcpFixture } from "./mcp.fake.js";
import { routeTools } from "./tools.js";

const open: { readonly close: () => void }[] = [];
afterEach(() => {
  for (const fixture of open.splice(0)) fixture.close();
});

function access(deps: RevisionDeps, costs = new Map<string, readonly PricedWork[]>()) {
  const now = deps.clock.now().toISOString();
  deps.db
    .prepare(
      "INSERT OR IGNORE INTO assistant_sessions(id, cli, created_at, updated_at) VALUES ('s1','claude-code',?,?)",
    )
    .run(now, now);
  let n = 0;
  const turn: AssistantTurnAccess = {
    sessionId: "s1",
    turnId: "t1",
    screen: { path: "/projects/p1", projectId: "p1" },
    names: { project: "Saved" },
    ask: (call) =>
      openAsk(deps.db, { id: `k${String(++n)}`, sessionId: "s1", ...call }, deps.clock.now()),
    grant: (call) => consumeGrant(deps.db, { sessionId: "s1", ...call }, deps.clock.now()),
    rememberCost: (id, estimates) => {
      costs.set(id, estimates);
    },
    costOf: (id) => costs.get(id),
  };
  return turn;
}

function fixture() {
  const tokens = createTurnTokens();
  const h = mcpFixture({ assistantTurns: tokens });
  open.push(h);
  const turn = access(h.deps);
  const token = tokens.mint(turn);
  const connect = () => connectAgent(h.app, { authorization: `Bearer ${token}` }, "/mcp/assistant");
  return { h, tokens, token, turn, connect };
}

const initialize = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2025-11-25",
    capabilities: {},
    clientInfo: { name: "test", version: "1" },
  },
};
const headers = {
  "content-type": "application/json",
  accept: "application/json, text/event-stream",
};

function textOf(result: unknown): string {
  return JSON.stringify((result as { content: unknown }).content);
}

describe("/mcp/assistant", () => {
  it("opens for nobody without a running turn's token", async () => {
    const { h, tokens, token } = fixture();
    for (const authorization of [
      undefined,
      "Bearer nope",
      `Bearer ${"x".repeat(43)}`,
      token,
      `Bearer ${token}`,
    ]) {
      const response = await h.app.request("/mcp/assistant", {
        method: "POST",
        headers: { ...headers, ...(authorization === undefined ? {} : { authorization }) },
        body: JSON.stringify(initialize),
      });
      expect(response.status).toBe(authorization === `Bearer ${token}` ? 200 : 401);
    }
    tokens.revoke(token);
    const revoked = await h.app.request("/mcp/assistant", {
      method: "POST",
      headers: { ...headers, authorization: `Bearer ${token}` },
      body: JSON.stringify(initialize),
    });
    expect(revoked.status).toBe(401);
    expect(await revoked.text()).toContain("only a running assistant turn's token opens it");
  });

  it("is refused from a web page at another address", async () => {
    const { h, token } = fixture();
    const response = await h.app.request("/mcp/assistant", {
      method: "POST",
      headers: { ...headers, authorization: `Bearer ${token}`, origin: "http://evil.example" },
      body: JSON.stringify(initialize),
    });
    expect(response.status).toBe(403);
  });

  it("offers Slopify's tools minus the excluded ones, plus the guide and the screen", async () => {
    const { connect } = fixture();
    const client = await connect();
    const listed = await client.listTools();
    const names = listed.tools.map((tool) => tool.name);
    for (const name of assistantExcludedTools) expect(names).not.toContain(name);
    for (const tool of routeTools.filter((one) => one.upload !== undefined))
      expect(names).not.toContain(tool.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "list_templates",
        "needs_attention",
        "list_project_files",
        "search_wiki",
        "read_wiki",
        "current_screen",
      ]),
    );
    const resume = listed.tools.find((tool) => tool.name === "resume_project");
    expect(JSON.stringify(resume?.inputSchema)).toContain("confirmed");
    expect(client.getInstructions()).toContain("by assistant");
    await client.close();
  });

  it("asks before pointing notifications at another address", async () => {
    const { h, connect } = fixture();
    const client = await connect();
    const result = await client.callTool({
      name: "set_notification_url",
      arguments: { body: { url: "https://ntfy.sh/elsewhere" } },
    });
    expect(textOf(result)).toContain("an address outside Slopify");
    expect(asksOf(h.deps.db, "s1", h.deps.clock.now())).toHaveLength(1);
    await client.close();
  });

  it("asks before checking models, which costs money, and reads keywords and model checks freely", async () => {
    const { h, connect } = fixture();
    expect(assistantCostlyTools).toContain("check_models");
    const client = await connect();
    const names = (await client.listTools()).tools.map((tool) => tool.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "check_models",
        "estimate_model_checks",
        "get_model_checks",
        "list_keywords",
        "get_keyword_facts",
      ]),
    );
    const check = await client.callTool({
      name: "check_models",
      arguments: { id: "openai", confirmed: true, body: { confirmedDollars: 5 } },
    });
    expect(check.isError).toBe(true);
    expect(textOf(check)).toContain("Waiting for the person");
    expect(asksOf(h.deps.db, "s1", h.deps.clock.now())).toHaveLength(1);
    const keywords = await client.callTool({ name: "list_keywords", arguments: {} });
    expect(textOf(keywords)).not.toContain("Waiting for the person");
    expect(textOf(keywords)).toContain("Slopify_");
    expect(asksOf(h.deps.db, "s1", h.deps.clock.now())).toHaveLength(1);
    await client.close();
  });

  it("names only tools that exist", () => {
    const names = new Set(routeTools.map((tool) => tool.name));
    expect(assistantCostlyTools.filter((name) => !names.has(name))).toEqual([]);
    expect(assistantOutwardTools.filter((name) => !names.has(name))).toEqual([]);
    expect(
      [...assistantExcludedTools].filter(
        (name) =>
          !names.has(name) &&
          !["get_external_review", "import_library", "export_library"].includes(name),
      ),
    ).toEqual([]);
    expect(assistantRouteTools.length).toBeLessThan(routeTools.length);
  });

  it("asks the person before paid work, even when the model says confirmed", async () => {
    const { h, connect } = fixture();
    const client = await connect();
    for (const confirmed of [undefined, true]) {
      const result = await client.callTool({
        name: "resume_project",
        arguments: { id: h.projectId, ...(confirmed === undefined ? {} : { confirmed }) },
      });
      expect(result.isError).toBe(true);
      expect(textOf(result)).toContain("Waiting for the person: Slopify showed them «Continue");
      expect(textOf(result)).toContain("call resume_project again with confirmed: true");
    }
    expect(h.ticks).toEqual([]);
    const asks = asksOf(h.deps.db, "s1", h.deps.clock.now());
    expect(asks).toHaveLength(1);
    expect(asks[0]?.text).toContain("for “Saved”");
    expect(asks[0]?.text).toContain("Slopify can't price it here.");
    expect(h.deps.db.prepare("SELECT count(*) AS n FROM agent_actions").get()).toEqual({ n: 0 });
    await client.close();
  });

  it("goes ahead once after Allow, records it as the assistant's, and asks again next time", async () => {
    const { h, connect } = fixture();
    const client = await connect();
    const made = await client.callTool({
      name: "create_channel",
      arguments: { body: { id: "00000000-0000-4000-8000-000000000002", name: "Second" } },
    });
    expect(made.isError).toBeFalsy();
    const id = "00000000-0000-4000-8000-000000000002";
    const asked = await client.callTool({ name: "delete_channel", arguments: { id } });
    expect(textOf(asked)).toContain("It is deleted permanently");
    const [ask] = asksOf(h.deps.db, "s1", h.deps.clock.now());
    expect(decideAsk(h.deps.db, ask?.id ?? "", "allow", h.deps.clock.now()).ok).toBe(true);
    const unconfirmed = await client.callTool({ name: "delete_channel", arguments: { id } });
    expect(textOf(unconfirmed)).toContain("Waiting for the person");
    const deleted = await client.callTool({
      name: "delete_channel",
      arguments: { id, confirmed: true },
    });
    expect(deleted.isError).toBeFalsy();
    expect(h.deps.db.prepare("SELECT tool, actor FROM agent_actions ORDER BY rowid").all()).toEqual(
      [
        { tool: "create_channel", actor: "assistant" },
        { tool: "delete_channel", actor: "assistant" },
      ],
    );
    const again = await client.callTool({
      name: "delete_channel",
      arguments: { id, confirmed: true },
    });
    expect(textOf(again)).toContain("Waiting for the person");
    await client.close();
  });

  it("puts the estimate the preview showed on the start card", async () => {
    const tokens = createTurnTokens();
    const h = mcpFixture({ assistantTurns: tokens });
    open.push(h);
    const turn = access(
      h.deps,
      new Map([["v1", [{ low: 0.4, high: 0.85, unknown: 1, apiLow: undefined }]]]),
    );
    const token = tokens.mint(turn);
    const client = await connectAgent(
      h.app,
      { authorization: `Bearer ${token}` },
      "/mcp/assistant",
    );
    const result = await client.callTool({
      name: "start_rebuild",
      arguments: { id: h.projectId, body: { previewId: "v1", baseRevisionId: "r" } },
    });
    expect(textOf(result)).toContain(
      "Start a remake for “Saved”. This starts paid work: estimated at $0.40–$0.85; 1 step has no price in the catalogue.",
    );
    await client.close();
  });

  it("reads the guide and the screen", async () => {
    const { connect } = fixture();
    const client = await connect();
    const screen = await client.callTool({ name: "current_screen", arguments: {} });
    expect(textOf(screen)).toContain("Project: “Saved” (id p1)");
    const found = await client.callTool({ name: "search_wiki", arguments: { query: "schedule" } });
    expect(found.isError).toBeFalsy();
    expect(textOf(found)).toContain("hits");
    const page = await client.callTool({ name: "read_wiki", arguments: { page: "Schedules" } });
    expect(page.isError).toBeFalsy();
    const missing = await client.callTool({ name: "read_wiki", arguments: { page: "Nope" } });
    expect(textOf(missing)).toContain("Call search_wiki");
    await client.close();
  });
});

describe("/mcp", () => {
  it("still records an agent's change as the agent's and has no ask step", async () => {
    const { h } = fixture();
    const agent = await connectAgent(h.app);
    const names = (await agent.listTools()).tools.map((tool) => tool.name);
    expect(names).not.toContain("search_wiki");
    expect(names).toContain("submit_review_verdict");
    await agent.callTool({
      name: "create_channel",
      arguments: { body: { id: "00000000-0000-4000-8000-000000000003", name: "Agent's" } },
    });
    expect(h.deps.db.prepare("SELECT tool, actor FROM agent_actions").all()).toEqual([
      { tool: "create_channel", actor: "agent" },
    ]);
    const resume = await agent.callTool({ name: "resume_project", arguments: { id: h.projectId } });
    expect(textOf(resume)).not.toContain("Waiting for the person");
    await agent.close();
  });
});
