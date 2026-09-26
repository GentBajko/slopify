import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { fixedClock } from "../../kernel/clock.fake.js";
import { openDb } from "../../kernel/db/index.js";
import { migrate } from "../../kernel/db/migrate.js";
import type { Ids } from "../../kernel/ids.js";
import type { Log } from "../../kernel/log.js";
import { ensureDirs, layout } from "../../kernel/paths.js";
import { createHub } from "../events/hub.js";
import { createApp } from "./app.js";

const clock = fixedClock("2026-09-02T10:00:00.000Z");
const log: Log = { write: (): void => {} };

type App = ReturnType<typeof createApp>;

function harness(): App {
  const paths = layout(mkdtempSync(join(tmpdir(), "slopify-document-themes-")));
  ensureDirs(paths, { mode: 0o700 });
  const db = openDb(paths.db);
  migrate(db, clock);
  let n = 0;
  const ids: Ids = {
    next: (): string => {
      n += 1;
      return `id${String(n)}`;
    },
  };
  return createApp({
    db,
    paths,
    hub: createHub({ ids, log }),
    runner: {
      tick: (): void => {},
      settled: async (): Promise<void> => {},
      abortProject: async (): Promise<void> => {},
      abortAll: async (): Promise<void> => {},
    },
    clock,
    ids,
    log,
    version: "1.2.3",
    webDist: join(paths.dataDir, "missing"),
    flushSoon: (): void => {},
    probe: () => Promise.resolve({ ran: false, stdout: "" }),
  });
}

async function send(app: App, method: string, path: string, body?: unknown): Promise<Response> {
  return await app.request(path, {
    method,
    ...(body === undefined
      ? {}
      : { body: JSON.stringify(body), headers: { "content-type": "application/json" } }),
  });
}

type Listing = {
  builtIns: { name: string; label: string; values: Record<string, Record<string, unknown>> }[];
  themes: { id: string; name: string; values: Record<string, Record<string, unknown>> }[];
};

async function builtIn(app: App): Promise<Record<string, Record<string, unknown>>> {
  const listing = (await (await send(app, "GET", "/api/document-themes")).json()) as Listing;
  const plain = listing.builtIns.find((theme) => theme.name === "plain");
  if (plain === undefined) throw new Error("No Plain theme");
  return plain.values;
}

describe("document themes", () => {
  it("lists the built-ins with their values, then saves, renames and deletes a copy", async () => {
    const app = harness();
    const values = await builtIn(app);
    const created = await send(app, "POST", "/api/document-themes", {
      name: "  House style ",
      values: { ...values, colors: { ...values.colors, heading: "#224466" } },
    });
    expect(created.status).toBe(201);
    const theme = (await created.json()) as { id: string; name: string };
    expect(theme.name).toBe("House style");

    const listing = (await (await send(app, "GET", "/api/document-themes")).json()) as Listing;
    expect(listing.themes.map((one) => [one.name, one.values.colors?.heading])).toEqual([
      ["House style", "#224466"],
    ]);

    const renamed = await send(app, "PUT", `/api/document-themes/${theme.id}`, {
      name: "Renamed",
      values,
    });
    expect(renamed.status).toBe(200);
    expect((await send(app, "DELETE", `/api/document-themes/${theme.id}`)).status).toBe(204);
    expect((await send(app, "DELETE", `/api/document-themes/${theme.id}`)).status).toBe(404);
  });

  it("marks each setting it refuses and a name already taken", async () => {
    const app = harness();
    const values = await builtIn(app);
    const bad = await send(app, "POST", "/api/document-themes", {
      name: "",
      values: { ...values, page: { ...values.page, margin: 500 } },
    });
    expect(bad.status).toBe(400);
    const fields = ((await bad.json()) as { fields: { field: string }[] }).fields.map(
      (one) => one.field,
    );
    expect(fields).toEqual(["name", "values.page.margin"]);

    expect((await send(app, "POST", "/api/document-themes", { name: "A", values })).status).toBe(
      201,
    );
    const taken = await send(app, "POST", "/api/document-themes", { name: "a", values });
    expect(taken.status).toBe(409);
  });

  it("previews unsaved values as a PDF of the sample article", async () => {
    const app = harness();
    const values = await builtIn(app);
    const response = await send(app, "POST", "/api/document-themes/preview", { values });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    const refused = await send(app, "POST", "/api/document-themes/preview", {
      values: { ...values, sizes: { ...values.sizes, body: -1 } },
    });
    expect(refused.status).toBe(400);
  });
});
