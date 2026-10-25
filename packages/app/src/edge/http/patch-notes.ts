import { Hono } from "hono";
import {
  bundledPatchNotesDir,
  PatchNotesMissing,
  readPatchNote,
} from "../../slices/patch-notes/library.js";
import { markPatchNotesSeen, readPatchNotes } from "../../slices/patch-notes/seen.js";
import type { AppDeps } from "./app.js";
import { problem } from "./problem.js";
import { bundleMissing } from "./refusal.js";

// Settings → What's new: the list (with which note is due to open by itself), one note's
// Markdown, and recording that the note that opened by itself was closed.
// Preserve Hono's inferred route types for the web client.
export function patchNotesRoutes(deps: Pick<AppDeps, "db" | "version" | "patchNotesDir">) {
  const dir = deps.patchNotesDir ?? bundledPatchNotesDir();
  return new Hono()
    .get("/", async (c) => {
      try {
        return c.json(await readPatchNotes(deps.db, dir, deps.version));
      } catch (error) {
        return bundleMissing(c, error, PatchNotesMissing);
      }
    })
    .post("/seen", (c) => {
      markPatchNotesSeen(deps.db, deps.version);
      return c.json({ seen: true });
    })
    .get("/:id", async (c) => {
      let markdown: string | undefined;
      try {
        markdown = await readPatchNote(dir, c.req.param("id"));
      } catch (error) {
        return bundleMissing(c, error, PatchNotesMissing);
      }
      if (markdown === undefined)
        return problem(c, {
          status: 404,
          detail:
            "These patch notes are not in this version of Slopify. Open Settings → What's new and pick one from the list.",
        });
      return c.body(markdown, 200, { "content-type": "text/markdown; charset=utf-8" });
    });
}
