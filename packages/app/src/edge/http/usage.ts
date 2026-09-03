import { Hono } from "hono";
import { allTelemetryEvents, machineOf } from "../../slices/telemetry/repo.js";
import { usageOf } from "../../slices/telemetry/usage.js";
import type { AppDeps } from "./app.js";

// The data behind the Usage screen: the five counters, the "Tokens by stage" table, and the
// machine id with the app version. All of it is computed from the local event log,
// independent of delivery, so this route never touches the collector and answers just as
// well offline.

// The return type is inferred so Hono keeps the route types the SPA's client is
// generated from; see stagingRoutes.
export function usageRoutes(deps: AppDeps) {
  return new Hono().get("/", (c) =>
    c.json(
      usageOf({
        events: allTelemetryEvents(deps.db),
        // The machine id is shown on this page and goes no further: the server is bound to
        // loopback and the SPA reading it is this machine's own. Nothing puts it in a
        // payload - the collector is told it once, in the envelope.
        machineId: machineOf(deps.db)?.machineId ?? null,
        appVersion: deps.version,
      }),
    ),
  );
}
