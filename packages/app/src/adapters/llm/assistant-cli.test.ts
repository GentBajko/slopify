import { readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  assistantStream,
  assistantWorkspace,
  claudeAssistantArgs,
  claudeAssistantConfig,
  codexAssistantArgs,
} from "./assistant-cli.js";
import { hardenedCodexBase } from "./codex.js";

function fixture(name: string): readonly string[] {
  return readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8").split("\n");
}

describe("claudeAssistantArgs", () => {
  it("runs Claude Code with no built-in tool, none of the person's setup, and only Slopify's server", () => {
    expect(claudeAssistantArgs({ mcpConfig: "/private/mcp.json", system: "SYSTEM" })).toEqual([
      "-p",
      "--output-format",
      "stream-json",
      "--verbose",
      "--include-partial-messages",
      "--restricted",
      "--setting-sources",
      "",
      "--disable-slash-commands",
      "--no-chrome",
      "--no-session-persistence",
      "--settings",
      '{"disableAllHooks":true,"autoMemoryEnabled":false,"claudeMdExcludes":["**"],"enabledPlugins":{}}',
      "--system-prompt",
      "SYSTEM",
      "--strict-mcp-config",
      "--mcp-config",
      "/private/mcp.json",
      "--tools",
      "",
      "--allowedTools",
      "mcp__slopify",
      "--disallowedTools",
      "WebSearch,WebFetch,Bash",
      "--permission-mode",
      "dontAsk",
    ]);
    expect(claudeAssistantArgs({ mcpConfig: "/c", system: "S", model: "opus" }).slice(-2)).toEqual([
      "--model",
      "opus",
    ]);
  });

  it("names the token's variable in the config, never a token", () => {
    expect(JSON.parse(claudeAssistantConfig("http://127.0.0.1:6969/mcp/assistant"))).toEqual({
      mcpServers: {
        slopify: {
          type: "http",
          url: "http://127.0.0.1:6969/mcp/assistant",
          headers: { Authorization: `Bearer \${SLOPIFY_ASSISTANT_TOKEN}` },
        },
      },
    });
  });
});

describe("codexAssistantArgs", () => {
  it("starts from the content adapter's hardened base, web search off, Slopify's server only", () => {
    const args = codexAssistantArgs({
      directory: "/private/x",
      url: "http://127.0.0.1:6969/mcp/assistant",
      system: "SYSTEM",
    });
    const base = hardenedCodexBase("/private/x");
    expect(args.slice(0, base.length)).toEqual(base);
    expect(args.slice(base.length)).toEqual([
      "-c",
      'instructions="SYSTEM"',
      "-c",
      'web_search="disabled"',
      "-c",
      "tool_output_token_limit=32768",
      "-c",
      'mcp_servers.slopify.url="http://127.0.0.1:6969/mcp/assistant"',
      "-c",
      'mcp_servers.slopify.bearer_token_env_var="SLOPIFY_ASSISTANT_TOKEN"',
      "-c",
      "mcp_servers.slopify.required=true",
      "-c",
      'mcp_servers.slopify.default_tools_approval_mode="auto"',
      "--",
      "-",
    ]);
    expect(args.join(" ")).not.toMatch(/Bearer [A-Za-z0-9]/);
  });
});

describe("assistantWorkspace", () => {
  it("is a private folder with a private config, the token only in the environment", () => {
    const space = assistantWorkspace("http://127.0.0.1:1/mcp/assistant", "secret-token", {
      HOME: "/home/x",
      INIT_CWD: "/home/x/code",
      OLDPWD: "/home/x/old",
    });
    try {
      if (process.platform !== "win32") {
        expect(statSync(space.directory).mode & 0o777).toBe(0o700);
        expect(statSync(space.config).mode & 0o777).toBe(0o600);
      }
      expect(readFileSync(space.config, "utf8")).not.toContain("secret-token");
      expect(space.env.SLOPIFY_ASSISTANT_TOKEN).toBe("secret-token");
      expect(space.env.INIT_CWD).toBeUndefined();
      expect(space.env.OLDPWD).toBeUndefined();
      expect(space.env.PWD).toBe(space.directory);
      expect(space.env.HOME).toBe("/home/x");
    } finally {
      space.remove();
    }
    expect(() => statSync(space.directory)).toThrow();
  });
});

describe("assistantStream", () => {
  it("reads Claude Code's partial text, Slopify tool calls, answer and end", () => {
    const read = assistantStream("claude-code");
    expect(fixture("claude-code-assistant.jsonl").flatMap(read)).toEqual([
      { type: "partial", text: "Let me " },
      { type: "partial", text: "check." },
      { type: "text", text: "Let me check." },
      { type: "tool", name: "list_templates" },
      { type: "text", text: "You have two templates: Weekly and Daily." },
      { type: "done" },
    ]);
  });

  it("stops on any tool from outside Slopify, offered or used", () => {
    const read = assistantStream("claude-code");
    expect(
      read(JSON.stringify({ type: "system", subtype: "init", tools: ["Bash", "mcp__slopify__x"] })),
    ).toEqual([{ type: "foreign", name: "Bash" }]);
    expect(
      read(
        JSON.stringify({
          type: "assistant",
          message: { content: [{ type: "tool_use", name: "WebFetch", input: {} }] },
        }),
      ),
    ).toEqual([{ type: "foreign", name: "WebFetch" }]);
    const codex = assistantStream("codex");
    for (const type of ["command_execution", "file_change", "web_search"])
      expect(codex(JSON.stringify({ type: "item.started", item: { id: "1", type } }))).toEqual([
        { type: "foreign", name: type },
      ]);
    expect(
      codex(
        JSON.stringify({
          type: "item.started",
          item: { id: "1", type: "mcp_tool_call", server: "github", tool: "push" },
        }),
      ),
    ).toEqual([{ type: "foreign", name: "github.push" }]);
  });

  it("says when Claude Code couldn't reach Slopify, or is signed out", () => {
    const read = assistantStream("claude-code");
    expect(
      read(
        JSON.stringify({
          type: "system",
          subtype: "init",
          tools: [],
          mcp_servers: [{ name: "slopify", status: "failed" }],
        }),
      )[0],
    ).toMatchObject({ type: "failed", message: expect.stringContaining("couldn't reach") });
    expect(
      read(
        JSON.stringify({
          type: "result",
          subtype: "success",
          is_error: true,
          result: "Not logged in · Please run /login",
        }),
      )[0],
    ).toMatchObject({ type: "failed", message: expect.stringContaining("claude auth login") });
  });

  it("reads Codex's tool calls, only the new text of a message, the answer and end", () => {
    const read = assistantStream("codex");
    expect(fixture("codex-assistant.jsonl").flatMap(read)).toEqual([
      { type: "tool", name: "list_templates" },
      { type: "partial", text: "You have" },
      { type: "partial", text: " two templates." },
      { type: "text", text: "You have two templates." },
      { type: "done" },
    ]);
    expect(
      read(
        JSON.stringify({
          type: "turn.failed",
          error: { message: "boom sk-ant-123456789012345678901234" },
        }),
      )[0],
    ).toMatchObject({ type: "failed", message: expect.not.stringContaining("sk-ant-1234567890") });
  });

  it("skips lines it can't read", () => {
    expect(assistantStream("codex")("{half")).toEqual([]);
    expect(assistantStream("claude-code")("")).toEqual([]);
  });
});
