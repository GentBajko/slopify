import type { PromptKind } from "@app/slices/library/model.js";
import type { PlayDraftForm } from "@app/slices/play-drafts/schema.js";
import { usesScriptPrompt } from "@app/slices/voices/model.js";

// A multi-voice run that writes a script picks its article prompt from the Script prompts,
// as `slices/library/slots.ts` reads it at the click.
export function articleKind(form: Pick<PlayDraftForm, "sources" | "voices">): PromptKind {
  return usesScriptPrompt(form) ? "script" : "article";
}
