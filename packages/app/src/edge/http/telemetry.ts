import { Hono } from "hono";
import { dismissNotice, noticeSeen } from "../../slices/telemetry/machine.js";
import type { TelemetryDeps } from "../../slices/telemetry/record.js";
import type { AppDeps } from "./app.js";

// The return type is inferred so Hono keeps the route types the SPA's client is
// generated from; see stagingRoutes.
export function telemetryRoutes(deps: AppDeps) {
  const telemetry: TelemetryDeps = {
    db: deps.db,
    ids: deps.ids,
    clock: deps.clock,
    log: deps.log,
    appVersion: deps.version,
  };

  return (
    new Hono()
      // What the SPA asks before it shows the first-run notice. The app version comes with it
      // because the notice names the version that goes out in every report, and the promise has
      // to be made with the number it is true of.
      .get("/notice", (c) => c.json({ seen: noticeSeen(deps.db), appVersion: deps.version }))
      // "Got it" is the only control on that modal, and pressing it is what creates the machine
      // id. Idempotent: a second press, a reload or a second tab finds the machine already
      // there and mints nothing.
      .post("/notice", (c) => {
        dismissNotice(telemetry);
        deps.flushSoon();
        // The machine id stays on this machine. Nothing needs it here, so nothing sends
        // it back out of the process that made it.
        return c.json({ seen: true, appVersion: deps.version });
      })
  );
}
