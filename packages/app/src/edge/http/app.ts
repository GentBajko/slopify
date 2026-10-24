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
import { mcpPath } from "../../slices/agents/model.js";
import type { RunAllowedCall } from "../../slices/assistant/access.js";
import type { BackupService } from "../../slices/backups/service.js";
import { isSampleProject } from "../../slices/onboarding/sample.js";
import type { DraftStartDeps } from "../../slices/play-drafts/model.js";
import type { RebuildDeps } from "../../slices/rebuild/service.js";
import type { ScheduleDeps } from "../../slices/schedules/model.js";
import type { CliProbe } from "../../slices/settings/cli-status.js";
import type { UnpackedExtension } from "../../slices/studio/unpacked.js";
import { sampleOwner } from "../../slices/template-studio/repo.js";
import type { AppUpdater } from "../../updater/model.js";
import type { Hub } from "../events/hub.js";
import { assistantMcpPath, assistantMcpRoutes, runAllowedCall } from "../mcp/assistant.js";
import { mcpRoutes } from "../mcp/http.js";
import { actionRoutes } from "./actions.js";
import { agentBindings, assistantBindings } from "./actor.js";
import { assistantRoutes } from "./assistant.js";
import { audioPreviewRoutes } from "./audio-preview.js";
import { type Audition, auditionRoutes } from "./auditions.js";
import { autostartRoutes } from "./autostart.js";
import { backupRoutes } from "./backups.js";
import { channelMemoryRoutes } from "./channel-memory.js";
import { channelRoutes } from "./channels.js";
import { checkpointRoutes } from "./checkpoints.js";
import { type DesignTemplateRoutesDeps, designTemplateRoutes } from "./design-templates.js";
import { type DesignRoutesDeps, designRoutes } from "./designs.js";
import { diagnosticsRoutes } from "./diagnostics.js";
import { documentThemeRoutes } from "./document-themes.js";
import { draftRoutes } from "./drafts.js";
import { entryRoutes } from "./entries.js";
import { externalReviewRoutes } from "./external-reviews.js";
import { fileRoutes } from "./files.js";
import { fontsRoutes } from "./fonts.js";
import { homeRoutes, uploadedRoutes } from "./home.js";
import { keywordRoutes } from "./keywords.js";
import { modelCheckRoutes, providerCheckRoutes } from "./model-checks.js";
import type { MutationLifecycle } from "./mutations.js";
import { type DecodePeaks, narrationPeakRoutes } from "./narration-peaks.js";
import { onboardingRoutes } from "./onboarding.js";
import { openFolderRoutes } from "./open-folder.js";
import { outputRoutes } from "./outputs.js";
import { patchNotesRoutes } from "./patch-notes.js";
import { planningRoutes } from "./planning.js";
import { problem, problemFromError } from "./problem.js";
import { projectTemplateRoutes } from "./project-templates.js";
import { projectRoutes } from "./projects.js";
import { promptRoutes } from "./prompts.js";
import { pronunciationRoutes } from "./pronunciations.js";
import { providerRoutes } from "./providers.js";
import { remoteAccessRoutes } from "./remote-access.js";
import { remoteGuard } from "./remote-guard.js";
import { requestGuard } from "./request-guard.js";
import { reviewRoutes } from "./reviews.js";
import { revisionFileRoutes, revisionFolderRoutes } from "./revision-files.js";
import { revisionRoutes } from "./revisions.js";
import { runCostRoutes } from "./run-cost.js";
import { viaFunnel } from "./same-page.js";
import { calendarRoutes, scheduleRoutes } from "./schedules.js";
import { settingsRoutes } from "./settings.js";
import { type SocialRoutesDeps, socialRoutes } from "./social.js";
import { stagingRoutes } from "./staging.js";
import { startRecorder } from "./starts.js";
import { storageRoutes } from "./storage.js";
import { filesRoutes } from "./storage-files.js";
import { studioRoutes } from "./studio.js";
import { stylePreviewRoutes } from "./style-preview.js";
import { subtitleRoutes } from "./subtitles.js";
import { telemetryRoutes } from "./telemetry.js";
import { templateStudioRoutes } from "./template-studio.js";
import { trashRoutes } from "./trash.js";
import { tutorialRoutes } from "./tutorial.js";
import { tutorialPagesRoutes } from "./tutorials.js";
import { updateRoutes } from "./update.js";
import { usageRoutes } from "./usage.js";
import { whatsNewRoutes } from "./whats-new.js";
import { youtubeEditRoutes } from "./youtube-edits.js";

