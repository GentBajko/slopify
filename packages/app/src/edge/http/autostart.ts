import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { AutostartRefusal, type AutostartService } from "../autostart/service.js";
import { onInvalid, problem, titleOf } from "./problem.js";

const body = z.object({ enabled: z.boolean() });

// Settings → General's "Start Slopify when I log in", and the first-run screen's offer of it.
// In Docker the view says whether Docker starts at login, and turning it on or off is refused
// with where Docker's own setting is.
export function autostartRoutes(service: AutostartService | undefined) {
  const unavailable =
    "Starting at login can't be set from this Slopify. Start it with npx @gentbajko/slopify and try Settings → General again.";
  return (
    new Hono()
      .get("/", async (c) => {
        if (service === undefined)
          return problem(c, { status: 404, title: titleOf(404), detail: unavailable });
        c.header("Cache-Control", "no-store");
        return c.json(await service.view());
      })
      .put("/", zValidator("json", body, onInvalid), async (c) => {
        if (service === undefined)
          return problem(c, { status: 404, title: titleOf(404), detail: unavailable });
        try {
          return c.json(await service.set(c.req.valid("json").enabled));
        } catch (error) {
          if (!(error instanceof AutostartRefusal)) throw error;
          return problem(c, { status: 409, title: titleOf(409), detail: error.message });
        }
      })
      // The first-run screen's No thanks: never offer it there again, change nothing.
      .post("/answer", async (c) => {
        if (service === undefined)
          return problem(c, { status: 404, title: titleOf(404), detail: unavailable });
        return c.json(await service.answer());
      })
  );
}
