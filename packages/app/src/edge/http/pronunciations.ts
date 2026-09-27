import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { aliasCountMax } from "../../kernel/ports/narration-aliases.js";
import {
  listNarrationAliases,
  saveNarrationAliases,
} from "../../slices/narration/aliases-library.js";
import { collectSharedGlossary } from "../../slices/narration/shared-glossary.js";
import type { AppDeps } from "./app.js";
import { onInvalid, problem, titleOf } from "./problem.js";

// The pronunciations of every project's glossary, merged, for Edit project to copy into a
// project that shares them. `except` leaves out the project being edited, whose own glossary
// already comes first. Library → Aliases lives here too: the other way to change how a word
// is said.
export function pronunciationRoutes(deps: AppDeps) {
  const library = { db: deps.db, ids: deps.ids, clock: deps.clock };
  return (
    new Hono()
      .get(
        "/shared",
        zValidator(
          "query",
          z.object({
            except: z
              .string()
              .max(64)
              .regex(/^[0-9A-Za-z_-]*$/)
              .optional(),
          }),
          onInvalid,
        ),
        (c) => c.json(collectSharedGlossary(deps, c.req.valid("query").except)),
      )
      .get("/aliases", (c) => c.json({ aliases: listNarrationAliases(deps.db) }))
      // The editor saves the whole ordered list at once; each row is checked in the slice, so
      // the editor gets "Alias 3: …" sentences rather than schema paths.
      .put(
        "/aliases",
        zValidator(
          "json",
          z.object({ aliases: z.array(z.unknown()).max(aliasCountMax * 2) }),
          onInvalid,
        ),
        (c) => {
          const result = saveNarrationAliases(library, c.req.valid("json").aliases);
          if (result.ok) return c.json({ aliases: result.aliases });
          return problem(c, {
            status: 400,
            title: titleOf(400),
            detail: `These aliases can't be saved yet: ${result.fields.map((field) => field.message).join(" ")}`,
            extensions: { fields: result.fields },
          });
        },
      )
  );
}
