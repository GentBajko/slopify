import { randomUUID } from "node:crypto";
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
import { defaultChannelId } from "../../slices/channels/model.js";
import { createHub } from "../events/hub.js";
import { createApp } from "./app.js";

const clock = fixedClock("2026-09-27T10:00:00.000Z");
const log: Log = { write: (): void => {} };
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 3]);
type App = ReturnType<typeof createApp>;

function harness(): App {
  const paths = layout(mkdtempSync(join(tmpdir(), "slopify-channels-")));
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

describe("channel routes", () => {
  it("list the default channel, create one and save its brand kit", async () => {
    const app = harness();
    const listed = (await (await send(app, "GET", "/api/channels")).json()) as {
      channels: { id: string; name: string }[];
    };
    expect(listed.channels).toMatchObject([{ id: defaultChannelId, name: "My channel" }]);
    const id = randomUUID();
    expect((await send(app, "POST", "/api/channels", { id, name: "Lore" })).status).toBe(201);
    const saved = await send(app, "PUT", `/api/channels/${id}`, {
      name: "Lore",
      brand: { captionColor: "#ffffff" },
      seriesBrief: "Villains first",
      baseVersion: 1,
    });
    expect(saved.status).toBe(200);
    const refused = await send(app, "PUT", `/api/channels/${id}`, {
      name: "Lore",
      brand: { captionColor: "white" },
      seriesBrief: "",
      baseVersion: 2,
    });
    expect(refused.status).toBe(400);
    expect(await refused.json()).toMatchObject({ detail: "Use a colour like #FFD700." });
    const gone = await send(app, "DELETE", `/api/channels/${defaultChannelId}`);
    expect(gone.status).toBe(400);
    expect(((await gone.json()) as { detail: string }).detail).toContain("Rename it");
  });

  it("save the YouTube AI disclosure on its own, leaving the Brand form's version alone", async () => {
    const app = harness();
    const url = `/api/channels/${defaultChannelId}/ai-disclosure`;
    const saved = await send(app, "PUT", url, { aiDisclosure: "no" });
    expect(saved.status).toBe(200);
    expect(await saved.json()).toMatchObject({ aiDisclosure: "no", version: 1 });
    const read = (await (await send(app, "GET", `/api/channels/${defaultChannelId}`)).json()) as {
      channel: { aiDisclosure: string };
    };
    expect(read.channel.aiDisclosure).toBe("no");
    const refused = await send(app, "PUT", url, { aiDisclosure: "maybe" });
    expect(refused.status).toBe(400);
    expect(await refused.json()).toMatchObject({
      detail: "Choose Automatic, Always Yes or Always No.",
    });
    expect(
      (
        await send(app, "PUT", `/api/channels/${randomUUID()}/ai-disclosure`, {
          aiDisclosure: "yes",
        })
      ).status,
    ).toBe(404);
  });

  it("upload a cast picture as the body and serve it back by hash", async () => {
    const app = harness();
    const member = randomUUID();
    const created = await send(app, "POST", `/api/channels/${defaultChannelId}/cast`, {
      id: member,
      kind: "character",
      name: "Herodotus",
      aliases: ["Do'Urden"],
    });
    expect(created.status).toBe(201);
    const uploaded = await app.request(`/api/channels/cast/${member}/images`, {
      method: "POST",
      body: png,
      headers: { "content-type": "image/png" },
    });
    expect(uploaded.status).toBe(201);
    const image = (await uploaded.json()) as { sha256: string };
    const served = await send(app, "GET", `/api/channels/pictures/${image.sha256}`);
    expect(served.headers.get("content-type")).toBe("image/png");
    expect(new Uint8Array(await served.arrayBuffer())).toEqual(png);
    const text = await app.request(`/api/channels/cast/${member}/images`, {
      method: "POST",
      body: "hello",
    });
    expect(text.status).toBe(400);
    const generate = await send(app, "POST", `/api/channels/cast/${member}/generate`, {
      prompt: "Herodotus",
      provider: "fal",
      model: "flux",
    });
    expect(generate.status).toBe(400);
    expect(((await generate.json()) as { detail: string }).detail).toContain(
      "Settings → Providers",
    );
  });
});
