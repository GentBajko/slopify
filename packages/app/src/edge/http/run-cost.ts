import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { runCostOf } from "../../slices/run-cost/panel.js";
import type { AppDeps } from "./app.js";
import { onInvalid, problem, titleOf } from "./problem.js";

const idParam = z.object({ id: z.string().min(1).max(64) });

// The project's Run cost tab and its "Waiting for … limits" line: what the run's provider
// calls used and cost, and any CLI plan limit a stage is waiting on. Read from the stored
// calls alone; nothing here reaches a provider.
//
// The return type is inferred so Hono keeps the route types the SPA's client is generated
// from; see stagingRoutes.
export function runCostRoutes(deps: AppDeps) {
  return new Hono().get("/:id/run-cost", zValidator("param", idParam, onInvalid), (c) => {
    const id = c.req.valid("param").id;
    if (deps.db.prepare("SELECT 1 FROM projects WHERE id = ?").get(id) === undefined)
      return problem(c, {
        status: 404,
        title: titleOf(404),
        detail: "This project no longer exists. Go back to Projects to pick another.",
      });
    return c.json(runCostOf(deps.db, id));
  });
}
