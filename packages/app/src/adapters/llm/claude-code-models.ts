import { randomUUID } from "node:crypto";
import { z } from "zod";
import { cliCommand } from "../../kernel/cli-command.js";
import type { ThinkingMode } from "../../kernel/ports/llm.js";
import type { ModelInfo } from "../../kernel/ports/model.js";
import { cappedOutput, withChildSession } from "./child-session.js";
import { lines } from "./sse-lines.js";

const maxOutputBytes = 1024 * 1024;
const modelId = z
  .string()
  .trim()
  .min(1)
  .max(256)
  .refine((value) =>
    [...value].every((character) => {
      const code = character.charCodeAt(0);
      return code >= 33 && code !== 127;
    }),
  );
const modelName = z.string().trim().min(1).max(256);
const responseSchema = z.object({
  type: z.literal("control_response"),
  response: z.object({
    request_id: z.string(),
    subtype: z.literal("success"),
    response: z.object({
      models: z
        .array(
          z.object({
            value: modelId,
            resolvedModel: modelId.optional(),
            displayName: modelName,
            description: z.string().max(4096).optional(),
            disabled: z.boolean().optional(),
            supportedEffortLevels: z.array(z.string()).max(10).optional(),
          }),
        )
        .min(1)
        .max(100),
    }),
  }),
});
const supportedEfforts: readonly ThinkingMode[] = ["low", "medium", "high", "xhigh"];

function unavailable(): Error {
  return new Error(
    "Slopify could not get the model list from the Claude Code CLI. Check the CLI is installed and signed in (Settings → Keys & services), then refresh the list, or type an exact model ID.",
  );
}

function discoveryEnv(): NodeJS.ProcessEnv {
  const names = [
    "HOME",
    "USER",
    "LOGNAME",
    "USERPROFILE",
    "APPDATA",
    "LOCALAPPDATA",
    "XDG_CONFIG_HOME",
    "XDG_DATA_HOME",
    "XDG_CACHE_HOME",
    "CLAUDE_CONFIG_DIR",
    "PATH",
    "PATHEXT",
    "LANG",
    "LC_ALL",
    "LC_CTYPE",
    "TMPDIR",
    "TEMP",
    "TMP",
    "SystemRoot",
    "WINDIR",
  ] as const;
  const env: NodeJS.ProcessEnv = {};
  for (const name of names) {
    if (process.env[name] !== undefined) env[name] = process.env[name];
  }
  return env;
}

function choices(event: unknown, requestId: string): readonly ModelInfo[] {
  const parsed = responseSchema.safeParse(event);
  if (!parsed.success || parsed.data.response.request_id !== requestId) throw unavailable();
  const models = new Map<string, ModelInfo>();
  for (const row of parsed.data.response.response.models) {
    if (row.disabled) continue;
    const modes = row.supportedEffortLevels?.filter((value): value is ThinkingMode =>
      supportedEfforts.includes(value as ThinkingMode),
    );
    const thinking = modes?.length ? { thinkingModes: modes } : {};
    const target = row.resolvedModel ?? row.value;
    const context = /\[([^\]]+)\]/.exec(row.value)?.[1] ?? /\[([^\]]+)\]/.exec(target)?.[1];
    const key = target.replace(/\[[^\]]+\]/g, "") + (context ? `[${context}]` : "");
    // Default and Opus can resolve to the same model. Keep the named CLI choice,
    // preserving its accepted value (including context modifiers) for generation.
    if (!models.has(key) || models.get(key)?.id === "default")
      models.set(key, {
        id: row.value,
        name:
          claudeModelName(target, row.description, row.displayName) +
          (context ? ` (${context.toUpperCase()} context)` : ""),
        ...thinking,
      });
  }
  if (models.size === 0) throw unavailable();
  return [...models.values()];
}

function claudeModelName(
  target: string,
  description: string | undefined,
  fallback: string,
): string {
  const version = /^claude-(opus|sonnet|haiku|fable)-(\d+)(?:-(\d{1,2})(?=-|\[|$))?/i.exec(target);
  if (version) {
    const family = version[1] ?? "";
    return `${family[0]?.toUpperCase()}${family.slice(1)} ${version[2]}${version[3] ? `.${version[3]}` : ""}`;
  }
  const advertised = /\b(?:Opus|Sonnet|Haiku|Fable) \d+(?:\.\d+)?\b/i.exec(description ?? "");
  return advertised?.[0] ?? fallback.replace(/\s*\([^)]*context\)/i, "");
}

// The installed CLI has no model-list command; initialize is a no-prompt
// stream-JSON control exchange. Treat protocol drift as unavailable metadata.
export async function nodeClaudeCodeModels(
  binary: string,
  timeoutMs = 15_000,
): Promise<readonly ModelInfo[]> {
  const requestId = randomUUID();
  const command = cliCommand(binary);
  return withChildSession(
    {
      file: command.file,
      args: [
        ...command.args,
        "-p",
        "--input-format",
        "stream-json",
        "--output-format",
        "stream-json",
        "--verbose",
        "--safe-mode",
        "--tools",
        "",
        "--strict-mcp-config",
        "--no-session-persistence",
      ],
      env: () => discoveryEnv(),
      directoryPrefix: "slopify-claude-models-",
      timeoutMs,
      killAfterTermMs: 500,
      graceMs: 500,
      settleMs: 500,
    },
    async ({ child, send }) => {
      try {
        send({
          request_id: requestId,
          type: "control_request",
          request: { subtype: "initialize" },
        });
        for await (const text of lines(cappedOutput(child.stdout, maxOutputBytes, unavailable))) {
          const line = text.trim();
          if (line === "") continue;
          let event: unknown;
          try {
            event = JSON.parse(line);
          } catch {
            throw unavailable();
          }
          if (
            typeof event === "object" &&
            event !== null &&
            "type" in event &&
            event.type === "control_response"
          ) {
            return choices(event, requestId);
          }
        }
        throw unavailable();
      } catch {
        throw unavailable();
      }
    },
  );
}
