import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { entryCategories, entryModes, promptKinds } from "./model.js";
import { entryByName, promptByName } from "./repo.js";

const base = z.object({
  id: z.string(),
  name: z.string(),
  body: z.string(),
  slots: z.array(z.string()).readonly(),
  updatedAt: z.string(),
});
export const librarySnapshotSchema = z
  .object({
    prompts: z
      .array(
        base
          .extend({ kind: z.enum(promptKinds) })
          .strict()
          .readonly(),
      )
      .readonly(),
    entries: z
      .array(
        base
          .extend({ category: z.enum(entryCategories), mode: z.enum(entryModes) })
          .strict()
          .readonly(),
      )
      .readonly(),
  })
  .strict()
  .readonly();
export type LibrarySnapshot = z.infer<typeof librarySnapshotSchema>;

// A template names its prompts and intros/outros; the Library's current one of that name is
// what a run from it uses, so editing a prompt reaches every template and schedule that names
// it. The copy the template saved is only the fallback for one since deleted or renamed, so a
// template never stops working because its Library changed.
export function snapshotPrompt(
  db: DatabaseSync,
  snapshot: LibrarySnapshot | undefined,
  kind: (typeof promptKinds)[number],
  name: string,
): ReturnType<typeof promptByName> {
  return (
    promptByName(db, kind, name) ??
    snapshot?.prompts.find(
      (row) => row.kind === kind && row.name.toLowerCase() === name.toLowerCase(),
    )
  );
}
export function snapshotEntry(
  db: DatabaseSync,
  snapshot: LibrarySnapshot | undefined,
  category: (typeof entryCategories)[number],
  name: string,
): ReturnType<typeof entryByName> {
  return (
    entryByName(db, category, name) ??
    snapshot?.entries.find(
      (row) => row.category === category && row.name.toLowerCase() === name.toLowerCase(),
    )
  );
}
