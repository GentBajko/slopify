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

export function snapshotPrompt(
  db: DatabaseSync,
  snapshot: LibrarySnapshot | undefined,
  kind: (typeof promptKinds)[number],
  name: string,
): ReturnType<typeof promptByName> {
  return (
    snapshot?.prompts.find(
      (row) => row.kind === kind && row.name.toLowerCase() === name.toLowerCase(),
    ) ?? promptByName(db, kind, name)
  );
}
export function snapshotEntry(
  db: DatabaseSync,
  snapshot: LibrarySnapshot | undefined,
  category: (typeof entryCategories)[number],
  name: string,
): ReturnType<typeof entryByName> {
  return (
    snapshot?.entries.find(
      (row) => row.category === category && row.name.toLowerCase() === name.toLowerCase(),
    ) ?? entryByName(db, category, name)
  );
}
