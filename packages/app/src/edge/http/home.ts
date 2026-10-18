import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { snoozeDays } from "../../slices/autopilot/model.js";
import { setWeeklyNotify, snoozeWarning, weeklyNotifyOf } from "../../slices/autopilot/repo.js";
import { autopilotView } from "../../slices/autopilot/signals.js";
import { templateById } from "../../slices/project-templates/repo.js";
import { weekSummary } from "../../slices/run-cost/week.js";
import { markUploaded, setAside } from "../../slices/uploads/repo.js";
import type { AppDeps } from "./app.js";
import { idParam, idString } from "./ids.js";
import { onInvalid, problem } from "./problem.js";

const weekQuery = z.object({
  since: z.iso.datetime({ offset: true }),
  channelId: idString.optional(),
});

// Home's "This week": videos made, spend and the API equivalent since `since` (the browser's
// own Monday), for one channel or all of them, and where each CLI plan's windows stand.
export function homeRoutes(deps: Pick<AppDeps, "db" | "clock" | "catalogue" | "autopilot">) {
  const catalogue = deps.catalogue;
  return (
    new Hono()
      .get("/week", zValidator("query", weekQuery, onInvalid), (c) => {
        const { since, channelId } = c.req.valid("query");
        return c.json(weekSummary(deps.db, new Date(since).toISOString(), channelId));
      })
      // How far ahead the content is and what may stop the schedules, from the database now
      // and the hourly check's last answers: it never asks a CLI or waits for one.
      .get("/autopilot", zValidator("query", channelQuery, onInvalid), (c) =>
        c.json(
          autopilotView(
            {
              db: deps.db,
              clock: deps.clock,
              template: (id) => templateById(deps.db, id),
              ...(catalogue === undefined ? {} : { catalogue: () => catalogue.read() }),
            },
            deps.autopilot?.latest(),
            c.req.valid("query").channelId,
          ),
        ),
      )
      // Hide: the warning stays hidden for a week, or until it changes.
      .post("/autopilot/snooze", zValidator("json", snoozeBody, onInvalid), (c) => {
        const { key } = c.req.valid("json");
        const until = new Date(deps.clock.now().valueOf() + snoozeDays * 24 * 60 * 60_000);
        snoozeWarning(deps.db, key, until);
        return c.json({ key, until: until.toISOString() });
      })
      // Settings → Notifications' Weekly report.
      .get("/autopilot/weekly", (c) => c.json({ enabled: weeklyNotifyOf(deps.db) }))
      .put("/autopilot/weekly", zValidator("json", weeklyBody, onInvalid), (c) => {
        const { enabled } = c.req.valid("json");
        setWeeklyNotify(deps.db, enabled);
        return c.json({ enabled });
      })
  );
}

const channelQuery = z.object({ channelId: idString.optional() });
const snoozeBody = z.object({ key: z.string().min(1).max(300) }).strict();
const weeklyBody = z.object({ enabled: z.boolean() }).strict();

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
              detail: "This project no longer exists. Go back to Projects to pick another.",
            });
          return c.json({ uploadedAt: result.uploadedAt });
        },
      )
  );
}
