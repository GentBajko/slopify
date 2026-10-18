import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { fixedClock } from "../../kernel/clock.fake.js";
import { openDb } from "../../kernel/db/index.js";
import { migrate } from "../../kernel/db/migrate.js";
import type { Log } from "../../kernel/log.js";
import { ensureDirs, layout } from "../../kernel/paths.js";
import { readSetting } from "../../slices/settings/repo.js";
import { assertServeOnly, guarded } from "./cli.js";
import { remoteAccessAppliedKey } from "./model.js";
import { createRemoteAccessService, type RemoteAccessDeps } from "./service.js";
import { type FakeTailscale, fakeDns, fakeTailscale, othersProxy } from "./tailscale.fake.js";

const clock = fixedClock("2026-10-18T10:00:00.000Z");

function database() {
  const paths = layout(mkdtempSync(join(tmpdir(), "slopify-remote-")));
  ensureDirs(paths, { mode: 0o700 });
  const db = openDb(paths.db);
  migrate(db, clock);
  return db;
}

function setup(fake: FakeTailscale = fakeTailscale(), over: Partial<RemoteAccessDeps> = {}) {
  const logged: string[] = [];
  const log: Log = {
    write: (_level, event, fields) => logged.push(`${event} ${fields?.detail ?? ""}`),
  };
  let at = 0;
  const deps: RemoteAccessDeps = {
    db: database(),
    run: fake.run,
    platform: "linux",
    container: false,
    listenHost: "127.0.0.1",
    port: () => 6970,
    log,
    // Every call is later than the cache, so each read asks Tailscale again.
    now: () => {
      at += 10_000;
      return at;
    },
    ...over,
  };
  return { fake, deps, logged, service: createRemoteAccessService(deps) };
}

const target = "http://127.0.0.1:6970";

describe("turning it on", () => {
  it("serves Slopify's local port over HTTPS on the tailnet and shows the address", async () => {
    const { fake, service } = setup();
    const view = await service.set(true);
    expect(view.state).toBe("on");
    expect(view.address).toBe(`https://${fakeDns}`);
    expect(fake.calls).toContainEqual(["serve", "--bg", "--yes", "--https=443", target]);
    expect(fake.config.Web?.[`${fakeDns}:443`]?.Handlers?.["/"]?.Proxy).toBe(target);
    expect(service.remoteHost()).toBe(fakeDns);
    expect((await service.view()).state).toBe("on");
  });

  it("writes the port into the address when it isn't 443", async () => {
    const { service } = setup();
    const view = await service.set(true, 8443);
    expect(view.address).toBe(`https://${fakeDns}:8443`);
    expect(service.remoteHost()).toBe(`${fakeDns}:8443`);
  });

  it("never runs tailscale funnel, on any path", async () => {
    const fake = fakeTailscale(othersProxy(443, "http://127.0.0.1:3000"));
    const { service } = setup(fake);
    await service.set(true);
    await service.set(true, 8443);
    await service.view();
    await service.set(false);
    await service.start();
    await service.stop();
    expect(fake.calls.length).toBeGreaterThan(0);
    expect(fake.calls.filter((call) => call.some((arg) => /funnel/iu.test(arg)))).toEqual([]);
    expect(new Set(fake.calls.map((call) => call[0]))).toEqual(new Set(["status", "serve"]));
  });

  it("refuses any command that names Funnel before it runs", async () => {
    expect(() => assertServeOnly(["funnel", "443", "on"])).toThrow(
      /never turns on Tailscale Funnel|only runs/u,
    );
    expect(() => assertServeOnly(["serve", "--funnel", "443"])).toThrow(/Funnel/u);
    expect(() => assertServeOnly(["up"])).toThrow(
      /only runs tailscale status and tailscale serve/u,
    );
    let ran = false;
    const run = guarded(async () => {
      ran = true;
      return { code: 0, stdout: "", stderr: "", missing: false, timedOut: false };
    });
    await expect(run(["funnel", "--bg", "6969"])).rejects.toThrow(/Funnel|only runs/u);
    expect(ran).toBe(false);
  });

  it("removes its address again when Funnel turns out to be on for it", async () => {
    const fake = fakeTailscale();
    fake.funnelOnAdd = true;
    const { service } = setup(fake);
    const view = await service.set(true);
    expect(view.state).toBe("funnel");
    expect(view.fix).toContain("tailscale funnel --https=443 off");
    expect(fake.config.Web?.[`${fakeDns}:443`]).toBeUndefined();
    expect(service.remoteHost()).toBeUndefined();
  });

  it("leaves another serve setting on 443 alone and offers 8443", async () => {
    const fake = fakeTailscale(othersProxy(443, "http://127.0.0.1:3000"));
    const { service } = setup(fake);
    const view = await service.set(true);
    expect(view.state).toBe("port-taken");
    expect(view.suggestedPort).toBe(8443);
    expect(view.summary).toContain("http://127.0.0.1:3000");
    expect(view.fix).toContain("Use port 8443");
    expect(fake.calls.some((call) => call.includes("--bg"))).toBe(false);
    expect(fake.config).toEqual(othersProxy(443, "http://127.0.0.1:3000"));
  });

  it("says when the other setting already points at this Slopify, and still leaves it", async () => {
    const fake = fakeTailscale(othersProxy(443, target));
    const { service } = setup(fake);
    const view = await service.set(true);
    expect(view.state).toBe("port-taken");
    expect(view.summary).toMatch(/outside Slopify, so Slopify leaves it alone/u);
    const off = await service.set(false);
    expect(off.state).toBe("off");
    expect(fake.config).toEqual(othersProxy(443, target));
  });

  it("moves its own handler when Slopify's port or the chosen HTTPS port changes", async () => {
    let port = 6970;
    const fake = fakeTailscale();
    const { service } = setup(fake, { port: () => port });
    await service.set(true);
    port = 7000;
    const view = await service.set(true, 8443);
    expect(view.state).toBe("on");
    expect(fake.config.Web?.[`${fakeDns}:443`]).toBeUndefined();
    expect(fake.config.Web?.[`${fakeDns}:8443`]?.Handlers?.["/"]?.Proxy).toBe(
      "http://127.0.0.1:7000",
    );
  });
});