export interface AppDeps {
  // Settings → General → Remote access (Tailscale serve); absent answers that it can't be set.
  readonly remoteAccess?: import("../remote-access/service.js").RemoteAccessService | undefined;
  // Settings → General's "Start Slopify when I log in"; absent answers that it can't be set.
  readonly autostart?: import("../autostart/service.js").AutostartService | undefined;
  readonly hostCliStatus?:
    | import("../../kernel/ports/host-cli.js").HostCliPorts["status"]
    | undefined;
  readonly drafts?: DraftStartDeps;
  // Library → Templates → Open studio's samples and their loop; absent, the studio says how to
  // get them.
  readonly templateStudio?: import("./template-studio.js").TemplateStudioService | undefined;
  // Channels → Cast's Generate button; absent answers that no provider is set up.
  readonly generateCastImage?:
    | import("../../slices/channels/cast-images.js").CastImageGenerator
    | undefined;
  readonly schedules?: ScheduleDeps;
  // Library → Designs; absent answers that designs aren't available.
  readonly designs?: DesignRoutesDeps | undefined;
  readonly designTemplates?: DesignTemplateRoutesDeps | undefined;
  // Posting to other sites: pictures cut to a site's shape; absent answers that it can't.
  readonly social?: SocialRoutesDeps | undefined;
  readonly backups?: BackupService;
  // Settings → Backup & storage's files folder: where it is, Open folder, and moving it.
  readonly files?: import("../../slices/storage/files-location.js").FilesService;
  readonly rebuild?: RebuildDeps;
  readonly measureAudio?: ((path: string, signal?: AbortSignal) => Promise<number>) | undefined;
  // The bundled samples' archives; the ones shipped in assets unless a test hands in others.
  readonly sampleArchives?:
    | Partial<Record<import("../../slices/onboarding/model.js").SampleId, string>>
    | undefined;
  // Reads a narration file's loudness for the live view's waveform (ffmpeg in production).
  readonly decodePeaks?: DecodePeaks | undefined;
  readonly openFolder?: (path: string) => Promise<void>;
  readonly installationPending?: () => boolean;
  readonly folderLocation?: {
    readonly container: boolean;
    readonly hostProjects: string | null;
    readonly hostBackups?: string | null;
    /** Asks the host helper to open a host folder; false means show the path instead. */
    readonly openOnHost?: (path: string, signal: AbortSignal) => Promise<boolean>;
  };
  readonly catalogue?: CatalogueStore;
  // Settings → Models' checks and the pickers' standings (`slices/model-checks`).
  readonly modelChecks?: import("../../slices/model-checks/service.js").ModelChecks | undefined;
  readonly modelListing?: import("../../slices/model-checks/listing.js").Listing | undefined;
  // Whether listings and free checks run by themselves (a key saved, a picker opened). Off in
  // tests, so a route never reaches the network on its own.
  readonly autoModelChecks?: boolean | undefined;
  // The autopilot's hourly check (`slices/autopilot/signals.ts`); absent reads as not run yet.
  readonly autopilot?:
    | {
        readonly latest: () =>
          | import("../../slices/autopilot/signals.js").AutopilotProbes
          | undefined;
      }
    | undefined;
  // The network for Settings → Providers' Test and Check all. Handed in so a test never
  // reaches a real provider.
  readonly fetch?: typeof globalThis.fetch;
  // Asks a CLI on this computer whether it is signed in, for the health check.
  readonly cliLogin?: import("../../slices/settings/health.js").LoginReader;
  // Speaks one voice audition through the attempt wrapper (`kernel/runner/audition.ts`).
  readonly audition?: Audition | undefined;
  // Settings → Voices: what a voice's provider says it speaks, asked when a voice is added
  // without languages. Absent, or undefined from it, is unknown.
  readonly voiceLanguages?:
    | ((
        provider: string,
        voiceId: string,
        signal: AbortSignal,
      ) => Promise<readonly string[] | undefined>)
    | undefined;
  readonly updater?: AppUpdater;
  readonly mutations?: Pick<MutationLifecycle, "begin">;
  readonly audioPreviews?: AudioPreviewStore;
  // Edit project's and Play's rendered style preview; absent answers that it is unavailable.
  readonly stylePreviews?: import("../../slices/style-preview/service.js").StylePreviews;
  // Settings → Production defaults → Video encoder: whether this computer's NVIDIA encoder
  // works (`slices/video/encoding.ts`); absent answers that there is none.
  readonly nvenc?: () => Promise<import("../../slices/video/encoding.js").NvencStatus>;
  // Settings → Notifications' test button. Handed in so a test never reaches the network.
  readonly sendNotification?: import("../../slices/notifications/send.js").SendNotification;
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
  // The in-app assistant's chat and turns (`slices/assistant/turn.ts`); absent, the panel says
  // it is unavailable and `/mcp/assistant` opens for nobody.
  readonly assistant?: import("../../slices/assistant/turn.js").Assistant | undefined;
  // The running turns' tokens when no assistant is wired (a test's own).
  readonly assistantTurns?: import("../../slices/assistant/access.js").AssistantTurnTokens;
  // The address the server listens on (`--host`); `/mcp` accepts pages served from it.
  readonly host?: string | undefined;
  // Other names the person opens Slopify by on purpose (SLOPIFY_ALLOWED_HOSTS).
  readonly allowedHosts?: readonly string[] | undefined;
  // Where the bundled patch notes are (index.json and <id>.md); the build's own copy when left out.
  readonly patchNotesDir?: string;
  // Where the bundled tutorials are (the wiki's <Page>.md and _Sidebar.md); the build's own
  // copy when left out.
  readonly tutorialsDir?: string;
  readonly webDist: string;
  // Where the build put the Slopify Studio extension's zips (`scripts/copy-extension.mjs`);
  // absent, Settings' Download answers that this copy doesn't include them.
  readonly extensionDist?: string | undefined;
  // The Chrome extension unpacked in this install's own folder, kept current at each start
  // (`slices/studio/unpacked.ts`); absent in a container or when it couldn't be written.
  readonly unpackedExtension?: UnpackedExtension | undefined;
  // Runs a local agent CLI to learn whether it is installed. Handed in so a test can answer for
  // both branches without depending on this machine's PATH.
  readonly probe: CliProbe;
  // Where the system voice is looked for (platform and environment); this process when
  // absent, so a test can pick the platform.
  readonly speechHost?: import("../../kernel/ports/system-speech.js").SpeechHost | undefined;
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

function apiRoutes(deps: AppDeps, startedAt: number, runAllowed?: RunAllowedCall) {
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
      .route("/storage/files", filesRoutes(deps))
      .route("/storage", storageRoutes(deps))
      .route("/backups", backupRoutes(deps.backups))
      .route("/trash", trashRoutes(deps))
      .route("/drafts", draftRoutes(deps.drafts))
      .route("/diagnostics", diagnosticsRoutes(deps))
      .route("/project-templates", projectTemplateRoutes(deps.drafts))
      .route("/template-studio", templateStudioRoutes(deps))
      .route("/schedules", scheduleRoutes(deps.schedules))
      .route("/channels", channelRoutes(deps))
      .route("/channels", channelMemoryRoutes(deps))
      .route("/designs", designRoutes(deps.designs))
      .route("/design-templates", designTemplateRoutes(deps.designTemplates))
      .route("/calendar", calendarRoutes(deps.schedules))
      .route("/projects", planningRoutes(deps))
      .route("/projects", projectRoutes(deps))
      .route("/projects", checkpointRoutes(deps))
      .route("/projects", reviewRoutes(deps))
      .route("/projects", externalReviewRoutes(deps))
      .route("/projects", revisionRoutes(deps))
      .route("/projects", outputRoutes(deps))
      .route("/projects", revisionFolderRoutes(deps))
      .route("/projects", openFolderRoutes(deps))
      .route("/projects", audioPreviewRoutes(deps))
      .route("/projects", narrationPeakRoutes(deps))
      .route("/projects", runCostRoutes(deps))
      .route("/projects", uploadedRoutes(deps))
      .route("/home", homeRoutes(deps))
      .route("/update", updateRoutes(deps))
      // The re-run and cancel actions sit on the same prefix as the project itself; they
      // are their own router because they are their own concern.
      .route("/projects", actionRoutes(deps))
      .route("/projects", subtitleRoutes(deps))
      .route("/projects", youtubeEditRoutes(deps))
      .route("/fonts", fontsRoutes(deps))
      .route("/prompts", promptRoutes(deps))
      .route("/keywords", keywordRoutes(deps))
      .route("/entries", entryRoutes(deps))
      .route("/document-themes", documentThemeRoutes(deps))
      .route("/pronunciations", pronunciationRoutes(deps))
      .route("/auditions", auditionRoutes(deps))
      .route("/telemetry", telemetryRoutes(deps))
      .route("/usage", usageRoutes(deps))
      .route("/settings/autostart", autostartRoutes(deps.autostart))
      .route("/settings/remote-access", remoteAccessRoutes(deps.remoteAccess))
      .route("/settings", settingsRoutes(deps))
      .route("/studio", studioRoutes(deps))
      .route("/social", socialRoutes(deps))
      .route("/style-preview", stylePreviewRoutes(deps))
      .route("/tutorial", tutorialRoutes(deps))
      .route("/whats-new", whatsNewRoutes(deps))
      .route("/patch-notes", patchNotesRoutes(deps))
      .route("/tutorials", tutorialPagesRoutes(deps))
      .route("/providers", providerCheckRoutes(deps))
      .route("/providers", providerRoutes(deps))
      .route("/model-checks", modelCheckRoutes(deps))
      .route("/onboarding", onboardingRoutes(deps))
      .route("/assistant", assistantRoutes(deps, runAllowed))
  );
}

