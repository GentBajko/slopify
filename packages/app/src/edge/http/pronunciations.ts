import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { collectSharedGlossary } from "../../slices/narration/shared-glossary.js";
import type { AppDeps } from "./app.js";
import { onInvalid } from "./problem.js";

// The pronunciations of every project's glossary, merged, for Edit project to copy into a
// project that shares them. `except` leaves out the project being edited, whose own glossary
// already comes first.
export function pronunciationRoutes(deps: AppDeps) {
  return new Hono().get(
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
  );
}
