import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { redact } from "../../kernel/log.js";
import type { LlmCompletion, LlmEvent, LlmPort, Usage } from "../../kernel/ports/llm.js";
import type { ModelInfo } from "../../kernel/ports/model.js";
import { providerError } from "../../kernel/ports/model.js";
import type {
  LimitWindow,
  PlanLimitHit,
  PlanLimitReading,
} from "../../kernel/ports/plan-limits.js";
import { cliCheck, cliReported } from "../explain.js";
import { cliLoginError } from "./cli-login-error.js";
import { codexPlanLimit } from "./codex-limits.js";
import { nodeCodexModels } from "./codex-models.js";
import {
  type DocumentWorkspace,
  documentServerName,
  documentTool,
  documentWorkspace,
} from "./document-workspace.js";
import type { CliEnded, CliOptions, RunCli } from "./run-cli.js";
import {
  cliEvent,
  cliInput,
  cliShaped,
  deliveredInput,
  endedWithout,
  promptOf,
  stopCliRun,
  stuckCli,
} from "./run-cli.js";
import { lines } from "./sse-lines.js";

// The local-agent adapter for the Codex CLI. Same shape as Claude Code's and a different
// vocabulary: Codex writes a JSONL thread of `thread.started`, `item.*` and `turn.*`
// events. No key here either - the CLI's own login authenticates it.

export const codexBinary = "codex";

export interface CodexDeps {
  readonly env?: Readonly<NodeJS.ProcessEnv> | undefined;
  readonly run: RunCli;
  readonly binary?: string | undefined;
  readonly readModels?: (() => Promise<readonly ModelInfo[]>) | undefined;
  // The plan windows, read before and after every call (`codex-limits.ts`). Absent, a call
  // reports none.
  readonly readLimits?: (() => Promise<readonly LimitWindow[] | null>) | undefined;
  readonly now?: (() => Date) | undefined;
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
export function codexArgs(
  req: LlmCompletion,
  directory: string,
  documents?: DocumentWorkspace,
): string[] {
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
    `instructions=${JSON.stringify(writingRole + (documents ? " Use the explicitly supplied research MCP tool to read request documents; it is the only permitted local reference source." : ""))}`,
    "-c",
    `web_search="${req.webSearch === true ? "live" : "disabled"}"`,
    ...(req.thinkingConfig?.effort
      ? ["-c", `model_reasoning_effort="${req.thinkingConfig.effort}"`]
      : []),
    ...(req.model === "" ? [] : ["-m", req.model]),
    ...(documents
      ? [
          "-c",
          "tool_output_token_limit=32768",
          ...Object.entries({
            command: JSON.stringify(documents.command),
            args: JSON.stringify(documents.args),
            enabled_tools: JSON.stringify([documentTool]),
            required: "true",
            default_tools_approval_mode: '"auto"',
          }).flatMap(([key, value]) => ["-c", `mcp_servers.${documentServerName}.${key}=${value}`]),
        ]
      : []),
    // A literal '-' requests stdin; report bodies never become OS arguments.
    "--",
    "-",
  ];
}

const itemCompleted = z.object({
  item: z.object({ type: z.string(), text: z.string().optional() }),
});

// The field names are the shipped binary's own: `TurnCompletedEvent` carries `usage`, and
// its counts are `input_tokens`, `cached_input_tokens`, `cache_write_input_tokens`,
// `output_tokens`, `reasoning_output_tokens`. `input_tokens` already counts the cached ones.
const turnCompleted = z.object({
  usage: z
    .object({
      input_tokens: z.number(),
      output_tokens: z.number(),
      cached_input_tokens: z.number().optional(),
    })
    .nullish(),
});

const turnFailed = z.object({ error: z.object({ message: z.string() }) });
// The top-level `error` event carries its text in `message`, not in `error.message`.
const errorEvent = z.object({ message: z.string() });

