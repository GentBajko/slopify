import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { redact } from "../../kernel/log.js";
import type {
  AssistantCliTurn,
  AssistantStreamEvent,
  RunAssistantCli,
} from "../../kernel/ports/assistant-cli.js";
import { cliName } from "../explain.js";
import { cliLoginError } from "./cli-login-error.js";
import { codexBinary, hardenedCodexBase } from "./codex.js";
import type { CliEnded, CliRun, RunCli } from "./run-cli.js";
import { cliInput, endedWithout, stopCliRun, stuckCli } from "./run-cli.js";
import { lines } from "./sse-lines.js";

// The in-app assistant's CLI turn: Claude Code or Codex with no tool of its own (no shell, no
// files, no web), none of the person's settings, hooks, plugins, skills, memory or MCP
// servers, and one MCP server: Slopify's `/mcp/assistant`, opened with the turn's token.
//
// The token is never an argument: argv is readable by every process on the computer. It is in
// the CLI's environment only, and the CLIs put it in the header themselves:
// - Claude Code 2.1.302 expands ${VAR} in an --mcp-config file's headers (checked on this
//   machine: a stand-in server saw "Bearer <the token>" from `"Bearer
//   ${SLOPIFY_ASSISTANT_TOKEN}"`). The file names the variable, not the token.
// - Codex 0.155.1 reads `mcp_servers.<name>.bearer_token_env_var` (codex-rs config
//   `McpServerTransportConfig::StreamableHttp`; also checked: the server saw the bearer).

export const assistantServerName = "slopify";
export const assistantTokenVariable = "SLOPIFY_ASSISTANT_TOKEN";
const slopifyTool = `mcp__${assistantServerName}__`;

export function claudeAssistantArgs(options: {
  readonly mcpConfig: string;
  readonly system: string;
  readonly model?: string | undefined;
}): string[] {
  return [
    "-p",
    "--output-format",
    "stream-json",
    "--verbose",
    "--include-partial-messages",
    // `claude --help` 2.1.302: --restricted drops the code-running tools and WebFetch and
    // ignores the user, project and local settings files; --setting-sources "" loads none of
    // them either. --bare would discard the OAuth sign-in the assistant runs on.
    "--restricted",
    "--setting-sources",
    "",
    "--disable-slash-commands",
    "--no-chrome",
    "--no-session-persistence",
    "--settings",
    JSON.stringify({
      disableAllHooks: true,
      autoMemoryEnabled: false,
      claudeMdExcludes: ["**"],
      enabledPlugins: {},
    }),
    "--system-prompt",
    options.system,
    "--strict-mcp-config",
    "--mcp-config",
    options.mcpConfig,
    // No built-in tool at all; only Slopify's server is allowed, and the web tools are named
    // as refused in case a later version brings them back by default.
    "--tools",
    "",
    "--allowedTools",
    `mcp__${assistantServerName}`,
    "--disallowedTools",
    "WebSearch,WebFetch,Bash",
    "--permission-mode",
    "dontAsk",
    ...(options.model === undefined || options.model === "" ? [] : ["--model", options.model]),
  ];
}

export function claudeAssistantConfig(url: string): string {
  return JSON.stringify({
    mcpServers: {
      [assistantServerName]: {
        type: "http",
        url,
        headers: { Authorization: `Bearer \${${assistantTokenVariable}}` },
      },
    },
  });
}

export function codexAssistantArgs(options: {
  readonly directory: string;
  readonly url: string;
  readonly system: string;
  readonly model?: string | undefined;
}): string[] {
  const server = `mcp_servers.${assistantServerName}`;
  return [
    ...hardenedCodexBase(options.directory),
    "-c",
    `instructions=${JSON.stringify(options.system)}`,
    "-c",
    'web_search="disabled"',
    "-c",
    "tool_output_token_limit=32768",
    "-c",
    `${server}.url=${JSON.stringify(options.url)}`,
    "-c",
    `${server}.bearer_token_env_var=${JSON.stringify(assistantTokenVariable)}`,
    "-c",
    `${server}.required=true`,
    "-c",
    `${server}.default_tools_approval_mode="auto"`,
    ...(options.model === undefined || options.model === "" ? [] : ["-m", options.model]),
    "--",
    "-",
  ];
}

export interface AssistantWorkspace {
  readonly directory: string;
  // Claude Code's --mcp-config file; Codex takes its server as -c values.
  readonly config: string;
  readonly env: NodeJS.ProcessEnv;
  readonly remove: () => void;
}

