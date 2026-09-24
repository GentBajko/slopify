import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { cliCommand } from "../../kernel/cli-command.js";
import type { ModelInfo } from "../../kernel/ports/model.js";

const text = z
  .string()
  .trim()
  .min(1)
  .max(256)
  .refine((value) => !/[\p{Cc}]/u.test(value));
const pageSchema = z.object({
  data: z
    .array(
      z.object({
        model: text.regex(/^\S+$/),
        displayName: text,
        hidden: z.boolean().optional(),
        supportedReasoningEfforts: z
          .array(z.object({ reasoningEffort: z.string() }))
          .max(20)
          .optional(),
      }),
    )
    .max(1000),
  nextCursor: z.string().max(4096).nullish(),
});

// model/list is a metadata-only app-server exchange: no thread, turn or tool is started.
export async function nodeCodexServerModels(
  binary: string,
  env: Readonly<Record<string, string | undefined>>,
  timeoutMs = 15_000,
): Promise<readonly ModelInfo[]> {
  const command = cliCommand(binary);
  const directory = await mkdtemp(join(tmpdir(), "slopify-codex-models-"));
  const child = spawn(command.file, [...command.args, "app-server", "--listen", "stdio://"], {
    cwd: directory,
    env: { ...env, PWD: directory },
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
    detached: process.platform !== "win32",
  });
  child.on("error", () => {});
  child.stdin.on("error", () => {});
  child.stderr.resume();
  const closed = new Promise<void>((resolve) => child.once("close", () => resolve()));
  function terminate(signal: NodeJS.Signals): void {
    if (process.platform !== "win32" && child.pid !== undefined) {
      try {
        process.kill(-child.pid, signal);
        return;
      } catch {
        /* The process may already have exited. */
      }
    }
    child.kill(signal);
  }
  const timer = setTimeout(() => terminate("SIGKILL"), timeoutMs);
  const send = (message: unknown) => child.stdin.write(`${JSON.stringify(message)}\n`);
  let expectedId = 1;
  let pages = 0;
  let bytes = 0;
  let buffer = "";
  const models = new Map<string, ModelInfo>();
  const cursors = new Set<string>();
  try {
    send({
      id: expectedId,
      method: "initialize",
      params: {
        clientInfo: { name: "slopify_model_discovery", version: "1.0" },
      },
    });
    child.stdout.setEncoding("utf8");
    for await (const piece of child.stdout) {
      bytes += Buffer.byteLength(piece);
      if (bytes > 4 * 1024 * 1024) throw new Error("Oversized metadata");
      buffer += piece;
      let newline = buffer.indexOf("\n");
      while (newline >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        newline = buffer.indexOf("\n");
        if (line === "") continue;
        const event = z
          .object({
            id: z.unknown().optional(),
            result: z.unknown().optional(),
            error: z.unknown().optional(),
          })
          .parse(JSON.parse(line));
        if (event.id !== expectedId) continue;
        if (event.error !== undefined) throw new Error("Discovery refused");
        let cursor: string | null | undefined;
        if (expectedId === 1) {
          send({ method: "initialized" });
        } else {
          const page = pageSchema.parse(event.result);
          for (const row of page.data) {
            if (row.hidden === true || models.has(row.model)) continue;
            const thinkingModes = row.supportedReasoningEfforts
              ?.map((item) => item.reasoningEffort)
              .filter((effort): effort is NonNullable<ModelInfo["thinkingModes"]>[number] =>
                ["off", "low", "medium", "high", "xhigh"].includes(effort),
              );
            models.set(row.model, {
              id: row.model,
              name: codexModelName(row.displayName),
              ...(thinkingModes?.length ? { thinkingModes } : {}),
            });
          }
          cursor = page.nextCursor;
          if (!cursor) {
            if (models.size === 0) throw new Error("No visible models");
            return [...models.values()];
          }
          if (cursors.has(cursor) || ++pages >= 20) throw new Error("Invalid pagination");
          cursors.add(cursor);
        }
        send({
          id: ++expectedId,
          method: "model/list",
          params: { limit: 100, includeHidden: false, ...(cursor ? { cursor } : {}) },
        });
      }
    }
    throw new Error("Discovery ended before its reply");
  } finally {
    clearTimeout(timer);
    terminate("SIGTERM");
    let grace: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      closed,
      new Promise<void>((resolve) => {
        grace = setTimeout(() => {
          terminate("SIGKILL");
          resolve();
        }, 500);
      }),
    ]);
    clearTimeout(grace);
    await rm(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
}

export function codexModelName(name: string): string {
  return name.replace(/^(GPT-\d+(?:\.\d+)?)-/i, "$1 ");
}
