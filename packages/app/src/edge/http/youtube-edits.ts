import { zValidator } from "@hono/zod-validator";
import type { Context } from "hono";
import { Hono } from "hono";
import { z } from "zod";
import { transact } from "../../kernel/db/tx.js";
import { projectExists } from "../../slices/admission/repo.js";
import { descriptionFields, withEdit, withoutEdit } from "../../slices/youtube/edits.js";
import { readDescriptionEdits, writeDescriptionEdits } from "../../slices/youtube/edits-repo.js";
import { descriptionMaxCharacters } from "../../slices/youtube/model.js";
import { channelLinksProblem } from "../../slices/youtube/placeholders.js";
import type { AppDeps } from "./app.js";
import { onInvalid, problem, titleOf } from "./problem.js";
import { channelLinksBody } from "./settings.js";

const idParam = z.object({ id: z.string().min(1).max(64) });
const fieldParam = idParam.extend({ field: z.enum(descriptionFields) });
// A field is at most a description long; the bound keeps a pasted novel off the table, and
// YouTube's own limit is shown beside the field rather than refused here.
const fieldBody = z.object({
  text: z.string().max(descriptionMaxCharacters * 4),
  base: z.string().max(descriptionMaxCharacters * 4),
});

const gone = "This project no longer exists. Go back to Projects to pick another.";

// The project page's hand edits to the YouTube description (`slices/youtube/edits.ts`). The
// server keeps them; the page applies the merge rules to the text it shows.
export function youtubeEditRoutes(deps: AppDeps) {
  const exists = (id: string) => projectExists(deps.db, id);
  const missing = (c: Context) => problem(c, { status: 404, title: titleOf(404), detail: gone });
  const now = () => deps.clock.now().toISOString();

  return (
    new Hono()
      .get("/:id/youtube-edits", zValidator("param", idParam, onInvalid), (c) => {
        const { id } = c.req.valid("param");
        return exists(id) ? c.json(readDescriptionEdits(deps.db, id)) : missing(c);
      })
      // Saves the user's text for one field with the generated text it was edited from; text
      // equal to that generated text clears the edit. "Keep mine" is this call with the new
      // generated text as the base.
      .put(
        "/:id/youtube-edits/fields/:field",
        zValidator("param", fieldParam, onInvalid),
        zValidator("json", fieldBody, onInvalid),
        (c) => {
          const { id, field } = c.req.valid("param");
          if (!exists(id)) return missing(c);
          const { text, base } = c.req.valid("json");
          const saved = transact(deps.db, () => {
            const current = readDescriptionEdits(deps.db, id);
            const next = { ...current, fields: withEdit(current.fields, field, text, base) };
            writeDescriptionEdits(deps.db, id, next, now());
            return next;
          });
          return c.json(saved);
        },
      )
      // "Use it": the field follows the generated text again.
      .delete(
        "/:id/youtube-edits/fields/:field",
        zValidator("param", fieldParam, onInvalid),
        (c) => {
          const { id, field } = c.req.valid("param");
          if (!exists(id)) return missing(c);
          const saved = transact(deps.db, () => {
            const current = readDescriptionEdits(deps.db, id);
            const next = { ...current, fields: withoutEdit(current.fields, field) };
            writeDescriptionEdits(deps.db, id, next, now());
            return next;
          });
          return c.json(saved);
        },
      )
      // The project's own links, such as its "Previous video"; they win over Settings' list.
      .put(
        "/:id/youtube-edits/links",
        zValidator("param", idParam, onInvalid),
        zValidator("json", channelLinksBody, onInvalid),
        (c) => {
          const { id } = c.req.valid("param");
          if (!exists(id)) return missing(c);
          const links = c.req
            .valid("json")
            .links.map((link) => ({ name: link.name.trim(), url: link.url.trim() }));
          const refused = channelLinksProblem(links);
          if (refused !== undefined)
            return problem(c, {
              status: 400,
              title: titleOf(400),
              detail: `This project's links weren't saved: ${refused} Then press Save links under YouTube on the Video section.`,
            });
          const saved = transact(deps.db, () => {
            const next = { ...readDescriptionEdits(deps.db, id), links };
            writeDescriptionEdits(deps.db, id, next, now());
            return next;
          });
          return c.json(saved);
        },
      )
  );
}
