import type { DatabaseSync } from "node:sqlite";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Hono } from "hono";
import { fixedClock } from "../../kernel/clock.fake.js";
import { openDb } from "../../kernel/db/index.js";
import { migrate } from "../../kernel/db/migrate.js";
import { createRebuildDeps } from "../../slices/rebuild/service.fake.js";
import type { RevisionDeps } from "../../slices/revisions/model.js";
import { revisionFixture } from "../../slices/revisions/revision.fake.js";
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
  const app = createApp({
    ...h.deps,
    hub: createHub(h.deps),
    runner: {
      tick: (projectId: string) => {
        ticks.push(projectId);
      },
      settled: async () => undefined,
      abortProject: async () => undefined,
      abortAll: async () => undefined,
    },
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
  });
  return { app, deps: h.deps, projectId: h.projectId, ticks, close: h.close };
}

export async function connectAgent(
  app: Hono,
  headers: Readonly<Record<string, string>> = {},
): Promise<Client> {
  const client = new Client({ name: "test-agent", version: "1" });
  await client.connect(
    // @ts-expect-error SDK 1.32.1 types sessionId as string | undefined, which Transport's optional sessionId rejects under exactOptionalPropertyTypes
    new StreamableHTTPClientTransport(new URL("http://127.0.0.1:6969/mcp"), {
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
