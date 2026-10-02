import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { readSetting, writeSetting } from "../settings/repo.js";
import type { PackFile } from "./model.js";

// Which of the video's titles and thumbnails go into the upload (Prepare upload's choice).
// Its A/B test starts once the video is public, so the upload carries one title and one
// thumbnail, and the test then tries the others beside them. Indexes into the project's own
// order: title 0 is the project's title, 1 and 2 its other titles; thumbnail 0 is A.

export interface UploadPick {
  readonly title: number;
  readonly thumbnail: number;
}

const pickSchema = z.object({
  title: z.number().int().min(0).max(9),
  thumbnail: z.number().int().min(0).max(9),
});

const keyOf = (projectId: string) => `studio.uploadPick.${projectId}`;

export function readUploadPick(db: DatabaseSync, projectId: string): UploadPick {
  const stored = readSetting(db, keyOf(projectId));
  if (stored === undefined) return { title: 0, thumbnail: 0 };
  try {
    const parsed = pickSchema.safeParse(JSON.parse(stored));
    return parsed.success ? parsed.data : { title: 0, thumbnail: 0 };
  } catch {
    return { title: 0, thumbnail: 0 };
  }
}

export function writeUploadPick(db: DatabaseSync, projectId: string, pick: UploadPick): void {
  writeSetting(db, keyOf(projectId), JSON.stringify(pickSchema.parse(pick)));
}

// The chosen title first, the others after it in their order; the same for the thumbnails. A
// pick past the end (a title list rewritten shorter) falls back to the first.
export function picked(
  titles: readonly string[],
  thumbnails: readonly PackFile[],
  pick: UploadPick,
): { readonly titles: readonly string[]; readonly thumbnails: readonly PackFile[] } {
  const first = <T>(list: readonly T[], at: number): readonly T[] => {
    const index = at < list.length ? at : 0;
    const chosen = list[index];
    return chosen === undefined ? list : [chosen, ...list.filter((_, one) => one !== index)];
  };
  return { titles: first(titles, pick.title), thumbnails: first(thumbnails, pick.thumbnail) };
}
