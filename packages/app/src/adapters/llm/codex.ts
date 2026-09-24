import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { redact } from "../../kernel/log.js";
import type { LlmCompletion, LlmEvent, LlmPort, Usage } from "../../kernel/ports/llm.js";
import type { ModelInfo } from "../../kernel/ports/model.js";
import { providerError } from "../../kernel/ports/model.js";
import { nodeCodexModels } from "./codex-models.js";
import type { CliEnded, CliOptions, RunCli } from "./run-cli.js";
import { cliEvent, cliShaped, endedWithout, promptOf, stopCliRun } from "./run-cli.js";
import { lines } from "./sse-lines.js";

// The local-agent adapter for the Codex CLI. Same shape as Claude Code's and a different
// vocabulary: Codex writes a JSONL thread of `thread.started`, `item.*` and `turn.*`
// events. No key here either - the CLI's own login authenticates it.

export const codexBinary = "codex";

export interface CodexDeps {
  readonly run: RunCli;
  readonly binary?: string | undefined;
  readonly readModels?: (() => Promise<readonly ModelInfo[]>) | undefined;
}

const writingRole =
  "You are the writing and research component of Slopify, a video creation app. " +
  "Produce the text requested in the supplied conversation: articles, narration scripts, " +
  "research notes or image prompts. Follow the requested topic, language, tone, length and format. " +
  "Return only the requested content, without progress updates or introductory remarks. " +
  "Use web search when it is available and needed for the requested research. " +
  "Do not inspect or modify local files.";

// Codex is a coding agent by default, while this adapter is a content provider. These supported
// feature gates remove every local or account-connected tool exposed by 0.149.1. Native web
// search is controlled separately below, so grounded research still works without a shell.
const disabledFeatures = [
  "shell_tool",
  "unified_exec",
  "code_mode_host",
  "hooks",
  "apps",
  "plugins",
  "remote_plugin",
  "skill_search",
  "multi_agent",
  "computer_use",
  "browser_use",
  "image_generation",
  "view_image",
  "workspace_dependencies",
] as const;

// `codex exec --help` (0.149.1) for the flags. `--ignore-user-config` retains authentication
// while excluding config.toml, `--ignore-rules` excludes user/project exec policy, and strict
// config makes an older CLI fail closed if it cannot apply a hardening override. A private cwd
// plus a zero project-doc budget excludes AGENTS.md and project `.codex` context. Read-only is
// defense in depth if a future release exposes a new filesystem tool. The TOML strings keep their
// quotes because each `-c` value is parsed as TOML rather than as a shell expression.
export function codexArgs(req: LlmCompletion, directory: string): string[] {
  return [
    "exec",
    "--json",
    "--ephemeral",
    "--ignore-user-config",
    "--ignore-rules",
    "--strict-config",
    "--skip-git-repo-check",
    "--sandbox",
    "read-only",
    "--cd",
    directory,
    ...disabledFeatures.flatMap((feature) => ["--disable", feature]),
    "-c",
    "project_doc_max_bytes=0",
    "-c",
    "skills.include_instructions=false",
    "-c",
    "skills.bundled.enabled=false",
    "-c",
    "orchestrator.skills.enabled=false",
    "-c",
    "orchestrator.mcp.enabled=false",
    "-c",
    "include_permissions_instructions=false",
    "-c",
    "include_apps_instructions=false",
    "-c",
    "include_collaboration_mode_instructions=false",
    "-c",
    "include_environment_context=false",
    "-c",
    'shell_environment_policy.inherit="none"',
    "-c",
    `instructions=${JSON.stringify(writingRole)}`,
    "-c",
    `web_search="${req.webSearch === true ? "live" : "disabled"}"`,
    ...(req.thinkingConfig?.effort
      ? ["-c", `model_reasoning_effort="${req.thinkingConfig.effort}"`]
      : []),
    ...(req.model === "" ? [] : ["-m", req.model]),
    // The prompt is one argv element after `--`, so a leading dash is text, not a flag.
    "--",
    promptOf(req.messages),
  ];
}

const itemCompleted = z.object({
  item: z.object({ type: z.string(), text: z.string().optional() }),
});

// The field names are the shipped binary's own: `TurnCompletedEvent` carries `usage`, and
// its counts are `input_tokens`, `cached_input_tokens`, `cache_write_input_tokens`,
// `output_tokens`, `reasoning_output_tokens`. Only the two the port has a home for are read.
const turnCompleted = z.object({
  usage: z.object({ input_tokens: z.number(), output_tokens: z.number() }).nullish(),
});

