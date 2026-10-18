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
  // Library → Templates → Open studio: each makes (or remakes) a template's paid sample. A
  // studio Save makes the paid sample of what changed when it asks for one, so it asks
  // whatever it sends. The daily budget is the most the samples may spend, so raising it is
  // the person's call too.
  "save_template_studio",
  "make_template_sample",
  "set_sample_topic",
  "set_sample_full_script",
  "say_it_as",
  "update_template_studio_settings",
  // Redo makes a flagged item again with the provider.
  "redo_review",
  // Taking a checkpoint off lets the paid steps behind it start (one the run waits at must be
  // approved instead, `edge/http/checkpoints.ts`).
  "change_checkpoints",
  // A schedule starts paid runs at its times: making, changing or resuming one decides them.
  "create_schedule",
  "update_schedule",
  "resume_schedule",
  // A restored project picks up where it was, paid steps included.
  "restore_from_trash",
  "restore_from_trash_many",
] as const;
const costly: ReadonlySet<string> = new Set(assistantCostlyTools);

// The tools that send something out of Slopify, or choose where it is sent: words a page or a
// file planted in the chat must not be able to point Slopify's notifications elsewhere.
export const assistantOutwardTools = [
  "set_notification_url",
  "send_test_notification",
  // Rescore sends each topic's title to search engines; Check providers asks every provider
  // with the person's keys.
  "score_topics",
  "check_providers",
] as const;
const outward: ReadonlySet<string> = new Set(assistantOutwardTools);

// Every other tool that changes something, named here so that a new one has to be put in one
// list or the other (`edge/mcp/assistant.test.ts`): free to call, nothing billed or sent.
export const assistantFreeTools = [
  "move_projects_to_channel",
  "move_in_run_queue",
  "estimate_run",
  "hide_autopilot_warning",
  "set_weekly_report",
  "mark_uploaded",
  "keep_as_is",
  "preview_added_output",
  "add_output",
  "overrule_review",
  "edit_description_field",
  "set_description_links",
  "set_pack_slot",
  "set_pack_real_footage",
  "set_pack_pick",
  "set_pack_playlists",
  // A post's settings, text, Reddit fields and link: Fill in <site> stays the person's.
  "set_post_choice",
  "edit_post_text",
  "set_reddit_post",
  "set_post_link",
  "remove_from_fill_queue",
  "swap_releases",
  "set_release",
  "set_posting_plan",
  "set_lead_time",
  "set_youtube_link",
  "pause_project",
  "prepare_revision",
  "save_revision",
  "restore_revision",
  "preview_rebuild",
  "create_draft",
  "save_draft",
  "fork_draft",
  "review_draft",
  "create_template",
  "template_from_project",
  "next_chapter_template",
  "update_template",
  "pause_schedule",
  "reject_topics",
  "restore_topics",
  "reject_topic",
  "edit_held_topic",
  "set_topic_queue",
  "move_topic",
  "transfer_topic",
  "create_channel",
  "update_channel",
  "set_ai_disclosure",
  "add_cast_member",
  "move_cast_member",
  "update_cast_member",
  "set_channel_template",
  "set_episode_memory",
  "update_episode_memory",
  "preview_channel_videos",
  "import_channel_videos",
  "create_design",
  "update_design",
  "quote_design_edit",
  "quote_design_artwork",
  "set_design_version",
  "create_design_template",
  "quote_design_template",
  "create_prompt",
  "update_prompt",
  "set_prompt_photorealistic",
  "restore_prompt_version",
  "create_entry",
  "update_entry",
  "restore_entry_version",
  "create_document_theme",
  "update_document_theme",
  "set_narration_aliases",
  "update_settings",
  "set_default_channel_links",
  "add_voice",
  "set_voice_languages",
  "set_voice_real_person",
  "set_studio_playlists",
  "dismiss_model_notices",
  // The published catalogue: read from Slopify's site, nothing of the person's goes with it.
  "check_catalogue",
  "refresh_catalogue",
  "install_starter_pack",
  "restore_samples",
  "copy_sample",
  "quote_template_save",
  "quote_say_it_as",
  "quote_samples_for_all",
  "make_template_free_samples",
  "quote_bakeoff",
  // Prices remakes for several projects; starting each is start_rebuild's.
  "preview_remake_outdated",
] as const;

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
