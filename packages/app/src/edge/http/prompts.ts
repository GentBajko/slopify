import { zValidator } from "@hono/zod-validator";
import type { Context } from "hono";
import { Hono } from "hono";
import { z } from "zod";
import { promptKinds } from "../../slices/library/model.js";
import { listPrompts } from "../../slices/library/repo.js";
import type { LibraryDeps, SaveFailure } from "../../slices/library/save.js";
import { createPrompt, removePrompt, updatePrompt } from "../../slices/library/save.js";
import type { AppDeps } from "./app.js";
import { onInvalid, problem, titleOf } from "./problem.js";

const idParam = z.object({
  id: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[0-9A-Za-z_-]+$/),
});

// Shape only. The rules - trimming, emptiness, length, the slot lint - are the slice's,
// so one set of messages reaches the editor (03-conventions).
const promptBody = z.object({
  kind: z.enum(promptKinds),
  name: z.string(),
  body: z.string(),
});

// The return type is inferred so Hono keeps the route types the SPA's client is
// generated from; see stagingRoutes.
export function promptRoutes(deps: AppDeps) {
  const library: LibraryDeps = { db: deps.db, ids: deps.ids, clock: deps.clock };

  return (
    new Hono()
      // Every kind in one list: 04 Prompts filters by tab, and Duplicate needs the body it
      // is copying (`logic/15` step 3).
      .get("/", (c) => c.json({ prompts: listPrompts(deps.db) }))
      .post("/", zValidator("json", promptBody, onInvalid), (c) => {
        const result = createPrompt(library, c.req.valid("json"));
        return result.ok ? c.json(result.value, 201) : refused(c, result, "prompt");
      })
      .put(
        "/:id",
        zValidator("param", idParam, onInvalid),
        zValidator("json", promptBody, onInvalid),
        (c) => {
          const result = updatePrompt(library, c.req.valid("param").id, c.req.valid("json"));
          return result.ok ? c.json(result.value) : refused(c, result, "prompt");
        },
      )
      // `logic/15` §Q123: a project holds its own rendered text, so nothing cascades and a
      // template used by past projects is deleted like any other.
      .delete("/:id", zValidator("param", idParam, onInvalid), (c) => {
        const result = removePrompt(library, c.req.valid("param").id);
        return result.ok ? c.body(null, 204) : refused(c, result, "prompt");
      })
  );
}

// One refusal mapping for both libraries: `logic/15` §Q121 puts one rule set over
// prompts and entries, so entryRoutes shares this rather than mirroring it.
export function refused(c: Context, failure: SaveFailure, noun: "prompt" | "entry"): Response {
  switch (failure.reason) {
    case "invalid":
      return problem(c, {
        status: 400,
        title: titleOf(400),
        detail: `This ${noun} cannot be saved; the listed fields need attention.`,
        extensions: { fields: failure.fields },
      });
    // §Q122: the name is refused against a row that exists, and the form marks the field.
    case "duplicate-name":
      return problem(c, {
        status: 409,
        title: titleOf(409),
        detail: `Another ${noun} already has this name.`,
        extensions: {
          fields: [{ field: "name", message: `Another ${noun} already has this name.` }],
        },
      });
    case "not-found":
      return problem(c, {
        status: 404,
        title: titleOf(404),
        detail: `No ${noun} has that id.`,
      });
  }
}
