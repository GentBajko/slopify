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
  // Settings → Models' Check models sends each model one small paid request.
  "check_models",
  // Library → Designs: each draws a picture a provider bills for. A template's Save draws the
  // editor's sample when it asks for one, so it asks whatever it sends.
  "edit_design_picture",
  "make_design_artwork",
  "make_design_from_template",
  "make_design_template_sample",
  "retry_design_step",
  "save_design_template",
] as const;
const costly: ReadonlySet<string> = new Set(assistantCostlyTools);

// The tools that send something out of Slopify, or choose where it is sent: words a page or a
// file planted in the chat must not be able to point Slopify's notifications elsewhere.
export const assistantOutwardTools = ["set_notification_url", "send_test_notification"] as const;
const outward: ReadonlySet<string> = new Set(assistantOutwardTools);

export interface GatedTool {
  readonly name: string;
  readonly method: string;
  // The consequence the page's confirm dialog states, when it has one.
  readonly confirm?: string | undefined;
  // It sends something out of Slopify.
  readonly sends?: boolean | undefined;
}

// Removing something (DELETE), anything the page confirms, paid work, and sending out.
export function isGated(tool: GatedTool): boolean {
  return (
    tool.method === "DELETE" ||
    tool.confirm !== undefined ||
    costly.has(tool.name) ||
    tool.sends === true ||
    outward.has(tool.name)
  );
}

export function isOutward(tool: GatedTool): boolean {
  return tool.sends === true || outward.has(tool.name);
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