export function createApp(deps: AppDeps): Hono {
  const startedAt = deps.clock.now().getTime();
  // An Allow's call goes through the API in-process as the assistant, like its MCP calls.
  const runAllowed: RunAllowedCall = (call) =>
    runAllowedCall(
      {
        db: deps.db,
        ids: deps.ids,
        clock: deps.clock,
        log: deps.log,
        api: async (request: Request): Promise<Response> =>
          app.request(request, undefined, assistantBindings),
      },
      call,
    );

  const app = new Hono()
    // Slopify has no login, so it never answers the public internet. Tailscale marks every
    // request that came through Funnel; Slopify never turns Funnel on, and this holds even if
    // someone else does.
    .use("*", async (c, next) => {
      if (!viaFunnel(c.req.raw.headers)) return next();
      return problem(c, {
        status: 403,
        detail:
          "Slopify doesn't answer the public internet: this request came through Tailscale Funnel. On the computer Slopify runs on, run tailscale funnel status to see which port has Funnel, turn it off with tailscale funnel --https=<that port> off, and open Slopify on your other devices through Settings → General → Remote access instead.",
      });
    })
    // Only Slopify's own names, and changes only from its own page (`request-guard.ts`).
    .use(
      "*",
      requestGuard({
        listenHost: deps.host,
        remoteHost: deps.remoteAccess?.remoteHost,
        extraHosts: deps.allowedHosts ?? [],
      }),
    )
    // Over remote access: only the account that turned it on, and no host setup.
    .use("*", remoteGuard(deps.remoteAccess))
    .use("*", async (c, next) => {
      // A provisional candidate must not trigger the stale-tab Reload dialog.
      if (!deps.updater?.locked()) c.header("X-Slopify-Version", deps.version);
      await next();
    })
    .use("/api/*", async (c, next) => {
      if (["GET", "HEAD", "OPTIONS"].includes(c.req.method)) return next();
      if (deps.installationPending?.() && new URL(c.req.url).pathname !== "/api/update/activate")
        return problem(c, {
          status: 503,
          detail:
            "Slopify is still finishing its Docker setup. Wait for the launcher to finish, then try again.",
        });
      const releaseRequest = deps.mutations?.begin();
      if (deps.mutations !== undefined && releaseRequest === undefined)
        return problem(c, {
          status: 503,
          detail:
            "Slopify is shutting down, so changes cannot be saved right now. Start it again, reload the page and try again.",
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
          detail: "Slopify is updating. Wait for it to restart, reload the page and try again.",
        });
      }
      try {
        await next();
      } finally {
        releaseUpdate?.();
        releaseRequest?.();
      }
    })
    // The bundled sample is read-only, so exploring it never reaches a paid provider: only
    // what reads or previews it is let through.
    .use("/api/projects/:id/*", async (c, next) => {
      if (["GET", "HEAD", "OPTIONS"].includes(c.req.method)) return next();
      const id = c.req.param("id");
      // Deleting the sample is allowed: Settings → Restore sample brings it back.
      if (
        !isSampleProject(deps.db, id) ||
        sampleReadOnlyExempt.test(c.req.path) ||
        c.req.path.replace(/\/$/, "") === `/api/projects/${id}`
      )
        return next();
      return problem(c, {
        status: 409,
        detail:
          "This is a sample project, which is read-only so trying things on it never spends anything. Press Make my own copy at the top right of its page, then change and make the copy again.",
        extensions: { reason: "sample-read-only" },
      });
    })
    // A template's studio sample is changed only through its studio (`slices/template-studio`),
    // whose runner reaches the project's slices directly: no project route may change it.
    .use("/api/projects/:id/*", async (c, next) => {
      if (["GET", "HEAD", "OPTIONS"].includes(c.req.method)) return next();
      const owner = sampleOwner(deps.db, c.req.param("id"));
      if (owner === undefined) return next();
      return problem(c, {
        status: 409,
        detail: `This is the studio sample of ${owner.name}. Change the template in its studio instead: Library → Templates → ${owner.name} → Open studio.`,
        extensions: { reason: "template-sample" },
      });
    })
    .use("/api/*", startRecorder(deps))
    .onError((error, c) => problemFromError(c, error, deps))
    .notFound(missing)
    .route("/api", apiRoutes(deps, startedAt, runAllowed))
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

  const mcpDeps = {
    db: deps.db,
    paths: deps.paths,
    ids: deps.ids,
    clock: deps.clock,
    log: deps.log,
    version: deps.version,
    host: deps.host,
    ...(deps.measureAudio === undefined ? {} : { measureAudio: deps.measureAudio }),
  };
  // The in-app assistant reaches it the same way, as the assistant, with its turn's token.
  // Mounted first: `/mcp` must never answer for it.
  app.route(
    assistantMcpPath,
    assistantMcpRoutes({
      ...mcpDeps,
      turns: deps.assistant?.tokens ?? deps.assistantTurns,
      api: async (request) => app.request(request, undefined, assistantBindings),
    }),
  );
  // Agents reach the same API in-process, as the agent (`actor.ts`): every tool validates,
  // refuses and answers exactly like the page's own request.
  app.route(
    mcpPath,
    mcpRoutes({
      db: deps.db,
      paths: deps.paths,
      ids: deps.ids,
      clock: deps.clock,
      log: deps.log,
      version: deps.version,
      host: deps.host,
      // An uploaded narration's length, for its word timing (get_project_file).
      ...(deps.measureAudio === undefined ? {} : { measureAudio: deps.measureAudio }),
      api: async (request) => app.request(request, undefined, agentBindings),
    }),
  );

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

// What the sample's page may still do: prepare its revision view, preview a rebuild (which
// starts nothing) and open its folder.
const sampleReadOnlyExempt = /\/(revisions\/prepare|rebuild\/preview|open-folder)\/?$/;

function missing(c: Context): Response {
  return problem(c, {
    status: 404,
    detail: `${c.req.method} ${c.req.path} is not a route of this API.`,
  });
}