// A private folder (0700) that is the CLI's working directory, so nothing of the person's
// projects is its cwd, holding the 0600 config file; removed when the turn ends.
export function assistantWorkspace(
  url: string,
  token: string,
  sourceEnv: Readonly<NodeJS.ProcessEnv>,
): AssistantWorkspace {
  const directory = mkdtempSync(join(tmpdir(), "slopify-assistant-"));
  const remove = (): void =>
    rmSync(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  try {
    const config = join(directory, "mcp.json");
    writeFileSync(config, claudeAssistantConfig(url), { mode: 0o600, flag: "wx" });
    const env: NodeJS.ProcessEnv = { ...sourceEnv };
    delete env.INIT_CWD;
    delete env.OLDPWD;
    delete env.GIT_DIR;
    delete env.GIT_WORK_TREE;
    delete env.CLAUDE_CODE_SAFE_MODE;
    env.PWD = directory;
    env[assistantTokenVariable] = token;
    return { directory, config, env, remove };
  } catch (error) {
    remove();
    throw error;
  }
}

const typed = z.object({ type: z.string() }).loose();
const claudeInit = z
  .object({
    subtype: z.literal("init"),
    tools: z.array(z.string()).optional(),
    mcp_servers: z.array(z.object({ name: z.string(), status: z.string() }).loose()).optional(),
  })
  .loose();
const claudeAssistant = z
  .object({
    message: z.object({
      content: z.array(
        z
          .object({ type: z.string(), text: z.string().optional(), name: z.string().optional() })
          .loose(),
      ),
    }),
  })
  .loose();
const claudePartial = z
  .object({
    event: z.object({
      type: z.literal("content_block_delta"),
      delta: z.object({ type: z.literal("text_delta"), text: z.string() }),
    }),
  })
  .loose();
const claudeResult = z
  .object({ subtype: z.string(), is_error: z.boolean().optional(), result: z.string().optional() })
  .loose();

const codexItem = z
  .object({
    item: z
      .object({
        id: z.string().optional(),
        type: z.string(),
        text: z.string().optional(),
        server: z.string().optional(),
        tool: z.string().optional(),
      })
      .loose(),
  })
  .loose();
const codexFailed = z.object({ error: z.object({ message: z.string() }) }).loose();
const codexError = z.object({ message: z.string() }).loose();

// Codex items that are no part of a Slopify chat: a shell command, a file edit, a web
// search, another agent.
const codexForeign = new Set([
  "command_execution",
  "file_change",
  "web_search",
  "collab_tool_call",
]);

function failed(cli: "claude-code" | "codex", said: string): AssistantStreamEvent {
  const login = cliLoginError(cli, said);
  if (login !== undefined) return { type: "failed", message: login.message };
  return {
    type: "failed",
    message: `The ${cliName(cli === "claude-code" ? "claude" : "codex")} stopped with an error: ${redact(said).slice(0, 500)}. Send your message again; if it keeps happening, check the CLI in Settings → Providers.`,
  };
}

// One JSONL line of the CLI's stream as what the chat shows. A stateful reader: Codex reports
// a message's text so far, and only what is new is passed on.
export function assistantStream(
  cli: "claude-code" | "codex",
): (line: string) => readonly AssistantStreamEvent[] {
  const typedSoFar = new Map<string, string>();
  return (line) => {
    if (line.trim() === "") return [];
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      return [];
    }
    const event = typed.safeParse(value);
    if (!event.success) return [];
    return cli === "claude-code"
      ? claudeEvents(event.data.type, value)
      : codexEvents(event.data.type, value);
  };

  function claudeEvents(type: string, value: unknown): readonly AssistantStreamEvent[] {
    if (type === "system") {
      const init = claudeInit.safeParse(value);
      if (!init.success) return [];
      const foreign = (init.data.tools ?? []).filter((name) => !name.startsWith(slopifyTool));
      if (foreign.length > 0) return [{ type: "foreign", name: foreign.join(", ") }];
      const server = init.data.mcp_servers?.find((one) => one.name === assistantServerName);
      if (server !== undefined && (server.status === "failed" || server.status === "needs-auth"))
        return [
          {
            type: "failed",
            message:
              "Claude Code couldn't reach Slopify's assistant tools, so it answered nothing. Send your message again; if it keeps happening, restart Slopify.",
          },
        ];
      return [];
    }
    if (type === "stream_event") {
      const partial = claudePartial.safeParse(value);
      return partial.success && partial.data.event.delta.text !== ""
        ? [{ type: "partial", text: partial.data.event.delta.text }]
        : [];
    }
    if (type === "assistant") {
      const message = claudeAssistant.safeParse(value);
      if (!message.success) return [];
      return message.data.message.content.flatMap((block): AssistantStreamEvent[] => {
        if (block.type === "text" && block.text !== undefined && block.text !== "")
          return [{ type: "text", text: block.text }];
        if (block.type !== "tool_use" || block.name === undefined) return [];
        return block.name.startsWith(slopifyTool)
          ? [{ type: "tool", name: block.name.slice(slopifyTool.length) }]
          : [{ type: "foreign", name: block.name }];
      });
    }
    if (type === "result") {
      const result = claudeResult.safeParse(value);
      if (!result.success) return [];
      return result.data.is_error === true || result.data.subtype !== "success"
        ? [failed("claude-code", result.data.result ?? result.data.subtype)]
        : [{ type: "done" }];
    }
    return [];
  }

  function codexEvents(type: string, value: unknown): readonly AssistantStreamEvent[] {
    if (type === "item.started" || type === "item.updated" || type === "item.completed") {
      const parsed = codexItem.safeParse(value);
      if (!parsed.success) return [];
      const { item } = parsed.data;
      if (codexForeign.has(item.type)) return [{ type: "foreign", name: item.type }];
      if (item.type === "mcp_tool_call") {
        if (item.server !== assistantServerName)
          return [{ type: "foreign", name: `${item.server ?? "?"}.${item.tool ?? "?"}` }];
        return type === "item.started" && item.tool !== undefined
          ? [{ type: "tool", name: item.tool }]
          : [];
      }
      if (item.type !== "agent_message") return [];
      const id = item.id ?? "";
      const seen = typedSoFar.get(id) ?? "";
      const text = item.text ?? "";
      if (type === "item.completed") {
        typedSoFar.delete(id);
        return text === "" ? [] : [{ type: "text", text }];
      }
      if (text.length > seen.length && text.startsWith(seen)) {
        typedSoFar.set(id, text);
        return [{ type: "partial", text: text.slice(seen.length) }];
      }
      return [];
    }
    if (type === "turn.completed") return [{ type: "done" }];
    if (type === "turn.failed") {
      const parsed = codexFailed.safeParse(value);
      return [failed("codex", parsed.success ? parsed.data.error.message : "the turn failed")];
    }
    if (type === "error") {
      const parsed = codexError.safeParse(value);
      return [failed("codex", parsed.success ? parsed.data.message : "unknown error")];
    }
    return [];
  }
}

