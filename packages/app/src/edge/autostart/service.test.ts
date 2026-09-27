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
import { createApp } from "../http/app.js";
import type { LoginStart } from "./docker.js";
import type { NativeAutostart, NativeState } from "./native.js";
import { settleAutostart } from "./prompt.js";
import { type AutostartService, createAutostartService } from "./service.js";

const clock = fixedClock("2026-09-27T10:00:00.000Z");
const log: Log = { write: (): void => {} };
const ids: Ids = { next: (): string => "id" };

function database() {
  const paths = layout(mkdtempSync(join(tmpdir(), "slopify-autostart-")));
  ensureDirs(paths, { mode: 0o700 });
  const db = openDb(paths.db);
  migrate(db, clock);
  return { db, paths };
}

// A login entry that is only a flag, and can be told to fail.
function fakeNative(fail?: Error): NativeAutostart & { on: boolean } {
  const state = (enabled: boolean): NativeState => ({
    available: true,
    enabled,
    where: "/home/ann/.config/autostart/slopify.desktop",
    summary: enabled ? "on" : "off",
  });
  const native = {
    on: false,
    status: async () => state(native.on),
    enable: async () => {
      if (fail !== undefined) throw fail;
      native.on = true;
      return state(true);
    },
    disable: async () => {
      native.on = false;
      return state(false);
    },
    refresh: async () => {},
  };
  return native;
}

