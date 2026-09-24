import type { PromptKind } from "@app/slices/library/model.js";
import { promptKinds } from "@app/slices/library/model.js";

export const kindOptions: readonly { readonly value: PromptKind; readonly label: string }[] =
  promptKinds.map((value) => ({ value, label: kindLabel(value) }));

export function kindLabel(kind: PromptKind): string {
  switch (kind) {
    case "article":
      return "Article";
    case "image":
      return "Image";
    case "thumbnail":
      return "Thumbnail";
    case "narration":
      return "Narration Preparation";
  }
}

// A kind read off the URL. Anything else is someone's typing, and Article is the tab the
// screen opens on.
export function kindOf(value: unknown): PromptKind {
  return promptKinds.find((kind) => kind === value) ?? "article";
}