export function codexLlm(deps: CodexDeps): LlmPort {
  const binary = deps.binary ?? codexBinary;

  async function* complete(req: LlmCompletion): AsyncGenerator<LlmEvent> {
    req.signal.throwIfAborted();
    const workspace = codexWorkspace(deps.env ?? process.env);
    let documents: DocumentWorkspace | undefined;
    let run: ReturnType<RunCli> | undefined;
    let ended: CliEnded | undefined;
    // Asked beside the run rather than before it: the read takes about a second and the
    // turn spends nothing until its first answer, so the reading is still the one before.
    const before = deps.readLimits?.().catch(() => null);
    try {
      documents = documentWorkspace(req.documents);
      run = deps.run(binary, codexArgs(req, workspace.directory, documents), req.signal, {
        ...workspace.options,
        stdin: cliInput(
          [documents?.instructions, promptOf(req.messages)].filter(Boolean).join("\n\n"),
        ),
      });
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
          await deliveredInput(run);
          documents?.verifyRead();
          const { usage } = cliShaped(binary, turnCompleted, event.value);
          // ceiling: Codex reports no stop reason, so the continuation loop cannot tell a
          // finished answer from one cut at the output limit. A `--output-schema` run
          // would, at the cost of constraining every stage's answer.
          const limits = await readingOf(before, deps.readLimits);
          yield {
            type: "done",
            usage: usageOf(usage),
            finishReason: null,
            ...(limits === undefined ? {} : { limits }),
          };
          return;
        }
        if (event.type === "turn.failed") {
          const failed = cliShaped(binary, turnFailed, event.value).error.message;
          const login = cliLoginError("codex", failed);
          if (login) throw login;
          const planLimit = codexPlanLimit(failed, (deps.now ?? (() => new Date()))());
          if (planLimit !== undefined) throw codexLimitError(failed, planLimit);
          throw providerError({
            kind: "other",
            message: cliReported(
              binary,
              redact(cliShaped(binary, turnFailed, event.value).error.message),
              cliCheck(binary),
            ),
          });
        }
        if (event.type === "error") {
          const failed = cliShaped(binary, errorEvent, event.value).message;
          const login = cliLoginError("codex", failed);
          if (login) throw login;
          const planLimit = codexPlanLimit(failed, (deps.now ?? (() => new Date()))());
          if (planLimit !== undefined) throw codexLimitError(failed, planLimit);
          throw providerError({
            kind: "other",
            message: cliReported(
              binary,
              redact(cliShaped(binary, errorEvent, event.value).message),
              cliCheck(binary),
            ),
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
        documents?.remove();
        workspace.remove();
      }
    }
    // A cancelled run ends its stream the same way an exhausted one does: the child was
    // killed, so stdout simply stopped. An aborted call counts as nothing, so it must not
    // be reported as the provider failing.
    req.signal.throwIfAborted();
    // The stream ended with neither a completed turn nor a failure.
    const login = cliLoginError("codex", run.stderr());
    if (login) throw login;
    const planLimit = codexPlanLimit(run.stderr(), (deps.now ?? (() => new Date()))());
    if (planLimit !== undefined) throw codexLimitError(run.stderr().trim(), planLimit);
    throw providerError({
      kind: "other",
      message: ended === undefined ? stuckCli(binary) : endedWithout(binary, ended, run.stderr()),
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

function codexWorkspace(sourceEnv: Readonly<NodeJS.ProcessEnv>): {
  readonly directory: string;
  readonly options: CliOptions;
  readonly remove: () => void;
} {
  const directory = mkdtempSync(join(tmpdir(), "slopify-codex-"));
  // npm sets INIT_CWD to the directory from which the app was launched. Do not hand that path,
  // an old shell directory or Git's explicit worktree pointers to the content subprocess.
  const env = { ...sourceEnv };
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
  usage:
    | {
        readonly input_tokens: number;
        readonly output_tokens: number;
        readonly cached_input_tokens?: number | undefined;
      }
    | null
    | undefined,
): Usage | null {
  return usage === null || usage === undefined
    ? null
    : {
        inputTokens: usage.input_tokens,
        outputTokens: usage.output_tokens,
        ...(usage.cached_input_tokens ? { cachedInputTokens: usage.cached_input_tokens } : {}),
      };
}

// The windows before (already asked) and after the call; undefined when neither arrived.
export async function readingOf(
  before: Promise<readonly LimitWindow[] | null> | undefined,
  read: (() => Promise<readonly LimitWindow[] | null>) | undefined,
): Promise<PlanLimitReading | undefined> {
  if (read === undefined) return undefined;
  const [start, end] = await Promise.all([before, read().catch(() => null)]);
  if (!start?.length && !end?.length) return undefined;
  return {
    ...(start?.length ? { before: start } : {}),
    ...(end?.length ? { after: end } : {}),
  };
}

export function codexLimitError(message: string, planLimit: PlanLimitHit): Error {
  return providerError({
    kind: "rate_limit",
    message: `Your Codex plan's usage limit is used up (the Codex CLI said: ${redact(message)}). Slopify waits for it to reset and then carries on by itself.`,
    planLimit,
  });
}
