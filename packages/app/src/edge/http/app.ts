import { existsSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { serveStatic } from "@hono/node-server/serve-static";
import type { Context } from "hono";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { CatalogueStore } from "../../catalog/store.js";
import type { AudioPreviewStore } from "../../kernel/audio-preview.js";
import type { Clock } from "../../kernel/clock.js";
import type { Ids } from "../../kernel/ids.js";
import type { Log } from "../../kernel/log.js";
import type { Paths } from "../../kernel/paths.js";
import type { ModelInfo, ProviderFamily } from "../../kernel/ports/model.js";
import type { Runner } from "../../kernel/runner/index.js";
import type { DraftStartDeps } from "../../slices/play-drafts/model.js";
import type { RebuildDeps } from "../../slices/rebuild/service.js";
import type { ScheduleDeps } from "../../slices/schedules/model.js";
import type { CliProbe } from "../../slices/settings/cli-status.js";
import type { AppUpdater } from "../../updater/model.js";
import type { Hub } from "../events/hub.js";
import { actionRoutes } from "./actions.js";
import { audioPreviewRoutes } from "./audio-preview.js";
import { checkpointRoutes } from "./checkpoints.js";
import { diagnosticsRoutes } from "./diagnostics.js";
import { draftRoutes } from "./drafts.js";
import { entryRoutes } from "./entries.js";
import { fileRoutes } from "./files.js";
import { fontsRoutes } from "./fonts.js";
import type { MutationLifecycle } from "./mutations.js";
import { openFolderRoutes } from "./open-folder.js";
import { planningRoutes } from "./planning.js";
import { problem, problemFromError, titleOf } from "./problem.js";
import { projectTemplateRoutes } from "./project-templates.js";
import { projectRoutes } from "./projects.js";
import { promptRoutes } from "./prompts.js";
import { providerRoutes } from "./providers.js";
import { revisionFileRoutes, revisionFolderRoutes } from "./revision-files.js";
import { revisionRoutes } from "./revisions.js";
import { scheduleRoutes } from "./schedules.js";
import { settingsRoutes } from "./settings.js";
import { stagingRoutes } from "./staging.js";
import { storageRoutes } from "./storage.js";
import { subtitleRoutes } from "./subtitles.js";
import { telemetryRoutes } from "./telemetry.js";
import { tutorialRoutes } from "./tutorial.js";
import { updateRoutes } from "./update.js";
import { usageRoutes } from "./usage.js";

export interface AppDeps {
  readonly drafts?: DraftStartDeps;
  readonly schedules?: ScheduleDeps;
  readonly rebuild?: RebuildDeps;
  readonly measureAudio?: ((path: string, signal?: AbortSignal) => Promise<number>) | undefined;
  readonly openFolder?: (path: string) => Promise<void>;
  readonly catalogue?: CatalogueStore;
  readonly updater?: AppUpdater;
  readonly mutations?: Pick<MutationLifecycle, "begin">;
  readonly audioPreviews?: AudioPreviewStore;
  readonly db: DatabaseSync;
  readonly paths: Paths;
  readonly hub: Hub;
  readonly runner: Runner;
  readonly modelsFor?: (provider: string, family: ProviderFamily) => Promise<readonly ModelInfo[]>;
  readonly fallbackModelsFor?: (provider: string) => readonly ModelInfo[];
  readonly clock: Clock;
  readonly ids: Ids;
  readonly log: Log;
  readonly version: string;
  readonly webDist: string;
  // Runs a local agent CLI to learn whether it is installed. Handed in so a test can answer for
  // both branches without depending on this machine's PATH.
  readonly probe: CliProbe;
  // Asks the telemetry flusher for a delivery attempt. It returns at once and never
  // throws: nothing a route does may wait on the collector.
  readonly flushSoon: () => void;
}

// The type `packages/web` builds its client from: hc<AppType>(...). It widens as the
// context routers are chained onto the api app below.
export type AppType = ReturnType<typeof apiRoutes>;

const notBuilt =
  "The Slopify UI is not built yet. The API is running: try /api/health.\n" +
  "Build the SPA with `npm run build` at the repository root.\n";

function apiRoutes(deps: AppDeps, startedAt: number) {
  return (
    new Hono()
      .get("/health", (c) =>
        c.json({
          status: "ok",
          version: deps.version,
          uptimeMs: deps.clock.now().getTime() - startedAt,
        }),
      )
      .route("/staging", stagingRoutes(deps))
      .route("/storage", storageRoutes(deps))
      .route("/drafts", draftRoutes(deps.drafts))
      .route("/diagnostics", diagnosticsRoutes(deps))
      .route("/project-templates", projectTemplateRoutes(deps.drafts))
      .route("/schedules", scheduleRoutes(deps.schedules))
      .route("/projects", planningRoutes(deps))
      .route("/projects", projectRoutes(deps))
      .route("/projects", checkpointRoutes(deps))
      .route("/projects", revisionRoutes(deps))
      .route("/projects", revisionFolderRoutes(deps))
      .route("/projects", openFolderRoutes(deps))
      .route("/projects", audioPreviewRoutes(deps))
      .route("/update", updateRoutes(deps))
      // The re-run and cancel actions sit on the same prefix as the project itself; they
      // are their own router because they are their own concern.
      .route("/projects", actionRoutes(deps))
      .route("/projects", subtitleRoutes(deps))
      .route("/fonts", fontsRoutes(deps))
      .route("/prompts", promptRoutes(deps))
      .route("/entries", entryRoutes(deps))
      .route("/telemetry", telemetryRoutes(deps))
      .route("/usage", usageRoutes(deps))
      .route("/settings", settingsRoutes(deps))
      .route("/tutorial", tutorialRoutes(deps))
      .route("/providers", providerRoutes(deps))
  );
}

export function createApp(deps: AppDeps): Hono {
  const startedAt = deps.clock.now().getTime();

  const app = new Hono()
    .use("*", async (c, next) => {
      // A provisional candidate must not trigger the stale-tab Reload dialog.
      if (!deps.updater?.locked()) c.header("X-Slopify-Version", deps.version);
      await next();
    })
    .use("/api/*", async (c, next) => {
      if (["GET", "HEAD", "OPTIONS"].includes(c.req.method)) return next();
      const releaseRequest = deps.mutations?.begin();
      if (deps.mutations !== undefined && releaseRequest === undefined)
        return problem(c, {
          status: 503,
          title: titleOf(503),
          detail: "Slopify is shutting down. Wait for it to restart before making changes.",
        });
      const updateRoute = [
        "/api/update",
        "/api/update/",
        "/api/update/activate",
        "/api/update/activate/",
      ].includes(c.req.path);
      const releaseUpdate =
        deps.updater === undefined || updateRoute ? undefined : deps.updater.beginMutation();
      if (deps.updater !== undefined && !updateRoute && releaseUpdate === undefined) {
        releaseRequest?.();
        return problem(c, {
          status: 409,
          title: titleOf(409),
          detail: "Slopify is updating. Wait for it to restart before making changes.",
        });
      }
      try {
        await next();
      } finally {
        releaseUpdate?.();
        releaseRequest?.();
      }
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
    // Files are served by URL, not through the API.
    .route("/", fileRoutes(deps))
    .route("/", revisionFileRoutes(deps))
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
