import type { RunDraft } from "../admission/model.js";
import { socialPlatforms } from "./model.js";

// Whether any site's post is written by a post prompt: a paid call to the project's text model.
export function usesPostPrompt(draft: Pick<RunDraft, "social">): boolean {
  return socialPlatforms.some((platform) => draft.social?.[platform]?.text === "prompt");
}
