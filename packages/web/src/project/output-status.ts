import type { OutputRole } from "@app/slices/storage/model.js";
import { outdatedGroupOf } from "./next-action.js";

// What an outdated file was made from, in words, so its state never rests on a colour or a
// bare "Outdated": "Uses the previous text". Said beside the file and on its download. A
// picture is outdated for many reasons (its prompt, the look, or a press of Make this image
// again), so it says only what is sure: it is older than the last change.
const madeFrom: Readonly<Record<string, string>> = {
  article: "Written from the previous brief, sources or prompt",
  narration: "Uses the previous text",
  reference: "Older than your last change",
  images: "Older than your last change",
  animated: "Uses the previous image",
  thumbnails: "Older than your last change",
  video: "Uses the previous narration, images or settings",
  shorts: "Uses the previous video",
  youtube: "Uses the previous article",
  document: "Uses the previous article",
};

export function outdatedWords(role: OutputRole): string {
  return madeFrom[outdatedGroupOf(role) ?? ""] ?? "Made before your last change";
}

// One saved file's state as a sentence: current, older, waiting for a review, or missing.
export function outputStateWords(
  state: "ready" | "outdated" | "review",
  role: OutputRole,
  available: boolean,
): string {
  if (!available) return "File missing: make it again from its section";
  switch (state) {
    case "ready":
      return "Current";
    case "outdated":
      return `${outdatedWords(role)}; kept until you make it again`;
    case "review":
      return "Provided content needs your review";
  }
}
