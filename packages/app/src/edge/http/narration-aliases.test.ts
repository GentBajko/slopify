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
  const paths = layout(mkdtempSync(join(tmpdir(), "slopify-aliases-")));
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

type Aliases = {
  aliases: { written: string; spoken: string; wholeWord: boolean; caseSensitive: boolean }[];
};

describe("Library → Aliases", () => {
  it("saves the ordered list as a whole and lists it back", async () => {
    const app = harness();
    expect(await (await send(app, "GET", "/api/pronunciations/aliases")).json()).toEqual({
      aliases: [],
    });
    const rows = [
      { written: " Dr. ", spoken: "Doctor", wholeWord: true, caseSensitive: false },
      { written: "Ms.", spoken: "Miss", wholeWord: true, caseSensitive: false },
    ];
    const saved = await send(app, "PUT", "/api/pronunciations/aliases", { aliases: rows });
    expect(saved.status).toBe(200);
    const listed = (await (
      await send(app, "GET", "/api/pronunciations/aliases")
    ).json()) as Aliases;
    expect(listed.aliases.map((row) => [row.written, row.spoken])).toEqual([
      ["Dr.", "Doctor"],
      ["Ms.", "Miss"],
    ]);
    // Saving again replaces the list, in its new order.
    await send(app, "PUT", "/api/pronunciations/aliases", { aliases: [rows[1]] });
    expect(
      ((await (await send(app, "GET", "/api/pronunciations/aliases")).json()) as Aliases).aliases,
    ).toHaveLength(1);
  });

  it("names each row it refuses and keeps the saved list", async () => {
    const app = harness();
    const bad = await send(app, "PUT", "/api/pronunciations/aliases", {
      aliases: [
        { written: "Dr.", spoken: "Doctor", wholeWord: true, caseSensitive: false },
        { written: "", spoken: "x", wholeWord: true, caseSensitive: false },
        { written: "dr.", spoken: "Drive", wholeWord: true, caseSensitive: false },
        { written: "St.", spoken: " ", wholeWord: true, caseSensitive: false },
      ],
    });
    expect(bad.status).toBe(400);
    const problem = (await bad.json()) as {
      detail: string;
      fields: { field: string; message: string }[];
    };
    expect(problem.fields.map((one) => one.message)).toEqual([
      "Alias 2: write the word or phrase as it appears in the article.",
      "Alias 3: alias 1 already covers the same written form; keep one of them.",
      "Alias 4: write how the narrator should say it.",
    ]);
    expect(problem.detail).toContain("Alias 2:");
    expect(
      ((await (await send(app, "GET", "/api/pronunciations/aliases")).json()) as Aliases).aliases,
    ).toEqual([]);
  });
});
