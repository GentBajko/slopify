import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import {
  readTutorial,
  resetTutorial,
  saveTutorial,
  tutorialWriteSchema,
} from "../../slices/settings/tutorial.js";
import type { AppDeps } from "./app.js";
import { onInvalid, problem, titleOf } from "./problem.js";

// Preserve Hono's inferred route types for the web client.
export function tutorialRoutes(deps: Pick<AppDeps, "db">) {
  return new Hono()
    .get("/", (c) => c.json(readTutorial(deps.db)))
    .put("/", zValidator("json", tutorialWriteSchema, onInvalid), (c) => {
      const result = saveTutorial(deps.db, c.req.valid("json"));
      if (!result.ok)
        return problem(c, {
          status: 409,
          title: titleOf(409),
          detail:
            result.reason === "unreadable"
              ? "Saved tutorial progress cannot be read. Choose Restart tutorial to reset it."
              : "Tutorial progress changed. Reload the saved progress before trying again.",
          extensions: { reason: result.reason },
        });
      return c.json(result.value);
    })
    .delete("/", (c) => {
      resetTutorial(deps.db);
      return c.body(null, 204);
    });
}
