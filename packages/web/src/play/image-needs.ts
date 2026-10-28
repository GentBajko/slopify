import { usesAnimation } from "@app/slices/video/edit-settings.js";
import { type OutputKind, outputKindOf, outputNoun } from "./output-kind";
import { type PlayFormState, shortsOn } from "./state";

// "a, b and c".
export function listed(parts: readonly string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1] ?? ""}`;
}

type NeedsForm = Pick<PlayFormState, "sources" | "shorts" | "videoEdit">;

// What else is drawn by the image service besides the Images stage itself: a drawn thumbnail,
// the shorts' pictures and animated images. The same conditions `admit` asks an image service
// for (`slices/admission/rules.ts`), so a row that says why one is needed says the server's
// reason.
export function imageServiceUsers(form: NeedsForm): readonly string[] {
  const parts: string[] = [];
  if (form.sources.thumbnail === "from_prompt" || form.sources.thumbnail === "prompt_by_llm")
    parts.push("the thumbnail");
  if (shortsOn(form)) parts.push("the shorts");
  if (usesAnimation(form)) parts.push("the animated images");
  return parts;
}

// What turning a stage off would make instead, when that changes what is being made: Images
// None turns a video into an audiobook, Narration Off an audiobook into an article. Undefined
// when the kind stays, and when nothing would be made at all (a set of images with its images
// off writes no article either), since there is no kind to name.
export function kindAfterOff(
  form: Pick<PlayFormState, "sources" | "voices">,
  stage: "images" | "audio",
): OutputKind | undefined {
  const now = outputKindOf(form);
  const sources = {
    ...form.sources,
    [stage]: "off",
    ...(stage === "images" ? { video: "off" as const } : {}),
  } as const;
  const after = outputKindOf({ ...form, sources });
  if (after === now) return undefined;
  return after === "article" && sources.article === "off" ? undefined : after;
}

// "an audiobook", "an article", "a video".
export function aKind(kind: OutputKind): string {
  const noun = outputNoun(kind);
  return `${/^[aeiou]/i.test(noun) ? "an" : "a"} ${noun}`;
}
