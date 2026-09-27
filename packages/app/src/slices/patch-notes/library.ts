import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

// The patch notes the app shows in Settings → Patch notes: Markdown files kept in the
// repository's docs/patch-notes/ and copied into the build beside the compiled code
// (scripts/copy-assets.mjs). index.json lists them with a title and a date; each note is
// `<id>.md` beside it. Nothing here writes: the notes are part of the release.

export const patchNoteIdPattern = /^[0-9A-Za-z][0-9A-Za-z.-]{0,63}$/;

const entry = z
  .object({
    id: z.string().regex(patchNoteIdPattern),
    title: z.string().min(1).max(200),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    // The one version a note is for ("3.0.0"), or the stretch it covers ("2.0.1 to 3.0.0").
    version: z.string().max(40).optional(),
    range: z.string().max(80).optional(),
  })
  .strict();
const index = z.array(entry).max(500);

export type PatchNoteSummary = z.infer<typeof entry>;

// dist/patch-notes when running the build; the repository's docs/patch-notes when running
// from source (tests, `tsx`).
export function bundledPatchNotesDir(): string {
  const candidates = ["../../patch-notes/", "../../../../../docs/patch-notes/"].map((path) =>
    fileURLToPath(new URL(path, import.meta.url)),
  );
  return candidates.find((dir) => existsSync(join(dir, "index.json"))) ?? (candidates[0] as string);
}

export class PatchNotesMissing extends Error {}

// Newest first by date; notes of the same day keep the index's order.
export async function listPatchNotes(dir: string): Promise<readonly PatchNoteSummary[]> {
  let raw: string;
  try {
    raw = await readFile(join(dir, "index.json"), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      throw new PatchNotesMissing(
        "This copy of Slopify has no patch notes: its docs/patch-notes/index.json is missing. Reinstall Slopify (or run npm run build) and reload the page.",
      );
    throw error;
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    json = undefined;
  }
  const parsed = index.safeParse(json);
  if (!parsed.success)
    throw new PatchNotesMissing(
      "This copy of Slopify has a damaged patch notes list (docs/patch-notes/index.json). Reinstall Slopify (or fix the file and run npm run build) and reload the page.",
    );
  return parsed.data
    .map((note, order) => ({ note, order }))
    .sort((a, b) => b.note.date.localeCompare(a.note.date) || a.order - b.order)
    .map(({ note }) => note);
}

// A note's Markdown, or undefined when the index does not list it.
export async function readPatchNote(dir: string, id: string): Promise<string | undefined> {
  if (!patchNoteIdPattern.test(id)) return undefined;
  const notes = await listPatchNotes(dir);
  if (!notes.some((note) => note.id === id)) return undefined;
  try {
    return await readFile(join(dir, `${id}.md`), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}