const turnFailed = z.object({ error: z.object({ message: z.string() }) });
// The top-level `error` event carries its text in `message`, not in `error.message`.
const errorEvent = z.object({ message: z.string() });

export function codexLlm(deps: CodexDeps): LlmPort {
  const binary = deps.binary ?? codexBinary;

  async function* complete(req: LlmCompletion): AsyncGenerator<LlmEvent> {
    req.signal.throwIfAborted();
    const workspace = codexWorkspace();
    let run: ReturnType<RunCli> | undefined;
    let ended: CliEnded | undefined;
    try {
      run = deps.run(binary, codexArgs(req, workspace.directory), req.signal, workspace.options);
      for await (const line of lines(run.stdout, req.signal)) {
        if (line.trim() === "") {
          continue;
        }
        const event = cliEvent(binary, line);
        yield { type: "activity" };
        req.signal.throwIfAborted();
        if (event.type === "item.completed") {
          const { item } = cliShaped(binary, itemCompleted, event.value);
          // A turn also completes `reasoning`, `web_search`, `command_execution` and
          // `error` items. The last of those is a warning, not a failure: this machine's
          // codex opens every run with an `error` item saying it has no metadata for the
          // configured model, then answers normally. Only `turn.failed` ends a turn.
          if (item.type === "agent_message" && item.text !== undefined && item.text !== "") {
            yield { type: "delta", text: item.text };
          }
          continue;
        }
        if (event.type === "turn.completed") {
          const { usage } = cliShaped(binary, turnCompleted, event.value);
          // ceiling: Codex reports no stop reason, so the continuation loop cannot tell a
          // finished answer from one cut at the output limit. A `--output-schema` run
          // would, at the cost of constraining every stage's answer.
          yield { type: "done", usage: usageOf(usage), finishReason: null };
          return;
        }
        if (event.type === "turn.failed") {
          throw providerError({
            kind: "other",
            message: redact(cliShaped(binary, turnFailed, event.value).error.message),
          });
        }
        if (event.type === "error") {
          throw providerError({
            kind: "other",
            message: redact(cliShaped(binary, errorEvent, event.value).message),
          });
        }
      }
    } catch (error) {
      req.signal.throwIfAborted();
      throw error;
    } finally {
      try {
        if (run !== undefined) ended = await stopCliRun(run);
      } finally {
        workspace.remove();
      }
    }
    // A cancelled run ends its stream the same way an exhausted one does: the child was
    // killed, so stdout simply stopped. An aborted call counts as nothing, so it must not
    // be reported as the provider failing.
    req.signal.throwIfAborted();
    // The stream ended with neither a completed turn nor a failure.
    throw providerError({
      kind: "other",
      message:
        ended === undefined
          ? `the ${binary} CLI did not stop after forced termination`
          : endedWithout(binary, ended, run.stderr()),
    });
  }

  return {
    id: "codex",
    // Prose arrives as whole messages; other JSONL events carry activity separately.
    capabilities: { streams: true, reportsUsage: true, webSearch: true },
    models: deps.readModels ?? (() => nodeCodexModels(process.env, binary)),
    complete,
  };
}

function codexWorkspace(): {
  readonly directory: string;
  readonly options: CliOptions;
  readonly remove: () => void;
} {
  const directory = mkdtempSync(join(tmpdir(), "slopify-codex-"));
  // npm sets INIT_CWD to the directory from which the app was launched. Do not hand that path,
  // an old shell directory or Git's explicit worktree pointers to the content subprocess.
  const env = { ...process.env };
  delete env.INIT_CWD;
  delete env.OLDPWD;
  delete env.GIT_DIR;
  delete env.GIT_WORK_TREE;
  env.PWD = directory;
  return {
    directory,
    options: { cwd: directory, env },
    remove: () =>
      rmSync(directory, {
        recursive: true,
        force: true,
        maxRetries: 3,
        retryDelay: 50,
      }),
  };
}

function usageOf(
  usage: { readonly input_tokens: number; readonly output_tokens: number } | null | undefined,
): Usage | null {
  return usage === null || usage === undefined
    ? null
    : { inputTokens: usage.input_tokens, outputTokens: usage.output_tokens };
}
