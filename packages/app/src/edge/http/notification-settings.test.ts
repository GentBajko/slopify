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
import type { SendNotification, SendResult } from "../../slices/notifications/send.js";
import { createHub } from "../events/hub.js";
import { createApp } from "./app.js";

const clock = fixedClock("2026-09-27T10:00:00.000Z");
const log: Log = { write: (): void => {} };
const ids: Ids = { next: (): string => "id" };

function harness(answer: SendResult = { ok: true }) {
  const paths = layout(mkdtempSync(join(tmpdir(), "slopify-notify-")));
  ensureDirs(paths, { mode: 0o700 });
  const db = openDb(paths.db);
  migrate(db, clock);
  const posted: { url: string; body: string }[] = [];
  const sendNotification: SendNotification = (url, body) => {
    posted.push({ url, body });
    return Promise.resolve(answer);
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
    sendNotification,
    clock,
    ids,
    log,
    version: "1.2.3",
    webDist: join(paths.dataDir, "missing"),
    flushSoon: (): void => {},
    probe: () => Promise.resolve({ ran: false, stdout: "" }),
  });
  const call = (path: string, method: string, body?: unknown) =>
    app.request(`/api/settings/notifications${path}`, {
      method,
      headers: { "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  return { call, posted };
}

describe("/api/settings/notifications", () => {
  it("saves, reads back and clears the Notification URL", async () => {
    const { call } = harness();
    expect(await (await call("", "GET")).json()).toEqual({ url: null });
    const saved = await call("", "PUT", { url: " https://ntfy.sh/slopify-runs " });
    expect(await saved.json()).toEqual({ url: "https://ntfy.sh/slopify-runs" });
    expect(await (await call("", "GET")).json()).toEqual({ url: "https://ntfy.sh/slopify-runs" });
    await call("", "PUT", { url: "" });
    expect(await (await call("", "GET")).json()).toEqual({ url: null });
  });

  it("refuses a URL that is not http or https and names the control", async () => {
    const { call } = harness();
    const response = await call("", "PUT", { url: "javascript:alert(1)" });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { detail: string; fields: { field: string }[] };
    expect(body.detail).toContain("Settings → Notifications → Notification URL");
    expect(body.fields[0]?.field).toBe("url");
  });

  it("sends a test notification to the given URL", async () => {
    const { call, posted } = harness();
    const response = await call("/test", "POST", { url: "https://ntfy.sh/slopify-runs" });
    expect(response.status).toBe(200);
    expect(posted).toHaveLength(1);
    expect(posted[0]?.body.startsWith("Slopify test notification\n")).toBe(true);
  });

  it("says why a test notification wasn't delivered", async () => {
    const { call } = harness({ ok: false, reason: "refused", status: 404 });
    const response = await call("/test", "POST", { url: "https://ntfy.sh/slopify-runs" });
    expect(response.status).toBe(502);
    const body = (await response.json()) as { detail: string };
    expect(body.detail).toContain("answered HTTP 404");
    expect(body.detail).toContain("Send test notification");
    expect(body.detail).not.toContain("slopify-runs");
  });
});
