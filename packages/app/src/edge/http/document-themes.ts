import { zValidator } from "@hono/zod-validator";
import { type Context, Hono } from "hono";
import { z } from "zod";
import {
  createDocumentTheme,
  type DocumentThemeDeps,
  type DocumentThemeResult,
  listDocumentThemes,
  removeDocumentTheme,
  updateDocumentTheme,
} from "../../slices/document/library.js";
import { documentThemeLabels, documentThemes } from "../../slices/document/model.js";
import { renderSampleDocument } from "../../slices/document/sample.js";
import { builtInTheme, resolveTheme } from "../../slices/document/theme.js";
import { documentThemeSchema } from "../../slices/document/theme-schema.js";
import type { AppDeps } from "./app.js";
import { onInvalid, problem, titleOf } from "./problem.js";

const idParam = z.object({
  id: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[0-9A-Za-z_-]+$/),
});

// Shape only: the values' ranges are the slice's, so the editor gets field-by-field sentences.
const themeBody = z.object({ name: z.string(), values: z.unknown() });

// Library → Documents. The return type is inferred so Hono keeps the route types the SPA's
// client is generated from; see stagingRoutes.
export function documentThemeRoutes(deps: AppDeps) {
  const library: DocumentThemeDeps = { db: deps.db, ids: deps.ids, clock: deps.clock };
  return (
    new Hono()
      // The built-ins come with their values, so Duplicate starts from them.
      .get("/", (c) =>
        c.json({
          builtIns: documentThemes.map((name) => ({
            name,
            label: documentThemeLabels[name],
            values: builtInTheme(name),
          })),
          themes: listDocumentThemes(deps.db),
        }),
      )
      .post("/", zValidator("json", themeBody, onInvalid), (c) => {
        const result = createDocumentTheme(library, c.req.valid("json"));
        return result.ok ? c.json(result.value, 201) : refused(c, result);
      })
      .put(
        "/:id",
        zValidator("param", idParam, onInvalid),
        zValidator("json", themeBody, onInvalid),
        (c) => {
          const result = updateDocumentTheme(library, c.req.valid("param").id, c.req.valid("json"));
          return result.ok ? c.json(result.value) : refused(c, result);
        },
      )
      // A project keeps its own copy of a theme's values, so nothing cascades.
      .delete("/:id", zValidator("param", idParam, onInvalid), (c) => {
        const result = removeDocumentTheme(library, c.req.valid("param").id);
        return result.ok ? c.body(null, 204) : refused(c, result);
      })
      // The editor's live preview: the sample article laid out with unsaved values.
      .post(
        "/preview",
        zValidator("json", z.object({ values: documentThemeSchema }), onInvalid),
        (c) => {
          const rendered = renderSampleDocument(resolveTheme(c.req.valid("json").values));
          return c.body(rendered.bytes.slice().buffer, 200, {
            "Content-Type": "application/pdf",
            "Cache-Control": "no-store",
          });
        },
      )
  );
}

function refused(
  c: Context,
  failure: Extract<DocumentThemeResult<never>, { ok: false }>,
): Response {
  switch (failure.reason) {
    case "invalid":
      return problem(c, {
        status: 400,
        title: titleOf(400),
        detail: "This theme can't be saved yet. Fix the highlighted settings and try again.",
        extensions: { fields: failure.fields },
      });
    case "duplicate-name": {
      const message = "Another document theme already has this name. Choose a different name.";
      return problem(c, {
        status: 409,
        title: titleOf(409),
        detail: message,
        extensions: { fields: [{ field: "name", message }] },
      });
    }
    case "not-found":
      return problem(c, {
        status: 404,
        title: titleOf(404),
        detail:
          "This document theme no longer exists; it may have been deleted in another tab. Go back to Library → Documents.",
      });
  }
}
