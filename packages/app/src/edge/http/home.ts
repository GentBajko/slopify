import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { weekSummary } from "../../slices/run-cost/week.js";
import { markUploaded, setAside } from "../../slices/uploads/repo.js";
import type { AppDeps } from "./app.js";
import { onInvalid, problem, titleOf } from "./problem.js";

const weekQuery = z.object({
  since: z.iso.datetime({ offset: true }),
  channelId: z.string().min(1).max(64).optional(),
});

// Home's "This week": videos made, spend and the API equivalent since `since` (the browser's
// own Monday), for one channel or all of them, and where each CLI plan's windows stand.
export function homeRoutes(deps: Pick<AppDeps, "db">) {
  return new Hono().get("/week", zValidator("query", weekQuery, onInvalid), (c) => {
    const { since, channelId } = c.req.valid("query");
    return c.json(weekSummary(deps.db, new Date(since).toISOString(), channelId));
  });
}

const idParam = z.object({
  id: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[0-9A-Za-z_-]+$/),
});

// Home's "Mark uploaded" and its undo. Slopify never uploads, so this only records what the
// person says they did.
export function uploadedRoutes(deps: Pick<AppDeps, "db" | "clock">) {
  return (
    new Hono()
      // Needs you's "Keep as is" and its undo.
      .put(
        "/:id/set-aside",
        zValidator("param", idParam, onInvalid),
        zValidator("json", z.object({ setAside: z.boolean() }).strict(), onInvalid),
        (c) => {
          const result = setAside(
            deps.db,
            c.req.valid("param").id,
            c.req.valid("json").setAside,
            deps.clock.now().toISOString(),
          );
          if (!result.ok)
            return problem(c, {
              status: 404,
              title: titleOf(404),
              detail: "This project no longer exists. Go back to Projects to pick another.",
            });
          return c.json({ setAside: c.req.valid("json").setAside });
        },
      )
      .put(
        "/:id/uploaded",
        zValidator("param", idParam, onInvalid),
        zValidator("json", z.object({ uploaded: z.boolean() }).strict(), onInvalid),
        (c) => {
          const result = markUploaded(
            deps.db,
            c.req.valid("param").id,
            c.req.valid("json").uploaded,
            deps.clock.now().toISOString(),
          );
          if (!result.ok)
            return problem(c, {
              status: 404,
              title: titleOf(404),
              detail: "This project no longer exists. Go back to Projects to pick another.",
            });
          return c.json({ uploadedAt: result.uploadedAt });
        },
      )
  );
}
