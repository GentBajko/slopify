import { zValidator } from "@hono/zod-validator";
import type { Context } from "hono";
import { Hono } from "hono";
import { z } from "zod";
import { versionsOrCurrent } from "../../slices/library/history.js";
import { promptKinds } from "../../slices/library/model.js";
import {
  setPromptPhotorealistic,
  withPhotorealistic,
} from "../../slices/library/photorealistic.js";
import { formerNames } from "../../slices/library/rename.js";
import { listPrompts, promptById } from "../../slices/library/repo.js";
import type { LibraryDeps, SaveFailure } from "../../slices/library/save.js";
import {
  createPrompt,
  removePrompt,
  restorePrompt,
  updatePrompt,
} from "../../slices/library/save.js";
import { usedBy } from "../../slices/library/used-by.js";
import type { AppDeps } from "./app.js";
import { onInvalid, problem, titleOf } from "./problem.js";

const idParam = z.object({
  id: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[0-9A-Za-z_-]+$/),
});

// History's Restore names the version by its number.
export const versionParam = idParam.extend({ version: z.coerce.number().int().positive() });

// Shape only. The rules - trimming, emptiness, length, the slot lint - are the slice's,
// so one set of messages reaches the editor.
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
      // is copying.
      .get("/", (c) => c.json({ prompts: withPhotorealistic(deps.db, listPrompts(deps.db)) }))
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
      // An Image prompt's "Draws photorealistic pictures" tick (`slices/library/photorealistic.ts`).
      .put(
        "/:id/photorealistic",
        zValidator("param", idParam, onInvalid),
        zValidator("json", z.object({ photorealistic: z.boolean() }), onInvalid),
        (c) => {
          const result = setPromptPhotorealistic(
            deps.db,
            c.req.valid("param").id,
            c.req.valid("json").photorealistic,
          );
          if (result.ok) return c.body(null, 204);
          return result.reason === "not-found"
            ? refused(c, { ok: false, reason: "not-found" }, "prompt")
            : problem(c, {
                status: 400,
                title: titleOf(400),
                detail:
                  "Only an Image prompt can be marked photorealistic. Open the prompt from the Image tab in Library → Prompts.",
              });
        },
      )
      // Every saved version, newest first (`slices/library/history.ts`).
      .get("/:id/history", zValidator("param", idParam, onInvalid), (c) => {
        const prompt = promptById(deps.db, c.req.valid("param").id);
        return prompt === undefined
          ? refused(c, { ok: false, reason: "not-found" }, "prompt")
          : c.json({ versions: versionsOrCurrent(deps.db, "prompt", prompt) });
      })
      .post("/:id/history/:version/restore", zValidator("param", versionParam, onInvalid), (c) => {
        const { id, version } = c.req.valid("param");
        const result = restorePrompt(library, id, version);
        return result.ok ? c.json(result.value) : refused(c, result, "prompt");
      })
      // The templates, schedules and projects that name it.
      .get("/:id/used-by", zValidator("param", idParam, onInvalid), (c) => {
        const prompt = promptById(deps.db, c.req.valid("param").id);
        return prompt === undefined
          ? refused(c, { ok: false, reason: "not-found" }, "prompt")
          : c.json(
              usedBy(
                deps.db,
                { item: "prompt", kind: prompt.kind, name: prompt.name },
                formerNames(deps.db, "prompt", prompt.id, prompt.name),
              ),
            );
      })
      // A project holds its own rendered text, so nothing cascades and a
      // template used by past projects is deleted like any other.
      .delete("/:id", zValidator("param", idParam, onInvalid), (c) => {
        const result = removePrompt(library, c.req.valid("param").id);
        return result.ok ? c.body(null, 204) : refused(c, result, "prompt");
      })
  );
}

// One refusal mapping for both libraries: prompts and entries share one rule set, so
// entryRoutes reuses this rather than mirroring it.
export function refused(c: Context, failure: SaveFailure, noun: "prompt" | "entry"): Response {
  switch (failure.reason) {
    case "invalid":
      return problem(c, {
        status: 400,
        title: titleOf(400),
        detail: `This ${noun} cannot be saved yet. Fix the highlighted fields and try again.`,
        extensions: { fields: failure.fields },
      });
    // The name is refused against a row that exists, and the form marks the field.
    case "duplicate-name":
      return problem(c, {
        status: 409,
        title: titleOf(409),
        detail: `Another ${noun} already has this name. Choose a different name.`,
        extensions: {
          fields: [
            {
              field: "name",
              message: `Another ${noun} already has this name. Choose a different name.`,
            },
          ],
        },
      });
    case "not-found":
      return problem(c, {
        status: 404,
        title: titleOf(404),
        detail: `This ${noun} no longer exists; it may have been deleted. Go back to the Library to pick another.`,
      });
  }
}
