import { afterEach, describe, expect, it } from "vitest";
import type { AssistantTurnAccess } from "../../slices/assistant/access.js";
import { asksOf, consumeGrant, decideAsk, openAsk } from "../../slices/assistant/asks.js";
import type { PricedWork } from "../../slices/assistant/cost.js";
import {
  assistantCostlyTools,
  assistantExcludedTools,
  assistantFreeTools,
  assistantOutwardTools,
  isGated,
} from "../../slices/assistant/gate.js";
import { createTurnTokens } from "../../slices/assistant/tokens.js";
import { draftFixture } from "../../slices/play-drafts/draft.fake.js";
import type { RevisionDeps } from "../../slices/revisions/model.js";
import { assistantBindings } from "../http/actor.js";
import { assistantRouteTools, runAllowedCall } from "./assistant.js";
import { connectAgent, mcpFixture } from "./mcp.fake.js";
import { routeOf } from "./route-tool.js";
import { routeTools } from "./tools.js";
import { designTools } from "./tools-designs.js";
import { templateStudioTools } from "./tools-template-studio.js";

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

function fixture(options: { readonly schedules?: boolean } = {}) {
  const tokens = createTurnTokens();
  const h = mcpFixture({ ...options, assistantTurns: tokens });
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

  it("shows on the card the address, names and numbers the call carries, never a secret", async () => {
    const { h, connect } = fixture();
    const client = await connect();
    await client.callTool({
      name: "set_notification_url",
      arguments: {
        body: { url: "https://ntfy.sh/elsewhere", token: "abc123", idempotencyKey: "k" },
      },
    });
    const [ask] = asksOf(h.deps.db, "s1", h.deps.clock.now());
    expect(ask?.text).toContain("url: “https://ntfy.sh/elsewhere”");
    expect(ask?.text).toContain("token: (hidden)");
    expect(ask?.text).not.toContain("abc123");
    expect(ask?.text).not.toContain("idempotencyKey");
    await client.close();
  });

  it("makes the asked call itself on Allow, once, as the assistant", async () => {
    const { h, connect } = fixture();
    const client = await connect();
    const id = "00000000-0000-4000-8000-000000000003";
    await client.callTool({ name: "create_channel", arguments: { body: { id, name: "Third" } } });
    await client.callTool({ name: "delete_channel", arguments: { id } });
    const [ask] = asksOf(h.deps.db, "s1", h.deps.clock.now());
    const deps = {
      ...h.deps,
      api: async (request: Request) => h.app.request(request, undefined, assistantBindings),
    };
    const call = { sessionId: "s1", tool: "delete_channel", args: { id } };
    expect((await runAllowedCall(deps, call)).text).toContain("already used or has expired");
    expect(decideAsk(h.deps.db, ask?.id ?? "", "allow", h.deps.clock.now()).ok).toBe(true);
    const made = await runAllowedCall(deps, call);
    expect(made.ok).toBe(true);
    expect(h.deps.db.prepare("SELECT count(*) AS n FROM channels WHERE id=?").get(id)).toEqual({
      n: 0,
    });
    expect(
      h.deps.db.prepare("SELECT tool, actor FROM agent_actions ORDER BY rowid DESC LIMIT 1").get(),
    ).toEqual({ tool: "delete_channel", actor: "assistant" });
    expect(await runAllowedCall(deps, call)).toMatchObject({ ok: false });
    expect(
      await runAllowedCall(deps, { sessionId: "s1", tool: "list_channels", args: {} }),
    ).toMatchObject({ ok: false });
    await client.close();
  });

  it("never offers Fill in <site>, only reading and preparing a project's posts", async () => {
    const { connect } = fixture();
    const client = await connect();
    const tools = (await client.listTools()).tools;
    const names = tools.map((tool) => tool.name);
    expect(names).toEqual(expect.arrayContaining(["get_post_packs", "set_post_choice"]));
    expect(names.filter((name) => /fill_post|fill_in|post_now|publish_post/.test(name))).toEqual(
      [],
    );
    const routes = routeTools.filter((tool) => names.includes(tool.name)).map((tool) => tool.route);
    expect(
      routes.filter((route) => route.endsWith("/fill") || route.includes("/social/ext/")),
    ).toEqual([]);
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

  it("reads and changes this computer's render settings freely", () => {
    const tool = (name: string) => {
      const found = assistantRouteTools.find((one) => one.name === name);
      if (found === undefined) throw new Error(`the assistant has no ${name}`);
      return { name, method: routeOf(found).method, confirm: found.confirm };
    };
    // Settings → Production defaults → Rendering: the encoder check runs a tiny local test
    // encode, and the settings change how this computer renders, never what is billed or sent.
    expect(tool("get_video_encoders").method).toBe("GET");
    expect(isGated(tool("get_video_encoders"))).toBe(false);
    expect(assistantFreeTools).toContain("update_settings");
    expect(isGated(tool("update_settings"))).toBe(false);
  });

  it("asks before every paid or removing design step, and reads and prices designs freely", () => {
    const gated = (name: string): boolean => {
      const tool = designTools.find((one) => one.name === name);
      if (tool === undefined) throw new Error(`no design tool ${name}`);
      return isGated({
        name: tool.name,
        method: routeOf(tool).method,
        confirm: tool.confirm,
      });
    };
    const asks = [
      "edit_design_picture",
      "make_design_artwork",
      "make_design_from_template",
      "make_design_template_sample",
      "retry_design_step",
      // A Save with sample "make" draws the editor's paid sample.
      "save_design_template",
      "delete_design",
      "delete_design_template",
      "mark_design_template_ready",
    ];
    const free = [
      "list_designs",
      "create_design",
      "get_design",
      "update_design",
      "quote_design_edit",
      "quote_design_artwork",
      "set_design_version",
      "get_design_picture",
      "get_design_file",
      "list_design_templates",
      "create_design_template",
      "get_design_template",
      "quote_design_template",
    ];
    // Every design tool is classified here, so a new one has to be decided on.
    expect(
      designTools
        .map((tool) => tool.name)
        .filter((name) => name !== "upload_design_picture")
        .toSorted(),
    ).toEqual([...asks, ...free].toSorted());
    for (const name of asks) expect([name, gated(name)]).toEqual([name, true]);
    for (const name of free) expect([name, gated(name)]).toEqual([name, false]);
    // Uploads take files from disk, so the assistant never gets one.
    expect(assistantRouteTools.map((tool) => tool.name)).not.toContain("upload_design_picture");
  });

  it("asks before every paid template studio step and Mark ready, and reads and prices freely", () => {
    const gated = (name: string): boolean => {
      const tool = templateStudioTools.find((one) => one.name === name);
      if (tool === undefined) throw new Error(`no template studio tool ${name}`);
      return isGated({ name: tool.name, method: routeOf(tool).method, confirm: tool.confirm });
    };
    const asks = [
      "save_template_studio",
      "make_template_sample",
      "set_sample_topic",
      "set_sample_full_script",
      "say_it_as",
      "make_samples_for_all",
      // Schedules start running the version marked ready.
      "mark_template_ready",
      // The most the samples may spend in a day.
      "update_template_studio_settings",
      "start_bakeoff",
      "discard_bakeoff",
    ];
    const free = [
      "get_template_studio",
      "get_template_checks",
      "get_prompt_anatomy",
      "quote_template_save",
      "get_sample_pronunciations",
      "quote_say_it_as",
      "get_template_studio_settings",
      "quote_samples_for_all",
      // Made on this computer at no cost.
      "make_template_free_samples",
      "get_template_pack_samples",
      "quote_bakeoff",
      "get_bakeoff",
    ];
    // Every template studio tool is classified here, so a new one has to be decided on.
    expect(
      templateStudioTools
        .map((tool) => tool.name)
        .filter((name) => name !== "import_template_pack")
        .toSorted(),
    ).toEqual([...asks, ...free].toSorted());
    // A pack is a file from disk, so the assistant never gets the import.
    expect(assistantRouteTools.map((tool) => tool.name)).not.toContain("import_template_pack");
    for (const name of asks) expect([name, gated(name)]).toEqual([name, true]);
    for (const name of free) expect([name, gated(name)]).toEqual([name, false]);
  });

  it("has every tool that changes something either ask first or named free", async () => {
    const gateOf = (tool: (typeof routeTools)[number]) => ({
      name: tool.name,
      method: routeOf(tool).method,
      confirm: tool.confirm,
      sends: tool.reachesOut === "sends",
    });
    const free = new Set<string>(assistantFreeTools);
    const unclassified = assistantRouteTools
      .filter((tool) => routeOf(tool).method !== "GET")
      .filter((tool) => !isGated(gateOf(tool)) && !free.has(tool.name))
      .map((tool) => tool.name);
    expect(
      unclassified,
      "Put each in assistantCostlyTools (or another ask-first list) or assistantFreeTools in slices/assistant/gate.ts",
    ).toEqual([]);
    const both = routeTools.filter((tool) => free.has(tool.name) && isGated(gateOf(tool)));
    expect(both.map((tool) => tool.name)).toEqual([]);
    const reaching = assistantRouteTools.filter(
      (tool) => tool.reachesOut !== undefined && routeOf(tool).method !== "GET",
    );
    for (const tool of reaching)
      expect(
        free.has(tool.name) ||
          (assistantOutwardTools as readonly string[]).includes(tool.name) ||
          (assistantCostlyTools as readonly string[]).includes(tool.name) ||
          tool.reachesOut === "sends",
      ).toBe(true);
    // The assistant's own tools beside the route tools only read.
    const { connect } = fixture();
    const client = await connect();
    const route = new Set(assistantRouteTools.map((tool) => tool.name));
    const listed = (await client.listTools()).tools;
    const others = listed.filter((tool) => !route.has(tool.name));
    expect(
      others
        .filter((tool) => tool.annotations?.readOnlyHint !== true && !free.has(tool.name))
        .map((t) => t.name),
    ).toEqual([]);
    const listedNames = new Set(listed.map((tool) => tool.name));
    expect(assistantFreeTools.filter((name) => !listedNames.has(name))).toEqual([]);
    await client.close();
  });

  it("asks before the steps that start paid work, release a run or send out", () => {
    for (const name of [
      "redo_review",
      "change_checkpoints",
      "create_schedule",
      "update_schedule",
      "resume_schedule",
      "restore_from_trash",
      "restore_from_trash_many",
      "score_topics",
      "check_providers",
    ]) {
      const tool = routeTools.find((one) => one.name === name);
      expect(tool, name).toBeDefined();
      if (tool !== undefined)
        expect(isGated({ name, method: routeOf(tool).method, confirm: tool.confirm }), name).toBe(
          true,
        );
    }
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
        arguments: {
          id: h.projectId,
          body: { baseRevisionId: "r", idempotencyKey: crypto.randomUUID() },
          ...(confirmed === undefined ? {} : { confirmed }),
        },
      });
      expect(result.isError).toBe(true);
      expect(textOf(result)).toContain("Waiting for the person: Slopify showed them «Continue");
      expect(textOf(result)).toContain("Slopify makes this resume_project call itself");
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

  it("answers a paid call its route would refuse with the route's reasons, without asking", async () => {
    const { h, connect } = fixture({ schedules: true });
    const client = await connect();
    const listed = await client.listTools();
    const create = listed.tools.find((tool) => tool.name === "create_schedule");
    // The body's real fields are offered, so a model sends days as numbers, not text.
    expect(JSON.stringify(create?.inputSchema)).toContain('"cadence"');
    expect(JSON.stringify(create?.inputSchema)).toContain('"days"');
    const templateId = "00000000-0000-4000-8000-0000000000a1";
    const drafts = draftFixture();
    const { document } = drafts;
    drafts.close();
    const saved = await client.callTool({
      name: "create_template",
      arguments: { body: { id: templateId, name: "Nightly", document } },
    });
    expect(saved.isError).toBeFalsy();
    const body = {
      name: "Nightly",
      templateId,
      templateVersion: 1,
      cadence: { kind: "weekly", time: "20:00", days: "1,3" },
      timezone: "UTC",
    };
    const wrong = await client.callTool({ name: "create_schedule", arguments: { body } });
    expect(wrong.isError).toBe(true);
    expect(textOf(wrong)).toContain("create_schedule was refused: its arguments don't match");
    expect(textOf(wrong)).toContain("id: ");
    expect(textOf(wrong)).toContain("cadence.days: ");
    expect(textOf(wrong)).not.toContain("Waiting for the person");
    expect(asksOf(h.deps.db, "s1", h.deps.clock.now())).toEqual([]);
    const right = {
      ...body,
      id: "00000000-0000-4000-8000-0000000000b1",
      cadence: { kind: "weekly", time: "20:00", days: [1, 3] },
    };
    const asked = await client.callTool({ name: "create_schedule", arguments: { body: right } });
    expect(textOf(asked)).toContain("Waiting for the person");
    expect(textOf(asked)).toContain("cadence.days: Monday, Wednesday");
    expect(textOf(asked)).toContain(
      "It starts active: runs start at the schedule's times and are paid then.",
    );
    expect(textOf(asked)).not.toContain("Slopify can't price it here");
    const [ask] = asksOf(h.deps.db, "s1", h.deps.clock.now());
    expect(decideAsk(h.deps.db, ask?.id ?? "", "allow", h.deps.clock.now()).ok).toBe(true);
    const deps = {
      ...h.deps,
      api: async (request: Request) => h.app.request(request, undefined, assistantBindings),
    };
    const made = await runAllowedCall(deps, {
      sessionId: "s1",
      tool: "create_schedule",
      args: { body: right },
    });
    expect(made).toMatchObject({ ok: true });
    expect(
      h.deps.db.prepare("SELECT count(*) AS n FROM schedules WHERE id=?").get(right.id),
    ).toEqual({ n: 1 });
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
      arguments: {
        id: h.projectId,
        body: {
          previewId: "v1",
          baseRevisionId: "r",
          idempotencyKey: crypto.randomUUID(),
          acknowledgeUnknownCosts: false,
          confirmedProvidedWorkKeys: [],
        },
      },
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
