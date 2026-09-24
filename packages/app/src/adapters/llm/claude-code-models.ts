import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { cliCommand } from "../../kernel/cli-command.js";
import type { ThinkingMode } from "../../kernel/ports/llm.js";
import type { ModelInfo } from "../../kernel/ports/model.js";

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
    "Claude Code model discovery is unavailable. Refresh the list or enter an exact model ID.",
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
  const directory = await mkdtemp(join(tmpdir(), "slopify-claude-models-"));
  const requestId = randomUUID();
  const command = cliCommand(binary);
  const child = spawn(
    command.file,
    [
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
    {
      cwd: directory,
      env: discoveryEnv(),
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
      detached: process.platform !== "win32",
    },
  );
  child.on("error", () => {});
  child.stdin.on("error", () => {});
  child.stderr.resume();
  const closed = new Promise<void>((resolve) => child.once("close", () => resolve()));
  const terminate = (force: boolean): void => {
    const signal = force ? "SIGKILL" : "SIGTERM";
    if (process.platform !== "win32" && child.pid !== undefined) {
      try {
        process.kill(-child.pid, signal);
        return;
      } catch {
        // A child that already exited has no process group to signal.
      }
    }
    child.kill(signal);
  };
  let forceTimer: ReturnType<typeof setTimeout> | undefined;
  const timer = setTimeout(() => {
    terminate(false);
    forceTimer = setTimeout(() => terminate(true), 500);
  }, timeoutMs);
  try {
    child.stdin.write(
      `${JSON.stringify({
        request_id: requestId,
        type: "control_request",
        request: { subtype: "initialize" },
      })}\n`,
    );
    let output = "";
    let bytes = 0;
    for await (const piece of child.stdout) {
      bytes += piece.length;
      if (bytes > maxOutputBytes) throw unavailable();
      output += piece.toString();
      let newline = output.indexOf("\n");
      while (newline >= 0) {
        const line = output.slice(0, newline).trim();
        output = output.slice(newline + 1);
        if (line !== "") {
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
        newline = output.indexOf("\n");
      }
    }
    throw unavailable();
  } catch {
    throw unavailable();
  } finally {
    clearTimeout(timer);
    if (forceTimer !== undefined) clearTimeout(forceTimer);
    terminate(false);
    const grace = await Promise.race([
      closed.then(() => true),
      new Promise<false>((resolve) => setTimeout(() => resolve(false), 500)),
    ]);
    if (!grace) {
      terminate(true);
      await Promise.race([closed, new Promise<void>((resolve) => setTimeout(resolve, 500))]);
    }
    await rm(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
}
