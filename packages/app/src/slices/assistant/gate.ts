import { createHash } from "node:crypto";

// "Ask first": which of Slopify's tools the assistant may only call once the person pressed
// Allow, and how a later call is matched to that Allow. The model can't approve itself: a
// call with confirmed: true counts only against a grant the person made (`repo.ts`).

// Never offered to the assistant: an external review is the reviewing agent's or the
// person's, the library's export and import move every prompt at once, uploads take files
// from disk, and emptying the trash or deleting old versions can't be undone.
export const assistantExcludedTools: ReadonlySet<string> = new Set([
  "submit_review_verdict",
  "get_external_review",
  "import_library",
  "export_library",
  "delete_from_trash",
  "delete_from_trash_many",
  "delete_old_versions",
]);

// The tools that start work a provider bills for (or that the plan's allowance pays for).
export const assistantCostlyTools = [
  "start_draft",
  "start_rebuild",
  "make_quick_short",
  "make_full_video_draft",
  "retry_stage",
  "soften_stage",
  "rerun_stage",
  "resume_project",
  "approve_checkpoint",
  "generate_topics",
  "generate_cast_picture",
  "quote_voice_sample",
  "prepare_topic",
  "instantiate_template",
  "approve_topic",
  "approve_topics",
  "approve_all_topics",
  "switch_retired_model",
  "switch_all_retired_models",
] as const;
const costly: ReadonlySet<string> = new Set(assistantCostlyTools);

export interface GatedTool {
  readonly name: string;
  readonly method: string;
  // The consequence the page's confirm dialog states, when it has one.
  readonly confirm?: string | undefined;
}

// Removing something (DELETE), anything the page confirms, and paid work.
export function isGated(tool: GatedTool): boolean {
  return tool.method === "DELETE" || tool.confirm !== undefined || costly.has(tool.name);
}

// ceiling: an ask can be answered, and an Allow used, for 15 minutes. Past that the costs
// may have moved, so the assistant has to ask again.
export const askWindowMs = 15 * 60_000;

// The same call is the same arguments, whatever key retries it and whether it says it is
// confirmed: those two are what a call after Allow changes.
export function argsHash(args: Readonly<Record<string, unknown>>): string {
  const { confirmed: _confirmed, body, ...rest } = args;
  const kept =
    typeof body === "object" && body !== null && !Array.isArray(body)
      ? { ...rest, body: withoutKey(body) }
      : body === undefined
        ? rest
        : { ...rest, body };
  return createHash("sha256").update(canonical(kept)).digest("hex");
}

function withoutKey(body: object): Record<string, unknown> {
  const { idempotencyKey: _key, ...rest } = body as Record<string, unknown>;
  return rest;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (typeof value === "object" && value !== null)
    return `{${Object.entries(value)
      .filter(([, one]) => one !== undefined)
      .toSorted(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, one]) => `${JSON.stringify(key)}:${canonical(one)}`)
      .join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
