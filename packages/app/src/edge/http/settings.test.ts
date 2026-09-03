import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import type { Clock } from "../../kernel/clock.js";
import { openDb } from "../../kernel/db/index.js";
import { migrate } from "../../kernel/db/migrate.js";
import type { Ids } from "../../kernel/ids.js";
import type { Log } from "../../kernel/log.js";
import { ensureDirs, layout } from "../../kernel/paths.js";
import { createHub } from "../events/hub.js";
import { createApp } from "./app.js";

const clock: Clock = { now: () => new Date("2026-09-02T10:00:00.000Z") };
const log: Log = { write: (): void => {} };

interface Harness {
  readonly app: ReturnType<typeof createApp>;
  readonly db: DatabaseSync;
}

function harness(): Harness {
  const paths = layout(mkdtempSync(join(tmpdir(), "slopify-settings-")));
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

async function json(
  app: Harness["app"],
  path: string,
  method: string,
  body: unknown,
): Promise<Response> {
  return await app.request(path, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("GET /api/settings", () => {
  it("answers with the defaults on a fresh install", async () => {
    const { app } = harness();

    const response = await app.request("/api/settings");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ silenceGapSeconds: 3, appearance: "system" });
  });
});

describe("PUT /api/settings", () => {
  it("saves the gap and the appearance", async () => {
    const { app } = harness();

    const response = await json(app, "/api/settings", "PUT", {
      silenceGapSeconds: 5,
      appearance: "dark",
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ silenceGapSeconds: 5, appearance: "dark" });
    expect(await (await app.request("/api/settings")).json()).toEqual({
      silenceGapSeconds: 5,
      appearance: "dark",
    });
  });

  it("names the field when the gap is out of range", async () => {
    const { app } = harness();

    const response = await json(app, "/api/settings", "PUT", {
      silenceGapSeconds: -1,
      appearance: "system",
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ fields: [{ field: "silenceGapSeconds" }] });
  });

  it("refuses an appearance this build does not have", async () => {
    const { app } = harness();

    const response = await json(app, "/api/settings", "PUT", {
      silenceGapSeconds: 3,
      appearance: "sepia",
    });

    expect(response.status).toBe(400);
  });

  it("refuses a gap that is not a number", async () => {
    const { app } = harness();

    const response = await json(app, "/api/settings", "PUT", {
      silenceGapSeconds: "3",
      appearance: "system",
    });

    expect(response.status).toBe(400);
  });
});

describe("POST /api/settings/voices", () => {
  it("adds a voice", async () => {
    const { app } = harness();

    const response = await json(app, "/api/settings/voices", "POST", {
      provider: "elevenlabs",
      name: "  Narrator M  ",
      voiceId: " abc123 ",
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      id: "id1",
      provider: "elevenlabs",
      name: "Narrator M",
      voiceId: "abc123",
    });
  });

  // `logic/02` §Q18: the ID is unique within its provider, and the message is the one
  // uiux/03-settings prints under the Voice ID input.
  it("refuses a voice ID already listed for that provider", async () => {
    const { app } = harness();
    const draft = { provider: "elevenlabs", name: "Narrator M", voiceId: "abc123" };
    await json(app, "/api/settings/voices", "POST", draft);

    const response = await json(app, "/api/settings/voices", "POST", {
      ...draft,
      name: "Someone else",
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      detail: "This voice ID is already listed for this provider.",
    });
  });

  it("takes the same voice ID under a second provider", async () => {
    const { app } = harness();
    await json(app, "/api/settings/voices", "POST", {
      provider: "elevenlabs",
      name: "Narrator M",
      voiceId: "abc123",
    });

    const response = await json(app, "/api/settings/voices", "POST", {
      provider: "cartesia",
      name: "Narrator M",
      voiceId: "abc123",
    });

    expect(response.status).toBe(201);
  });

  it("names the field when the name is blank", async () => {
    const { app } = harness();

    const response = await json(app, "/api/settings/voices", "POST", {
      provider: "elevenlabs",
      name: "  ",
      voiceId: "abc123",
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      fields: [{ field: "name", message: "A voice name is required." }],
    });
  });

  it("names the field when the voice ID is blank", async () => {
    const { app } = harness();

    const response = await json(app, "/api/settings/voices", "POST", {
      provider: "elevenlabs",
      name: "Narrator M",
      voiceId: "",
    });

    expect(await response.json()).toMatchObject({ fields: [{ field: "voiceId" }] });
  });

  it("names the field when the name is too long", async () => {
    const { app } = harness();

    const response = await json(app, "/api/settings/voices", "POST", {
      provider: "elevenlabs",
      name: "n".repeat(201),
      voiceId: "abc123",
    });

    expect(await response.json()).toMatchObject({
      fields: [{ field: "name", message: "A voice name is at most 200 characters." }],
    });
  });

  it("names the field when the voice ID is too long", async () => {
    const { app } = harness();

    const response = await json(app, "/api/settings/voices", "POST", {
      provider: "elevenlabs",
      name: "Narrator M",
      voiceId: "a".repeat(201),
    });

    expect(await response.json()).toMatchObject({
      fields: [{ field: "voiceId", message: "A voice ID is at most 200 characters." }],
    });
  });

  it("refuses a provider that does not speak", async () => {
    const { app } = harness();

    const response = await json(app, "/api/settings/voices", "POST", {
      provider: "openrouter",
      name: "Narrator M",
      voiceId: "abc123",
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ fields: [{ field: "provider" }] });
  });

  it("refuses a provider this build does not have", async () => {
    const { app } = harness();

    const response = await json(app, "/api/settings/voices", "POST", {
      provider: "not-a-provider",
      name: "Narrator M",
      voiceId: "abc123",
    });

    expect(response.status).toBe(400);
  });
});

describe("GET /api/settings/voices", () => {
  it("is empty on a fresh install", async () => {
    const { app } = harness();

    expect(await (await app.request("/api/settings/voices")).json()).toEqual({ voices: [] });
  });

  it("lists what was added", async () => {
    const { app } = harness();
    await json(app, "/api/settings/voices", "POST", {
      provider: "elevenlabs",
      name: "Narrator M",
      voiceId: "abc123",
    });

    expect(await (await app.request("/api/settings/voices")).json()).toEqual({
      voices: [{ id: "id1", provider: "elevenlabs", name: "Narrator M", voiceId: "abc123" }],
    });
  });
});

describe("DELETE /api/settings/voices/:id", () => {
  it("removes the entry", async () => {
    const { app } = harness();
    await json(app, "/api/settings/voices", "POST", {
      provider: "elevenlabs",
      name: "Narrator M",
      voiceId: "abc123",
    });

    const response = await app.request("/api/settings/voices/id1", { method: "DELETE" });

    expect(response.status).toBe(204);
    expect(await (await app.request("/api/settings/voices")).json()).toEqual({ voices: [] });
  });

  it("says so when no voice has that id", async () => {
    const { app } = harness();

    const response = await app.request("/api/settings/voices/id1", { method: "DELETE" });

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ detail: "No voice has that id." });
  });
});
