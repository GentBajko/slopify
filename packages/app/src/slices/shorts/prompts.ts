import { z } from "zod";
import type { Message } from "../../kernel/ports/llm.js";

// One call per short writes exactly the image prompts its clip needs, one per stretch of
// `imageSeconds`, in the order they are shown. The style comes from the project's Image
// prompt for shorts (or the built-in one); what each image shows comes from the clip.

export interface ImagePromptBrief {
  // The style: the picked Image prompt with keyword values substituted in, or the built-in.
  readonly style: string;
  readonly videoTitle: string;
  readonly shortTitle: string;
  // What is said in the clip.
  readonly text: string;
  readonly count: number;
  readonly imageSeconds: number;
}

export function imagePromptMessages(brief: ImagePromptBrief): readonly Message[] {
  const plural = brief.count === 1 ? "prompt" : "prompts";
  return [
    {
      role: "system",
      content: [
        "You write prompts for an image model. Answer with one JSON array of strings and nothing else, like:",
        '["...", "..."]',
        "",
        "Rules the answer must follow:",
        `- Exactly ${String(brief.count)} ${plural}, one per image, in the order the images are shown.`,
        `- Each image is on screen for about ${String(brief.imageSeconds)} seconds of the clip, so image 1 shows the start of what is said, the next one what follows, and so on.`,
        "- Every image is vertical (9:16).",
        "- Each prompt stands on its own: the image model sees one prompt at a time, so repeat the style in every prompt.",
        "- No text, captions or letters in the images.",
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        "Style and instructions for every image:",
        brief.style,
        "",
        `Video: ${brief.videoTitle}`,
        `Short: ${brief.shortTitle}`,
        "",
        "What is said in the short:",
        brief.text,
      ].join("\n"),
    },
  ];
}

export type CheckedImagePrompts =
  | { readonly ok: true; readonly prompts: readonly string[] }
  | { readonly ok: false; readonly reason: string };

const fix = "Retry stage, or choose another model in Edit project → Providers.";

// The reason is the sentence the stage shows; the provider wrapper's `check` asks the model
// again while attempts remain.
export function checkImagePrompts(text: string, count: number): CheckedImagePrompts {
  const parsed = z.array(z.string()).safeParse(jsonArrayOf(text));
  if (!parsed.success)
    return {
      ok: false,
      reason: `The AI model's image prompts for a short didn't come back in the expected format (a JSON list of prompts). ${fix}`,
    };
  const prompts = parsed.data.map((prompt) => prompt.replace(/\s+/g, " ").trim());
  if (prompts.length !== count)
    return {
      ok: false,
      reason: `The AI model wrote ${String(prompts.length)} image prompts for a short that needs exactly ${String(count)}. ${fix}`,
    };
  if (prompts.some((prompt) => prompt === ""))
    return {
      ok: false,
      reason: `One of the AI model's image prompts for a short is empty. ${fix}`,
    };
  return { ok: true, prompts };
}

function jsonArrayOf(text: string): unknown {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end <= start) return undefined;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return undefined;
  }
}