// The turn itself: a private workspace, the CLI started in it with the prompt on stdin, its
// stream read into the chat's events, and everything stopped and removed at the end.
export function assistantCliRunner(
  run: RunCli,
  sourceEnv: Readonly<NodeJS.ProcessEnv> = process.env,
): RunAssistantCli {
  return async function* turn(request: AssistantCliTurn): AsyncGenerator<AssistantStreamEvent> {
    const space = assistantWorkspace(request.url, request.token, sourceEnv);
    let child: CliRun | undefined;
    let ended: CliEnded | undefined;
    try {
      child = run(
        request.binary,
        request.cli === "claude-code"
          ? claudeAssistantArgs({ mcpConfig: space.config, system: request.system })
          : codexAssistantArgs({
              directory: space.directory,
              url: request.url,
              system: request.system,
            }),
        request.signal,
        { cwd: space.directory, env: space.env, stdin: cliInput(request.prompt) },
      );
      const read = assistantStream(request.cli);
      for await (const line of lines(child.stdout, request.signal))
        for (const event of read(line)) {
          yield event;
          if (event.type === "done" || event.type === "failed" || event.type === "foreign") return;
        }
    } finally {
      // Also when the reader stops early (Stop, the time limit): a CLI left running would
      // keep spending the person's plan.
      try {
        if (child !== undefined) ended = await stopCliRun(child);
      } finally {
        space.remove();
      }
    }
    if (request.signal.aborted || child === undefined) return;
    // The stream ended with neither an answer nor a failure.
    const binary = request.cli === "claude-code" ? "claude" : codexBinary;
    const said = child.stderr();
    yield {
      type: "failed",
      message:
        cliLoginError(request.cli, said)?.message ??
        (ended === undefined ? stuckCli(binary) : endedWithout(binary, ended, said)),
    };
  };
}