function app(
  autostart: AutostartService,
  paths: ReturnType<typeof layout>,
  db: ReturnType<typeof openDb>,
) {
  const created = createApp({
    autostart,
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
    version: "3.0.0",
    webDist: join(paths.dataDir, "missing"),
    flushSoon: (): void => {},
    probe: () => Promise.resolve({ ran: false, stdout: "" }),
  });
  return (method: string, path = "", body?: unknown) =>
    created.request(`/api/settings/autostart${path}`, {
      method,
      ...(body === undefined
        ? {}
        : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
    });
}

describe("GET/PUT /api/settings/autostart (native)", () => {
  it("offers the switch until it is answered, and turns it on and off", async () => {
    const { db, paths } = database();
    const native = fakeNative();
    const call = app(createAutostartService(db, { kind: "native", native }), paths, db);
    expect(await (await call("GET")).json()).toMatchObject({
      kind: "native",
      available: true,
      enabled: false,
      offer: true,
      where: "/home/ann/.config/autostart/slopify.desktop",
    });
    const on = await call("PUT", "", { enabled: true });
    expect(on.status).toBe(200);
    expect(await on.json()).toMatchObject({ enabled: true, offer: false });
    expect(native.on).toBe(true);
    expect(await (await call("PUT", "", { enabled: false })).json()).toMatchObject({
      enabled: false,
      offer: false,
    });
  });

  it("remembers No thanks without changing anything", async () => {
    const { db, paths } = database();
    const native = fakeNative();
    const call = app(createAutostartService(db, { kind: "native", native }), paths, db);
    expect(await (await call("POST", "/answer")).json()).toMatchObject({ offer: false });
    expect(native.on).toBe(false);
    expect(await (await call("GET")).json()).toMatchObject({ offer: false });
  });

  it("answers a failure with a sentence that says how to fix it", async () => {
    const { db, paths } = database();
    const denied = Object.assign(new Error("EACCES: permission denied"), {
      code: "EACCES",
      path: "/home/ann/.config/autostart",
    });
    const call = app(
      createAutostartService(db, { kind: "native", native: fakeNative(denied) }),
      paths,
      db,
    );
    const refused = await call("PUT", "", { enabled: true });
    expect(refused.status).toBe(409);
    const body = (await refused.json()) as { detail: string };
    expect(body.detail).toMatch(/\/home\/ann\/\.config\/autostart/u);
    expect(body.detail).toMatch(/Settings → General/u);
    // A failed attempt leaves the question open.
    expect(await (await call("GET")).json()).toMatchObject({ offer: true });
  });
});

describe("GET/PUT /api/settings/autostart (Docker)", () => {
  const record: LoginStart = {
    version: 1,
    checkedAt: "2026-09-27T09:00:00.000Z",
    docker: "no",
    manager: "system",
    wanted: true,
  };

  it("reports the installer's check and refuses to change Docker", async () => {
    const { db, paths } = database();
    const call = app(
      createAutostartService(db, { kind: "docker", record: async () => record }),
      paths,
      db,
    );
    expect(await (await call("GET")).json()).toMatchObject({
      kind: "docker",
      available: false,
      enabled: false,
      checkedAt: "2026-09-27T09:00:00.000Z",
      offer: false,
      howTo: expect.stringMatching(/sudo systemctl enable docker/u),
    });
    const refused = await call("PUT", "", { enabled: true });
    expect(refused.status).toBe(409);
    expect(((await refused.json()) as { detail: string }).detail).toMatch(
      /can't change it.*sudo systemctl enable docker/u,
    );
  });

  it("says plainly when it can't know, with Docker Desktop's setting", async () => {
    const { db, paths } = database();
    const call = app(
      createAutostartService(db, { kind: "docker", record: async () => null }),
      paths,
      db,
    );
    expect(await (await call("GET")).json()).toMatchObject({
      enabled: null,
      summary: expect.stringMatching(/can't see/u),
      howTo: expect.stringMatching(
        /Docker Desktop → Settings → General → Start Docker Desktop when you sign in/u,
      ),
    });
  });
});

describe("the terminal's question", () => {
  it("asks once on an interactive terminal and turns it on for Enter", async () => {
    const { db } = database();
    const native = fakeNative();
    const autostart = createAutostartService(db, { kind: "native", native });
    const asked: string[] = [];
    const lines: string[] = [];
    const settle = () =>
      settleAutostart({
        autostart,
        flag: undefined,
        interactive: true,
        ask: async (question) => {
          asked.push(question);
          return true;
        },
        report: (line) => lines.push(line),
        warn: (line) => lines.push(`warn: ${line}`),
      });
    await settle();
    await settle();
    expect(asked).toEqual(["Start Slopify when you log in? (Y/n) "]);
    expect(native.on).toBe(true);
    expect(lines[0]).toMatch(/Turn it off in Settings → General/u);
  });

  it("follows --no-autostart without asking, and never asks without a terminal", async () => {
    const { db } = database();
    const native = fakeNative();
    native.on = true;
    const autostart = createAutostartService(db, { kind: "native", native });
    const ask = () => Promise.reject(new Error("asked"));
    await settleAutostart({
      autostart,
      flag: undefined,
      interactive: false,
      ask,
      report: () => {},
      warn: () => {},
    });
    expect(native.on).toBe(true);
    await settleAutostart({
      autostart,
      flag: false,
      interactive: true,
      ask,
      report: () => {},
      warn: () => {},
    });
    expect(native.on).toBe(false);
  });

  it("without a terminal, leaves the question open for the first-run screen and Settings", async () => {
    const { db } = database();
    const native = fakeNative();
    const autostart = createAutostartService(db, { kind: "native", native });
    const lines: string[] = [];
    await settleAutostart({
      autostart,
      flag: undefined,
      interactive: false,
      ask: () => Promise.reject(new Error("asked")),
      report: (line) => lines.push(line),
      warn: (line) => lines.push(`warn: ${line}`),
    });
    expect(native.on).toBe(false);
    expect(lines).toEqual([
      expect.stringMatching(/Settings → General → Start Slopify when I log in/u),
    ]);
    expect(await autostart.unanswered()).toBe(true);
    expect((await autostart.view()).offer).toBe(true);
  });

  it("prints a refusal instead of failing the start", async () => {
    const { db } = database();
    const autostart = createAutostartService(db, {
      kind: "native",
      native: fakeNative(new Error("No room.")),
    });
    const warnings: string[] = [];
    await settleAutostart({
      autostart,
      flag: true,
      interactive: false,
      ask: async () => true,
      report: () => {},
      warn: (line) => warnings.push(line),
    });
    expect(warnings).toEqual(["No room."]);
  });
});
