import { existsSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { serveStatic } from "@hono/node-server/serve-static";
import type { Context } from "hono";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { Clock } from "../../kernel/clock.js";
import type { Ids } from "../../kernel/ids.js";
import type { Log } from "../../kernel/log.js";
import type { Paths } from "../../kernel/paths.js";
import type { Runner } from "../../kernel/runner/index.js";
import type { Hub } from "../events/hub.js";
import { fileRoutes } from "./files.js";
import { problem, problemFromError, titleOf } from "./problem.js";
import { projectRoutes } from "./projects.js";
import { stagingRoutes } from "./staging.js";
import { telemetryRoutes } from "./telemetry.js";

export interface AppDeps {
  readonly db: DatabaseSync;
  readonly paths: Paths;
  readonly hub: Hub;
  readonly runner: Runner;
  readonly clock: Clock;
  readonly ids: Ids;
  readonly log: Log;
  readonly version: string;
  readonly webDist: string;
  // Asks the telemetry flusher for a delivery attempt. It returns at once and never
  // throws: nothing a route does may wait on the collector (logic/16 step 5).
  readonly flushSoon: () => void;
}

// The type `packages/web` builds its client from: hc<AppType>(...). It widens as the
// context routers of steps S3-S16 are chained onto the api app below.
export type AppType = ReturnType<typeof apiRoutes>;

const notBuilt =
  "The Slopify UI is not built yet. The API is running: try /api/health.\n" +
  "Build the SPA with `npm run build` at the repository root.\n";

function apiRoutes(deps: AppDeps, startedAt: number) {
  return new Hono()
    .get("/health", (c) =>
      c.json({
        status: "ok",
        version: deps.version,
        uptimeMs: deps.clock.now().getTime() - startedAt,
      }),
    )
    .route("/staging", stagingRoutes(deps))
    .route("/projects", projectRoutes(deps))
    .route("/telemetry", telemetryRoutes(deps));
}

export function createApp(deps: AppDeps): Hono {
  const startedAt = deps.clock.now().getTime();

  const app = new Hono()
    .use("*", async (c, next) => {
      c.header("X-Slopify-Version", deps.version);
      await next();
    })
    .onError((error, c) => problemFromError(c, error, deps))
    .notFound(missing)
    .route("/api", apiRoutes(deps, startedAt))
    .get("/api/events/global", (c) =>
      streamSSE(c, (stream) => deps.hub.subscribeGlobal(stream, c.req.raw.signal)),
    )
    .get("/api/events/projects/:id", (c) =>
      streamSSE(c, (stream) => deps.hub.subscribe(c.req.param("id"), stream, c.req.raw.signal)),
    )
    // Files are served by URL, not through the API (02-models Boundaries).
    .route("/", fileRoutes(deps))
    // The API answers for its whole prefix, so an unknown endpoint is a problem+json 404
    // rather than the SPA's index.html with a 200.
    .all("/api/*", missing);

  // ceiling: the SPA directory is looked up once, at boot. The build that fills it runs
  // before the server starts; a server started before its own build needs a restart.
  if (existsSync(deps.webDist)) {
    app.use("/*", serveStatic({ root: deps.webDist }));
    // Client-side routes are not files: anything the SPA owns falls back to its shell.
    app.get("/*", serveStatic({ root: deps.webDist, path: "index.html" }));
  } else {
    app.get("/*", (c) => c.text(notBuilt));
  }

  return app;
}

function missing(c: Context): Response {
  return problem(c, {
    status: 404,
    title: titleOf(404),
    detail: `${c.req.method} ${c.req.path} is not a route of this API.`,
  });
}
