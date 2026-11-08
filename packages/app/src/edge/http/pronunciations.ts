import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { aliasCountMax } from "../../kernel/ports/narration-aliases.js";
import {
  listNarrationAliases,
  saveNarrationAliases,
} from "../../slices/narration/aliases-library.js";
import { libraryPronunciationsMax } from "../../slices/narration/pronunciation.js";
import {
  readLibraryPronunciations,
  saveLibraryPronunciations,
} from "../../slices/narration/pronunciations-library.js";
import { collectSharedGlossary } from "../../slices/narration/shared-glossary.js";
import { actorOf } from "./actor.js";
import type { AppDeps } from "./app.js";
import { onInvalid, problem } from "./problem.js";

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
      // Name pronunciations, the other half of the same page: one glossary of your own, whose
      // names come before the glossary each article writes. Saved whole, like the aliases; the
      // reply says what narration makes of it.
      .get("/library", (c) => c.json(readLibraryPronunciations(deps.db)))
      // `version` is the list the save was made from, as the read above gives it. Once a list
      // exists a save without it, or from an older one, is refused with the list as it stands,
      // so a second window or an agent can't quietly replace what somebody wrote.
      .put(
        "/library",
        zValidator(
          "json",
          z.object({
            text: z.string().max(libraryPronunciationsMax),
            version: z.string().max(64).optional(),
          }),
          onInvalid,
        ),
        (c) => {
          const body = c.req.valid("json");
          const result = saveLibraryPronunciations(deps, body.text, body.version, actorOf(c));
          if (result.ok) return c.json(result.list);
          if (result.reason === "conflict")
            return problem(c, {
              status: 409,
              detail: result.detail,
              extensions: { current: result.current },
            });
          return problem(c, { status: 400, detail: result.detail });
        },
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
            detail: `These aliases can't be saved yet: ${result.fields.map((field) => field.message).join(" ")}`,
            extensions: { fields: result.fields },
          });
        },
      )
  );
}
