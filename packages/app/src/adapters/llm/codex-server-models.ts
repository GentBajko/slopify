import { z } from "zod";
import { cliCommand } from "../../kernel/cli-command.js";
import { thinkingModes as knownEfforts } from "../../kernel/ports/llm.js";
import type { ModelInfo } from "../../kernel/ports/model.js";
import { cappedOutput, withChildSession } from "./child-session.js";
import { lines } from "./sse-lines.js";

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
  return withChildSession(
    {
      file: command.file,
      args: [...command.args, "app-server", "--listen", "stdio://"],
      env: (directory) => ({ ...env, PWD: directory }),
      directoryPrefix: "slopify-codex-models-",
      timeoutMs,
      graceMs: 500,
    },
    async ({ child, send }) => {
      let expectedId = 1;
      let pages = 0;
      const models = new Map<string, ModelInfo>();
      const cursors = new Set<string>();
      send({
        id: expectedId,
        method: "initialize",
        params: {
          clientInfo: { name: "slopify_model_discovery", version: "1.0" },
        },
      });
      const oversize = (): Error => new Error("Oversized metadata");
      for await (const raw of lines(cappedOutput(child.stdout, 4 * 1024 * 1024, oversize))) {
        const line = raw.trim();
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
                (knownEfforts as readonly string[]).includes(effort),
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
      throw new Error("Discovery ended before its reply");
    },
  );
}

export function codexModelName(name: string): string {
  return name.replace(/^(GPT-\d+(?:\.\d+)?)-/i, "$1 ");
}
