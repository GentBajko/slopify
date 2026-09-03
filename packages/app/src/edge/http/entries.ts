import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { entryCategories, entryModes } from "../../slices/library/model.js";
import { listEntries } from "../../slices/library/repo.js";
import type { LibraryDeps } from "../../slices/library/save.js";
import { createEntry, removeEntry, updateEntry } from "../../slices/library/save.js";
import type { AppDeps } from "./app.js";
import { onInvalid } from "./problem.js";
// One rule set for prompts and entries, so one refusal mapping too.
import { refused } from "./prompts.js";

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
    .delete("/:id", zValidator("param", idParam, onInvalid), (c) => {
      const result = removeEntry(library, c.req.valid("param").id);
      return result.ok ? c.body(null, 204) : refused(c, result, "entry");
    });
}
