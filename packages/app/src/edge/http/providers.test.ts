import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { fixedClock } from "../../kernel/clock.fake.js";
import { openDb } from "../../kernel/db/index.js";
import { migrate } from "../../kernel/db/migrate.js";
import type { Ids } from "../../kernel/ids.js";
import type { Log } from "../../kernel/log.js";
import { ensureDirs, layout } from "../../kernel/paths.js";
import type { CliProbe } from "../../slices/settings/cli-status.js";
import { keyMask } from "../../slices/settings/keys.js";
import { keyOf } from "../../slices/settings/repo.js";
import { createHub } from "../events/hub.js";
import { createApp } from "./app.js";

const clock = fixedClock("2026-09-02T10:00:00.000Z");
const log: Log = { write: (): void => {} };
const ids: Ids = { next: (): string => "id1" };

// Not a key, and shaped so it cannot be mistaken for one: no provider prefix.
const standIn = "route-test-placeholder";
const notFound: CliProbe = () => Promise.resolve({ ran: false, stdout: "" });
const installed: CliProbe = () => Promise.resolve({ ran: true, stdout: "2.1.258 (Claude Code)" });

interface Harness {
  readonly app: ReturnType<typeof createApp>;
  readonly db: DatabaseSync;
}

function harness(probe: CliProbe = notFound): Harness {
  const paths = layout(mkdtempSync(join(tmpdir(), "slopify-providers-")));
  ensureDirs(paths, { mode: 0o700 });
  const db = openDb(paths.db);
  migrate(db, clock);
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
    probe,
  });
  return { app, db };
}

async function saveKey(app: Harness["app"], provider: string, key: string): Promise<Response> {
  return await app.request(`/api/providers/${provider}/key`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ key }),
  });
}

// The list is every supported provider, so a test that cares about one row picks it out
// rather than restating the catalogue.
const statusList = z.object({ providers: z.array(z.looseObject({ id: z.string() })) });

function statusOf(body: unknown, id: string): unknown {
  return statusList.parse(body).providers.find((status) => status.id === id);
}

describe("PUT /api/providers/:id/key", () => {
  it("stores the key and answers with the mask instead of the value", async () => {
    const { app } = harness();

    const response = await saveKey(app, "openrouter", standIn);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      provider: "openrouter",
      hasKey: true,
      masked: keyMask,
    });
  });

  it("puts no character of the key in the response", async () => {
    const { app } = harness();

    const body = await (await saveKey(app, "openrouter", standIn)).text();

    expect(body).not.toContain(standIn);
    expect(body).not.toContain(standIn.slice(-4));
  });

  it("stores the value the caller sent, trimmed", async () => {
    const { db, app } = harness();

    await saveKey(app, "elevenlabs", `  ${standIn}  `);

    expect(keyOf(db, "elevenlabs")).toBe(standIn);
  });

  it("overwrites the provider's previous key", async () => {
    const { db, app } = harness();
    await saveKey(app, "elevenlabs", standIn);

    await saveKey(app, "elevenlabs", `${standIn}-2`);

    expect(keyOf(db, "elevenlabs")).toBe(`${standIn}-2`);
  });

  it("refuses a key that is blank once trimmed", async () => {
    const { app } = harness();

    const response = await saveKey(app, "openrouter", "   ");

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      fields: [{ field: "key", message: "An API key is required." }],
    });
  });

  it("refuses an empty key at the schema", async () => {
    const { app } = harness();

    expect((await saveKey(app, "openrouter", "")).status).toBe(400);
  });

  it("refuses a key for a CLI provider", async () => {
    const { db, app } = harness();

    const response = await saveKey(app, "claude-code", standIn);

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      detail: "Claude Code CLI signs in through its own CLI, so there is no key to store here.",
    });
    expect(keyOf(db, "claude-code")).toBeUndefined();
  });

  it("refuses a provider this build does not have", async () => {
    const { app } = harness();

    expect((await saveKey(app, "not-a-provider", standIn)).status).toBe(400);
  });

  it("refuses a body that is not a key", async () => {
    const { app } = harness();

    const response = await app.request("/api/providers/openrouter/key", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: standIn }),
    });

    expect(response.status).toBe(400);
  });
});

describe("DELETE /api/providers/:id/key", () => {
  it("removes the key", async () => {
    const { db, app } = harness();
    await saveKey(app, "fal", standIn);

    const response = await app.request("/api/providers/fal/key", { method: "DELETE" });

    expect(response.status).toBe(204);
    expect(keyOf(db, "fal")).toBeUndefined();
  });

  it("says so when there was no key to remove", async () => {
    const { app } = harness();

    const response = await app.request("/api/providers/fal/key", { method: "DELETE" });

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ detail: "No key is stored for fal.ai." });
  });

  it("refuses for a CLI provider", async () => {
    const { app } = harness();

    expect((await app.request("/api/providers/codex/key", { method: "DELETE" })).status).toBe(400);
  });
});

describe("GET /api/providers", () => {
  it("lists every provider with its readiness and no key material", async () => {
    const { app } = harness();
    await saveKey(app, "openrouter", standIn);

    const response = await app.request("/api/providers");
    const body = await response.text();

    const parsed: unknown = JSON.parse(body);

    expect(response.status).toBe(200);
    expect(body).not.toContain(standIn);
    expect(statusOf(parsed, "openrouter")).toEqual({
      id: "openrouter",
      family: "llm",
      displayName: "OpenRouter",
      readiness: { kind: "keyed", hasKey: true },
    });
    expect(statusOf(parsed, "claude-code")).toEqual({
      id: "claude-code",
      family: "llm",
      displayName: "Claude Code CLI",
      readiness: { kind: "cli", installed: false },
    });
  });

  it("reports a keyed provider with no key as not ready", async () => {
    const { app } = harness();

    const body: unknown = await (await app.request("/api/providers")).json();

    expect(statusOf(body, "openrouter")).toMatchObject({
      readiness: { kind: "keyed", hasKey: false },
    });
  });

  it("reports a CLI provider whose binary answers as installed", async () => {
    const { app } = harness(installed);

    const body: unknown = await (await app.request("/api/providers")).json();

    expect(statusOf(body, "claude-code")).toMatchObject({
      readiness: { kind: "cli", installed: true, version: "2.1.258" },
    });
    expect(statusOf(body, "codex")).toMatchObject({
      readiness: { kind: "cli", installed: true, version: "2.1.258" },
    });
  });

  // The key is gone, so the row goes back to greyed on Play.
  it("stops reporting a key once it is removed", async () => {
    const { app } = harness();
    await saveKey(app, "openrouter", standIn);
    await app.request("/api/providers/openrouter/key", { method: "DELETE" });

    const body: unknown = await (await app.request("/api/providers")).json();

    expect(statusOf(body, "openrouter")).toMatchObject({
      readiness: { kind: "keyed", hasKey: false },
    });
  });
});
