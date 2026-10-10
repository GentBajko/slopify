import { afterEach, expect, it } from "vitest";
import { z } from "zod";
import { callRoute } from "./call-route.js";
import { connectAgent, mcpFixture } from "./mcp.fake.js";
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
  const result = await callRoute({ api }, toolNamed("list_providers"), {});
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
    (await callRoute({ api }, toolNamed("get_studio_settings"), {})).content,
  );
  expect(said).not.toContain("a".repeat(64));
  expect(said).not.toContain("/home/you/.slopify/extension");
  expect(said).toContain("playlists");
});
