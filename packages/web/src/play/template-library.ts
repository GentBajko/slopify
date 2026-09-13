import type { Entry, Prompt } from "@app/slices/library/model.js";
import type { LibrarySnapshot } from "@app/slices/library/snapshot.js";

export function templateLibrary(
  snapshot: LibrarySnapshot | undefined,
  prompts: readonly Prompt[],
  entries: readonly Entry[],
): { readonly prompts: readonly Prompt[]; readonly entries: readonly Entry[] } {
  const savedPrompts = snapshot?.prompts ?? [];
  const savedEntries = snapshot?.entries ?? [];
  return {
    prompts: [
      ...savedPrompts,
      ...prompts.filter(
        (live) =>
          !savedPrompts.some(
            (saved) =>
              saved.kind === live.kind && saved.name.toLowerCase() === live.name.toLowerCase(),
          ),
      ),
    ],
    entries: [
      ...savedEntries,
      ...entries.filter(
        (live) =>
          !savedEntries.some(
            (saved) =>
              saved.category === live.category &&
              saved.name.toLowerCase() === live.name.toLowerCase(),
          ),
      ),
    ],
  };
}
