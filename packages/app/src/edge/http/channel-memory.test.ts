import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { fixedClock } from "../../kernel/clock.fake.js";
import { openDb } from "../../kernel/db/index.js";
import { migrate } from "../../kernel/db/migrate.js";
import type { Ids } from "../../kernel/ids.js";
import type { Log } from "../../kernel/log.js";
import { ensureDirs, layout } from "../../kernel/paths.js";
import { defaultChannelId } from "../../slices/channels/model.js";
import { createHub } from "../events/hub.js";
import { createApp } from "./app.js";

const clock = fixedClock("2026-09-27T10:00:00.000Z");
const log: Log = { write: (): void => {} };
type App = ReturnType<typeof createApp>;

function harness(): { readonly app: App; readonly db: DatabaseSync } {
  const paths = layout(mkdtempSync(join(tmpdir(), "slopify-channel-memory-")));
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
  const app = createApp({
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
  return { app, db };
}

async function send(app: App, method: string, path: string, body?: unknown): Promise<Response> {
  return await app.request(path, {
    method,
    ...(body === undefined
      ? {}
      : { body: JSON.stringify(body), headers: { "content-type": "application/json" } }),
  });
}

const base = `/api/channels/${defaultChannelId}`;

describe("episode memory routes", () => {
  it("read the setting and memories, turn it off, edit and delete a memory", async () => {
    const { app, db } = harness();
    db.prepare(
      `INSERT INTO episode_memories(id,channel_id,project_id,title,summary,source,created_at,updated_at)
       VALUES ('m1',?,'p1','Cleopatra','She woke.','generated','2026-09-01','2026-09-01')`,
    ).run(defaultChannelId);
    const read = await send(app, "GET", `${base}/episodes`);
    expect(read.status).toBe(200);
    expect(await read.json()).toMatchObject({
      enabled: true,
      memories: [{ id: "m1", title: "Cleopatra", summary: "She woke.", source: "generated" }],
    });
    const off = await send(app, "PUT", `${base}/episodes/setting`, { enabled: false });
    expect(await off.json()).toMatchObject({ enabled: false });
    const edited = await send(app, "PUT", `${base}/episodes/m1`, { summary: "She slept." });
    expect(edited.status).toBe(200);
    expect(await edited.json()).toMatchObject({ summary: "She slept.", source: "edited" });
    const blank = await send(app, "PUT", `${base}/episodes/m1`, { summary: "  " });
    expect(blank.status).toBe(400);
    expect(((await blank.json()) as { detail: string }).detail).toContain("Write the summary");
    expect((await send(app, "DELETE", `${base}/episodes/m1`)).status).toBe(204);
    expect((await send(app, "DELETE", `${base}/episodes/m1`)).status).toBe(404);
    expect((await send(app, "GET", `/api/channels/${randomUUID()}/episodes`)).status).toBe(404);
  });
});

describe("existing video routes", () => {
  it("import pasted titles and a Studio CSV, skipping repeats in any case, then delete and clear", async () => {
    const { app } = harness();
    const pasted = await send(app, "POST", `${base}/videos`, {
      format: "lines",
      text: "Cleopatra Explained\nHypatia\ncleopatra explained\n",
    });
    expect(pasted.status).toBe(201);
    expect(await pasted.json()).toEqual({ added: 2, skipped: 1 });
    const csv = await send(app, "POST", `${base}/videos`, {
      format: "csv",
      text: "Content,Video title,Views\nTotal,,10\nabcdefghijk,HYPATIA,4\nbcdefghijkl,Ramesses,6\n",
    });
    expect(await csv.json()).toEqual({ added: 1, skipped: 1 });
    const listed = (await (await send(app, "GET", `${base}/videos`)).json()) as {
      videos: { id: string; title: string }[];
    };
    expect(listed.videos.map((video) => video.title)).toEqual([
      "Cleopatra Explained",
      "Hypatia",
      "Ramesses",
    ]);
    const empty = await send(app, "POST", `${base}/videos`, { format: "csv", text: "Views\n1\n" });
    expect(empty.status).toBe(400);
    expect(((await empty.json()) as { detail: string }).detail).toContain("YouTube Studio");
    const first = listed.videos[0]?.id ?? "";
    expect((await send(app, "DELETE", `${base}/videos/${first}`)).status).toBe(204);
    const cleared = await send(app, "DELETE", `${base}/videos`);
    expect(await cleared.json()).toEqual({ deleted: 2 });
  });

  it("preview a CSV without saving, save the ticked titles and remember the filter per channel", async () => {
    const { app } = harness();
    const csv = "Content,Video title\nabcdefghijk,History: Hypatia\nbcdefghijkl,New World Guide\n";
    const first = await send(app, "POST", `${base}/videos/preview`, { format: "csv", text: csv });
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({
      titles: ["History: Hypatia", "New World Guide"],
      filter: "",
    });
    const listed = await send(app, "GET", `${base}/videos`);
    expect(await listed.json()).toEqual({ videos: [] });
    const saved = await send(app, "POST", `${base}/videos`, {
      format: "lines",
      text: "History: Hypatia",
      filter: " history ",
    });
    expect(await saved.json()).toEqual({ added: 1, skipped: 0 });
    const again = await send(app, "POST", `${base}/videos/preview`, { format: "csv", text: csv });
    expect(await again.json()).toMatchObject({ filter: "history" });
    const long = await send(app, "POST", `${base}/videos`, {
      format: "lines",
      text: "Hypatia",
      filter: "x".repeat(201),
    });
    expect(((await long.json()) as { detail: string }).detail).toContain(
      'Shorten "Keep only titles containing…"',
    );
    const empty = await send(app, "POST", `${base}/videos/preview`, { format: "csv", text: "1\n" });
    expect(empty.status).toBe(400);
    const missing = `/api/channels/${randomUUID()}/videos/preview`;
    expect((await send(app, "POST", missing, { format: "csv", text: csv })).status).toBe(404);
  });
});
