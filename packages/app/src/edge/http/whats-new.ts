import { Hono } from "hono";
import { markPatchNotesSeen } from "../../slices/patch-notes/seen.js";
import { dismissWhatsNew, readWhatsNew } from "../../slices/settings/whats-new.js";
import type { AppDeps } from "./app.js";

// Preserve Hono's inferred route types for the web client.
export function whatsNewRoutes(deps: Pick<AppDeps, "db" | "version">) {
  return (
    new Hono()
      .get("/", (c) => c.json(readWhatsNew(deps.db, deps.version)))
      // The tour stands in for the patch notes on a major update (its last step links to
      // them), so closing it also closes this version's notes: never two popups in a row.
      .post("/seen", (c) => {
        const view = dismissWhatsNew(deps.db, deps.version);
        markPatchNotesSeen(deps.db, deps.version);
        return c.json(view);
      })
  );
}
