import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Hono } from "hono";
import { createCatalogueStore } from "../../catalog/store.js";
import { fixedClock } from "../../kernel/clock.fake.js";
import { openDb } from "../../kernel/db/index.js";
import { migrate } from "../../kernel/db/migrate.js";
import type { Runner } from "../../kernel/runner/index.js";
import type { AssistantTurnTokens } from "../../slices/assistant/access.js";
import { designCatalogue } from "../../slices/designs/designs.fake.js";
import { createDesignRenderer } from "../../slices/designs/render.js";
import { createDesignRunner } from "../../slices/designs/runner.js";
import { templateById } from "../../slices/project-templates/repo.js";
import { createRebuildDeps } from "../../slices/rebuild/service.fake.js";
import type { RevisionDeps } from "../../slices/revisions/model.js";
import { revisionFixture } from "../../slices/revisions/revision.fake.js";
import type { ScheduleDeps } from "../../slices/schedules/model.js";
import { createHub } from "../events/hub.js";
import { createApp } from "../http/app.js";
import type { RouteCallDeps } from "./call-route.js";

// The whole app over a temporary database with one project ("Saved", p1), as an agent reaches it;
// `rebuild` wires the rebuild service, which Redo needs; `measureAudio` is the app's own.
export function mcpFixture(
  options: {
    readonly rebuild?: boolean;
    readonly measureAudio?: (path: string, signal?: AbortSignal) => Promise<number>;
    readonly templateStudio?:
      | import("../http/template-studio.js").TemplateStudioService
      | ((deps: RevisionDeps) => import("../http/template-studio.js").TemplateStudioService);
    readonly assistantTurns?: AssistantTurnTokens;
    // Library → Designs over the same database, with no provider and no ffmpeg.
    readonly designs?: boolean;
    readonly remoteAccess?: (
      db: DatabaseSync,
    ) => import("../remote-access/service.js").RemoteAccessService;
    // SLOPIFY_ALLOWED_HOSTS.
    readonly allowedHosts?: readonly string[];
    // Library → Templates and Schedules over the same database, with no provider.
    readonly schedules?: boolean;
  } = {},
): {
  readonly app: Hono;
  readonly deps: RevisionDeps;
  readonly projectId: string;
  readonly ticks: readonly string[];
  readonly close: () => void;
} {
  const h = revisionFixture();
  const ticks: string[] = [];
  const runner: Runner = {
    tick: (projectId: string) => {
      ticks.push(projectId);
    },
    settled: async () => undefined,
    abortProject: async () => undefined,
    abortAll: async () => undefined,
  };
  const schedules = options.schedules === true ? schedulesOver(h.deps, runner) : undefined;
  const app = createApp({
    ...h.deps,
    hub: createHub(h.deps),
    runner,
    version: "test",
    webDist: "/missing",
    probe: async () => ({ ran: false, stdout: "" }),
    flushSoon: () => undefined,
    host: "127.0.0.1",
    ...(options.rebuild === true ? { rebuild: createRebuildDeps(h.deps).deps } : {}),
    ...(options.measureAudio === undefined ? {} : { measureAudio: options.measureAudio }),
    ...(options.templateStudio === undefined
      ? {}
      : {
          templateStudio:
            typeof options.templateStudio === "function"
              ? options.templateStudio(h.deps)
              : options.templateStudio,
        }),
    ...(options.assistantTurns === undefined ? {} : { assistantTurns: options.assistantTurns }),
    ...(options.designs === true ? { designs: designsOver(h.deps) } : {}),
    ...(options.remoteAccess === undefined
      ? {}
      : { remoteAccess: options.remoteAccess(h.deps.db) }),
    ...(options.allowedHosts === undefined ? {} : { allowedHosts: options.allowedHosts }),
    ...(schedules === undefined ? {} : { drafts: schedules, schedules }),
  });
  return { app, deps: h.deps, projectId: h.projectId, ticks, close: h.close };
}

export async function connectAgent(
  app: Hono,
  headers: Readonly<Record<string, string>> = {},
  path = "/mcp",
): Promise<Client> {
  const client = new Client({ name: "test-agent", version: "1" });
  await client.connect(
    // @ts-expect-error SDK 1.32.1 types sessionId as string | undefined, which Transport's optional sessionId rejects under exactOptionalPropertyTypes
    new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:6969${path}`), {
      fetch: async (url, init) => app.request(String(url), init),
      requestInit: { headers: { ...headers } },
    }),
  );
  return client;
}

// The executor's deps over a fake API and an empty database, for tests of one call.
export function routeCallDeps(
  api: (request: Request) => Promise<Response>,
): RouteCallDeps & { readonly db: DatabaseSync; readonly logged: readonly string[] } {
  const clock = fixedClock("2026-09-10T00:00:00.000Z");
  const db = openDb(":memory:");
  migrate(db, clock);
  let next = 0;
  const logged: string[] = [];
  return {
    api,
    db,
    clock,
    ids: { next: () => `a${String(++next)}` },
    log: {
      write: (_level, event, fields) =>
        void logged.push(
          `${event}${fields?.projectId === undefined ? "" : ` [${fields.projectId}]`}: ${fields?.detail ?? ""}`,
        ),
    },
    logged,
  };
}

function schedulesOver(deps: RevisionDeps, runner: Runner): ScheduleDeps {
  const catalogue = createCatalogueStore({
    dataDir: deps.paths.dataDir,
    fetch: async () => {
      throw new Error("Network is forbidden in this fixture");
    },
  });
  return {
    db: deps.db,
    paths: deps.paths,
    clock: deps.clock,
    ids: deps.ids,
    uuid: randomUUID,
    log: deps.log,
    catalogue,
    resolveFont: () => Promise.reject(new Error("no fonts in this test")),
    modelsFor: async () => [],
    runner,
    emit: () => undefined,
    recordStarted: () => undefined,
    providers: async () => [],
    template: (id) => templateById(deps.db, id),
  };
}

function designsOver(deps: RevisionDeps) {
  const service = {
    db: deps.db,
    clock: deps.clock,
    ids: deps.ids,
    paths: deps.paths,
    log: deps.log,
  };
  return {
    service,
    runner: createDesignRunner({ ...service, catalogue: () => designCatalogue }),
    renderer: createDesignRenderer({
      ...service,
      ffmpeg: "ffmpeg",
      runFfmpeg: () => Promise.reject(new Error("no ffmpeg in this test")),
      font: () => Promise.reject(new Error("no fonts in this test")),
    }),
  };
}
