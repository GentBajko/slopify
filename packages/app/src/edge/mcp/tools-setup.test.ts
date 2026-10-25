import { afterEach, expect, it } from "vitest";
import { z } from "zod";
import { callRoute } from "./call-route.js";
import { connectAgent, mcpFixture, routeCallDeps } from "./mcp.fake.js";
import { routeTools } from "./tools.js";

const open: { readonly close: () => void }[] = [];
afterEach(() => {
  for (const fixture of open.splice(0)) fixture.close();
});

const textOf = (content: unknown): string =>
  z.array(z.object({ type: z.literal("text"), text: z.string() })).parse(content)[0]?.text ?? "";

const toolNamed = (name: string) => {
  const tool = routeTools.find((one) => one.name === name);
  if (tool === undefined) throw new Error(`no tool ${name}`);
  return tool;
};

it("saves a Library prompt through its route, keeping each version in its history", async () => {
  const h = mcpFixture();
  open.push(h);
  const agent = await connectAgent(h.app);
  await agent.callTool({
    name: "create_prompt",
    arguments: { body: { kind: "article", name: "Harbor story", body: "Write about {{topic}}." } },
  });
  const listed = z
    .object({ prompts: z.array(z.object({ id: z.string(), name: z.string() }).loose()) })
    .loose()
    .parse(
      JSON.parse(textOf((await agent.callTool({ name: "list_prompts", arguments: {} })).content)),
    );
  const saved = listed.prompts.find((prompt) => prompt.name === "Harbor story");
  if (saved === undefined) throw new Error("the prompt was not created");
  await agent.callTool({
    name: "update_prompt",
    arguments: {
      id: saved.id,
      body: { kind: "article", name: "Harbor story", body: "Write about {{topic}} at dusk." },
    },
  });
  const history = textOf(
    (await agent.callTool({ name: "prompt_history", arguments: { id: saved.id } })).content,
  );
  expect(history).toContain("Write about {{topic}}.");
  expect(history).toContain("at dusk");
});

it("refuses a prompt the Library would refuse, naming the field", async () => {
  const h = mcpFixture();
  open.push(h);
  const agent = await connectAgent(h.app);
  const refused = await agent.callTool({
    name: "create_prompt",
    arguments: { body: { kind: "article", name: "", body: "Write about the harbor." } },
  });
  expect(refused.isError).toBe(true);
  expect(JSON.stringify(refused.content)).toContain("Enter a name.");
});

it("reports each provider as configured or missing, with nothing about keys or paths", async () => {
  const api = async (): Promise<Response> =>
    Response.json({
      providers: [
        {
          id: "openrouter",
          family: "llm",
          displayName: "OpenRouter",
          readiness: { kind: "keyed", hasKey: true },
        },
        {
          id: "codex",
          family: "llm",
          displayName: "Codex CLI",
          readiness: { kind: "cli", installed: true, issue: "Sign in with codex login." },
          cliPath: { configured: "/opt/tools/codex", command: "codex" },
        },
      ],
    });
  const result = await callRoute(routeCallDeps(api), toolNamed("list_providers"), {});
  expect(result.content).toEqual([
    {
      type: "text",
      text: JSON.stringify({
        providers: [
          { id: "openrouter", family: "llm", displayName: "OpenRouter", state: "configured" },
          { id: "codex", family: "llm", displayName: "Codex CLI", state: "missing" },
        ],
      }),
    },
  ]);
});

it("leaves the pairing token and the unpacked extension folder out of the Studio settings", async () => {
  const api = async (): Promise<Response> =>
    Response.json({
      playlists: [],
      channelPlaylists: {},
      pairing: { token: "a".repeat(64), origin: null },
      autoComment: false,
      unpacked: { folder: "/home/you/.slopify/extension", version: "1.3.3" },
    });
  const said = JSON.stringify(
    (await callRoute(routeCallDeps(api), toolNamed("get_studio_settings"), {})).content,
  );
  expect(said).not.toContain("a".repeat(64));
  expect(said).not.toContain("/home/you/.slopify/extension");
  expect(said).toContain("playlists");
});

it("never shows an agent the Notification URL, only whether one is set", async () => {
  const h = mcpFixture();
  open.push(h);
  const agent = await connectAgent(h.app);
  const secret = "https://ntfy.sh/harbor-7f3a9c2e1b";
  const said: string[] = [];
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const answer = JSON.stringify((await agent.callTool({ name, arguments: args })).content);
    said.push(answer);
    return answer;
  };
  expect(await call("get_notification_url")).toContain("missing");
  await call("set_notification_url", { body: { url: secret } });
  expect(await call("get_notification_url")).toContain("configured");
  await call("get_settings");
  await call("get_diagnostics");
  await call("set_notification_url", { body: { url: `${secret}?x=` } });
  for (const answer of said) expect(answer).not.toContain("harbor-7f3a9c2e1b");
  expect(said.every((answer) => !answer.includes("ntfy.sh"))).toBe(true);
});

it("words a model check's consequence from its estimate, and leaves Automatic checks to the person", () => {
  const tool = toolNamed("check_models");
  expect(tool.reachesOut).toBe("asks");
  expect(tool.confirmFrom?.route).toBe("/api/providers/:id/models/check/estimate");
  expect(
    tool.confirmFrom?.text({ count: 3, totalDollars: 0.04, unpriced: 0, planAccounts: [] }),
  ).toBe("Checks 3 models, one small request each: about $0.04 at list price.");
  expect(
    tool.confirmFrom?.text({ count: 1, totalDollars: 0, unpriced: 0, planAccounts: ["codex"] }),
  ).toBe("Checks 1 model, one small request each: nothing, using the CLI plan's allowance.");
  // Models with no listed price read as a sentence too.
  expect(tool.confirmFrom?.text({ count: 3, totalDollars: 0, unpriced: 3, planAccounts: [] })).toBe(
    "Checks 3 models, one small request each: an unknown amount: 3 models have no listed price.",
  );
  expect(tool.confirmFrom?.text({ nope: true })).toBeUndefined();
  expect(toolNamed("list_models").description).toContain("standings");
  expect(routeTools.some((one) => one.route === "PUT /api/model-checks/auto")).toBe(false);
});