describe("problems, each with what to do", () => {
  it("Tailscale not installed links to the download", async () => {
    const fake = fakeTailscale();
    fake.installed = false;
    const view = await setup(fake).service.set(true);
    expect(view.state).toBe("not-installed");
    expect(view.link).toBe("https://tailscale.com/download");
    expect(view.fix).toMatch(/Install Tailscale/u);
  });

  it("tailscaled not running says tailscale up or the app", async () => {
    const fake = fakeTailscale();
    fake.backend = "down";
    const view = await setup(fake).service.set(true);
    expect(view.state).toBe("not-running");
    expect(view.fix).toMatch(/tailscale up/u);
  });

  it("Tailscale stopped in the app is not running too", async () => {
    const fake = fakeTailscale();
    fake.backend = "Stopped";
    expect((await setup(fake).service.set(true)).state).toBe("not-running");
  });

  it("signed out says to sign in", async () => {
    const fake = fakeTailscale();
    fake.backend = "NeedsLogin";
    const view = await setup(fake).service.set(true);
    expect(view.state).toBe("signed-out");
    expect(view.fix).toMatch(/sign in/u);
  });

  it("HTTPS certificates off names the admin console's DNS page, and never runs serve", async () => {
    const fake = fakeTailscale();
    fake.https = false;
    const view = await setup(fake).service.set(true);
    expect(view.state).toBe("https-off");
    expect(view.link).toBe("https://login.tailscale.com/admin/dns");
    expect(view.fix).toMatch(/MagicDNS.*Enable HTTPS/u);
    expect(fake.calls.some((call) => call.includes("--bg"))).toBe(false);
  });

  it("permission denied on Linux names tailscale set --operator", async () => {
    const fake = fakeTailscale();
    fake.denyServe = true;
    const { service } = setup(fake);
    const view = await service.set(true);
    expect(view.state).toBe("denied");
    expect(view.fix).toContain("sudo tailscale set --operator=$USER");
    expect(service.remoteHost()).toBeUndefined();
  });

  it("a hung Tailscale is cut off with a sentence", async () => {
    const fake = fakeTailscale();
    fake.hang = true;
    const view = await setup(fake).service.set(true);
    expect(view.state).toBe("failed");
    expect(view.summary).toMatch(/didn't answer/u);
  });

  it("in Docker it changes nothing and says it needs the app on the computer", async () => {
    const fake = fakeTailscale();
    const { service } = setup(fake, { container: true });
    const view = await service.set(true);
    expect(view.state).toBe("docker");
    expect(view.available).toBe(false);
    expect(view.fix).toMatch(/npx @gentbajko\/slopify/u);
    expect(fake.calls).toEqual([]);
  });

  it("an address removed outside Slopify reads as not set up, until Check again", async () => {
    const fake = fakeTailscale();
    const { service } = setup(fake);
    await service.set(true);
    fake.config = {};
    expect((await service.view()).state).toBe("not-applied");
    expect((await service.set(true)).state).toBe("on");
  });
});

describe("turning it off", () => {
  it("removes exactly its own handler and keeps the person's", async () => {
    const theirs = othersProxy(443, "http://127.0.0.1:3000");
    const fake = fakeTailscale(theirs);
    const { deps, service } = setup(fake);
    expect((await service.set(true, 8443)).state).toBe("on");
    const view = await service.set(false);
    expect(view.state).toBe("off");
    expect(fake.calls).toContainEqual(["serve", "--yes", "--https=8443", "off"]);
    expect(fake.calls.some((call) => call.includes("--https=443"))).toBe(false);
    expect(fake.config.Web).toEqual(theirs.Web);
    expect(fake.config.TCP).toEqual(theirs.TCP);
    expect(readSetting(deps.db, remoteAccessAppliedKey)).toBeUndefined();
    expect(service.remoteHost()).toBeUndefined();
  });

  it("leaves a handler the person changed since", async () => {
    const fake = fakeTailscale();
    const { service } = setup(fake);
    await service.set(true);
    fake.config = othersProxy(443, "http://127.0.0.1:3000");
    expect((await service.set(false)).state).toBe("off");
    expect(fake.calls.some((call) => call.at(-1) === "off")).toBe(false);
    expect(fake.config).toEqual(othersProxy(443, "http://127.0.0.1:3000"));
  });

  it("keeps trying when Tailscale is down, and says so", async () => {
    const fake = fakeTailscale();
    const { service } = setup(fake);
    await service.set(true);
    fake.backend = "down";
    const view = await service.set(false);
    expect(view.enabled).toBe(false);
    expect(view.summary).toMatch(/couldn't remove its address/u);
    expect(view.fix).toContain("tailscale serve --https=443 off");
    fake.backend = "Running";
    await service.start();
    expect(fake.config.Web?.[`${fakeDns}:443`]).toBeUndefined();
  });
});

describe("start and stop", () => {
  it("removes its handler at shutdown, keeps the switch, and puts it back at the next start", async () => {
    const fake = fakeTailscale();
    const first = setup(fake);
    await first.service.set(true);
    await first.service.stop();
    expect(fake.config.Web?.[`${fakeDns}:443`]).toBeUndefined();
    const second = createRemoteAccessService(first.deps);
    expect((await second.view()).state).toBe("not-applied");
    await second.start();
    expect((await second.view()).state).toBe("on");
  });

  it("after a crash, replaces the handler that points at the old port", async () => {
    const fake = fakeTailscale();
    const first = setup(fake);
    await first.service.set(true);
    const restarted = createRemoteAccessService({ ...first.deps, port: () => 7100 });
    await restarted.start();
    expect(fake.config.Web?.[`${fakeDns}:443`]?.Handlers?.["/"]?.Proxy).toBe(
      "http://127.0.0.1:7100",
    );
  });

  it("does nothing at start when the switch is off", async () => {
    const fake = fakeTailscale();
    const { service } = setup(fake);
    await service.start();
    await service.stop();
    expect(fake.calls).toEqual([]);
  });

  it("logs a start-up problem with its fix", async () => {
    const fake = fakeTailscale();
    const { service, logged } = setup(fake);
    await service.set(true);
    fake.denyServe = true;
    fake.config = {};
    await service.start();
    expect(logged.join("\n")).toMatch(/remote-access.start .*--operator/u);
  });

  it("answers repeated reads from one check", async () => {
    const fake = fakeTailscale();
    const { service } = setup(fake, { now: () => 0 });
    await service.set(true);
    const before = fake.calls.length;
    await service.view();
    await service.view();
    expect(fake.calls.length).toBe(before);
  });
});
