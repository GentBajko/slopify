import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { versionsOrCurrent } from "../../slices/library/history.js";
import { entryCategories, entryModes } from "../../slices/library/model.js";
import { formerNames } from "../../slices/library/rename.js";
import { entryById, listEntries } from "../../slices/library/repo.js";
import type { LibraryDeps } from "../../slices/library/save.js";
import { createEntry, removeEntry, restoreEntry, updateEntry } from "../../slices/library/save.js";
import { usedBy } from "../../slices/library/used-by.js";
import type { AppDeps } from "./app.js";
import { onInvalid } from "./problem.js";
// One rule set for prompts and entries, so one refusal mapping too.
import { refused, versionParam } from "./prompts.js";

const idParam = z.object({
  id: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[0-9A-Za-z_-]+$/),
});

const entryBody = z.object({
  category: z.enum(entryCategories),
  mode: z.enum(entryModes),
  name: z.string(),
  body: z.string(),
});

// The return type is inferred so Hono keeps the route types the SPA's client is
// generated from; see stagingRoutes.
export function entryRoutes(deps: AppDeps) {
  const library: LibraryDeps = { db: deps.db, ids: deps.ids, clock: deps.clock };

  return new Hono()
    .get("/", (c) => c.json({ entries: listEntries(deps.db) }))
    .post("/", zValidator("json", entryBody, onInvalid), (c) => {
      const result = createEntry(library, c.req.valid("json"));
      return result.ok ? c.json(result.value, 201) : refused(c, result, "entry");
    })
    .put(
      "/:id",
      zValidator("param", idParam, onInvalid),
      zValidator("json", entryBody, onInvalid),
      (c) => {
        const result = updateEntry(library, c.req.valid("param").id, c.req.valid("json"));
        return result.ok ? c.json(result.value) : refused(c, result, "entry");
      },
    )
    .get("/:id/history", zValidator("param", idParam, onInvalid), (c) => {
      const entry = entryById(deps.db, c.req.valid("param").id);
      return entry === undefined
        ? refused(c, { ok: false, reason: "not-found" }, "entry")
        : c.json({ versions: versionsOrCurrent(deps.db, "entry", entry) });
    })
    .post("/:id/history/:version/restore", zValidator("param", versionParam, onInvalid), (c) => {
      const { id, version } = c.req.valid("param");
      const result = restoreEntry(library, id, version);
      return result.ok ? c.json(result.value) : refused(c, result, "entry");
    })
    .get("/:id/used-by", zValidator("param", idParam, onInvalid), (c) => {
      const entry = entryById(deps.db, c.req.valid("param").id);
      return entry === undefined
        ? refused(c, { ok: false, reason: "not-found" }, "entry")
        : c.json(
            usedBy(
              deps.db,
              { item: "entry", category: entry.category, name: entry.name },
              formerNames(deps.db, "entry", entry.id, entry.name),
            ),
          );
    })
    .delete("/:id", zValidator("param", idParam, onInvalid), (c) => {
      const result = removeEntry(library, c.req.valid("param").id);
      return result.ok ? c.body(null, 204) : refused(c, result, "entry");
    });
}
