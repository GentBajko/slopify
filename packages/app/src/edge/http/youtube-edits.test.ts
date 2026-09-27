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
import { effectiveDescription } from "../../slices/youtube/edits-repo.js";
import { createHub } from "../events/hub.js";
import { createApp } from "./app.js";

const clock = fixedClock("2026-09-27T10:00:00.000Z");
const log: Log = { write: (): void => {} };

function harness(): { app: ReturnType<typeof createApp>; db: DatabaseSync } {
  const paths = layout(mkdtempSync(join(tmpdir(), "slopify-youtube-edits-")));
  ensureDirs(paths, { mode: 0o700 });
  const db = openDb(paths.db);
  migrate(db, clock);
  let n = 0;
  const ids: Ids = {
    next: () => {
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
  db.prepare(
    "INSERT INTO projects (id,title,format,config,created_at,updated_at) VALUES ('p1','Ink','16:9','{}','2026-09-27','2026-09-27')",
  ).run();
  return { app, db };
}

async function send(
  app: ReturnType<typeof createApp>,
  method: string,
  path: string,
  body?: unknown,
): Promise<Response> {
  return await app.request(path, {
    method,
    ...(body === undefined
      ? {}
      : { body: JSON.stringify(body), headers: { "content-type": "application/json" } }),
  });
}

describe("/api/projects/:id/youtube-edits", () => {
  it("keeps a field's edit with the text it was made from, and Use it drops it", async () => {
    const { app } = harness();
    expect(await (await send(app, "GET", "/api/projects/p1/youtube-edits")).json()).toEqual({
      fields: {},
      links: [],
    });

    const saved = await send(app, "PUT", "/api/projects/p1/youtube-edits/fields/summary", {
      text: "My summary",
      base: "Generated summary",
    });
    expect(saved.status).toBe(200);
    expect(await saved.json()).toEqual({
      fields: { summary: { base: "Generated summary", text: "My summary" } },
      links: [],
    });

    // Keep mine: the same text against the new generated text.
    await send(app, "PUT", "/api/projects/p1/youtube-edits/fields/summary", {
      text: "My summary",
      base: "Regenerated summary",
    });
    expect(await (await send(app, "GET", "/api/projects/p1/youtube-edits")).json()).toEqual({
      fields: { summary: { base: "Regenerated summary", text: "My summary" } },
      links: [],
    });

    const dropped = await send(app, "DELETE", "/api/projects/p1/youtube-edits/fields/summary");
    expect(await dropped.json()).toEqual({ fields: {}, links: [] });
  });

  it("saves the project's own links and refuses a bad one in plain words", async () => {
    const { app } = harness();
    const saved = await send(app, "PUT", "/api/projects/p1/youtube-edits/links", {
      links: [{ name: " Previous video ", url: " https://youtu.be/old " }],
    });
    expect(await saved.json()).toEqual({
      fields: {},
      links: [{ name: "Previous video", url: "https://youtu.be/old" }],
    });

    const refused = await send(app, "PUT", "/api/projects/p1/youtube-edits/links", {
      links: [{ name: "Previous video", url: "youtu.be/old" }],
    });
    expect(refused.status).toBe(400);
    expect(((await refused.json()) as { detail: string }).detail).toMatch(
      /not a web address.*Save links/u,
    );
  });

  it("answers 404 for a project that is gone, and 400 for a field that does not exist", async () => {
    const { app } = harness();
    expect((await send(app, "GET", "/api/projects/nope/youtube-edits")).status).toBe(404);
    expect(
      (
        await send(app, "PUT", "/api/projects/p1/youtube-edits/fields/title", {
          text: "a",
          base: "b",
        })
      ).status,
    ).toBe(400);
  });

  it("goes with the project", async () => {
    const { app, db } = harness();
    await send(app, "PUT", "/api/projects/p1/youtube-edits/fields/tags", { text: "a", base: "b" });
    db.prepare("DELETE FROM projects WHERE id='p1'").run();
    expect(db.prepare("SELECT count(*) AS n FROM youtube_description_edits").get()).toEqual({
      n: 0,
    });
  });
});

describe("effectiveDescription", () => {
  it("hands on the user's edits with the links filled, as Prepare upload uses it", async () => {
    const { app, db } = harness();
    const generated = {
      description: "Generated summary. {{Patreon}}\n\n0:00 A\n0:20 B\n0:40 C\n\n#Rope",
      tags: "rope, knots",
    };
    await send(app, "PUT", "/api/settings/channel-links", {
      links: [{ name: "Patreon", url: "https://patreon.com/me" }],
    });
    await send(app, "PUT", "/api/projects/p1/youtube-edits/fields/tags", {
      text: "rope, {{Discord}}",
      base: "rope, knots",
    });
    expect(effectiveDescription(db, "p1", generated)).toEqual({
      description: "Generated summary. https://patreon.com/me\n\n0:00 A\n0:20 B\n0:40 C\n\n#Rope",
      tags: "rope, {{Discord}}",
    });
  });
});

describe("/api/settings/channel-links", () => {
  it("saves the list trimmed and refuses a duplicate name", async () => {
    const { app } = harness();
    expect(await (await send(app, "GET", "/api/settings/channel-links")).json()).toEqual({
      links: [],
    });
    const saved = await send(app, "PUT", "/api/settings/channel-links", {
      links: [{ name: " Patreon ", url: "https://patreon.com/me" }],
    });
    expect(await saved.json()).toEqual({
      links: [{ name: "Patreon", url: "https://patreon.com/me" }],
    });

    const refused = await send(app, "PUT", "/api/settings/channel-links", {
      links: [
        { name: "Patreon", url: "https://patreon.com/me" },
        { name: "patreon", url: "https://patreon.com/you" },
      ],
    });
    expect(refused.status).toBe(400);
    expect(((await refused.json()) as { detail: string }).detail).toMatch(
      /Two links are named.*Settings → Channel links/u,
    );
  });
});
