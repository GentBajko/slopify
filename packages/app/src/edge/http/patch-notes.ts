import { type Context, Hono } from "hono";
import {
  bundledPatchNotesDir,
  PatchNotesMissing,
  readPatchNote,
} from "../../slices/patch-notes/library.js";
import { markPatchNotesSeen, readPatchNotes } from "../../slices/patch-notes/seen.js";
import type { AppDeps } from "./app.js";
import { problem, titleOf } from "./problem.js";

// A build without its notes says so in plain words; anything else is the app's error handler's.
function missing(c: Context, error: unknown): Response {
  if (!(error instanceof PatchNotesMissing)) throw error;
  return problem(c, { status: 500, title: titleOf(500), detail: error.message });
}

// Settings → Patch notes: the list (with which note is due to open by itself), one note's
// Markdown, and recording that the note that opened by itself was closed.
// Preserve Hono's inferred route types for the web client.
export function patchNotesRoutes(deps: Pick<AppDeps, "db" | "version" | "patchNotesDir">) {
  const dir = deps.patchNotesDir ?? bundledPatchNotesDir();
  return new Hono()
    .get("/", async (c) => {
      try {
        return c.json(await readPatchNotes(deps.db, dir, deps.version));
      } catch (error) {
        return missing(c, error);
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
        return missing(c, error);
      }
      if (markdown === undefined)
        return problem(c, {
          status: 404,
          title: titleOf(404),
          detail:
            "These patch notes are not in this version of Slopify. Open Settings → Patch notes and pick one from the list.",
        });
      return c.body(markdown, 200, { "content-type": "text/markdown; charset=utf-8" });
    });
}
