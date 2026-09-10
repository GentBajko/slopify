import { describe, expect, it } from "vitest";
import { newerVersion } from "./model.js";
import { createUpdater } from "./service.js";

function harness() {
  let now = 0;
  let busy = false;
  let latest = "0.6.2";
  let calls = 0;
  let finish = () => {};
  let fail = (_error: Error) => {};
  let restarting = () => {};
  const installs: string[] = [];
  const updater = createUpdater({
    currentVersion: "0.6.1",
    now: () => now,
    busy: () => busy,
    latest: async () => {
      calls++;
      return latest;
    },
    install: async (version, onRestart) => {
      installs.push(version);
      restarting = onRestart;
      await new Promise<void>((resolve, reject) => {
        finish = resolve;
        fail = reject;
      });
    },
    unsupported: () => undefined,
    report: () => {},
  });
  return {
    updater,
    installs,
    calls: () => calls,
    finish: () => finish(),
    fail: () => fail(new Error("private process output")),
    restarting: () => restarting(),
    setBusy: (value: boolean) => {
      busy = value;
    },
    setLatest: (value: string) => {
      latest = value;
    },
    advance: () => {
      now += 900_001;
    },
  };
}

describe("app updater", () => {
  it("caches checks for fifteen minutes, supports refresh, and never installs on a check", async () => {
    const h = harness();
    expect(await h.updater.check()).toMatchObject({
      available: true,
      canUpdate: true,
      latestVersion: "0.6.2",
    });
    await h.updater.check();
    expect(h.calls()).toBe(1);
    await h.updater.check(true);
    h.advance();
    await h.updater.check();
    expect(h.calls()).toBe(3);
    expect(h.installs).toEqual([]);
  });
  it("never downgrades or installs a non-stable or untrusted version", async () => {
    for (const value of ["0.6.0", "0.6.1", "0.7.0-beta.1", "latest; echo bad", "../other"]) {
      const h = harness();
      h.setLatest(value);
      expect((await h.updater.start()).ok).toBe(false);
      expect(h.installs).toEqual([]);
    }
    expect(newerVersion("0.10.0", "0.9.9")).toBe(true);
  });
  it("rechecks active work after the registry await before acquiring the install barrier", async () => {
    let busy = false;
    let installs = 0;
    const updater = createUpdater({
      currentVersion: "0.6.1",
      now: () => 0,
      busy: () => busy,
      latest: async () => {
        busy = true;
        return "0.6.2";
      },
      install: async () => {
        installs++;
      },
      unsupported: () => undefined,
      report: () => {},
    });
    expect(await updater.start()).toMatchObject({ ok: false, code: 409 });
    expect(installs).toBe(0);
  });
  it("locks mutations through installation and restart and admits only one click", async () => {
    const h = harness();
    const [first, second] = await Promise.all([h.updater.start(), h.updater.start()]);
    expect([first.ok, second.ok].filter(Boolean)).toHaveLength(1);
    expect(h.updater.locked()).toBe(true);
    expect((await h.updater.check()).status).toBe("installing");
    h.restarting();
    expect((await h.updater.check()).status).toBe("restarting");
    expect(h.installs).toEqual(["0.6.2"]);
    h.finish();
  });
  it("keeps the existing server usable after an installer failure without exposing process output", async () => {
    const h = harness();
    await h.updater.start();
    h.fail();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const info = await h.updater.check();
    expect(info.status).toBe("error");
    expect(h.updater.locked()).toBe(false);
    expect(info.error).not.toContain("private");
  });
  it("blocks updates until an admitted HTTP mutation settles and blocks mutations during install", async () => {
    const h = harness();
    const release = h.updater.beginMutation();
    expect(release).toBeTypeOf("function");
    expect(await h.updater.start()).toMatchObject({ ok: false, code: 409 });
    release?.();
    expect((await h.updater.start()).ok).toBe(true);
    expect(h.updater.beginMutation()).toBeUndefined();
    h.finish();
  });
  it("reports rollback on the restarted old server until an explicit install retry", async () => {
    const updater = createUpdater({
      currentVersion: "0.6.1",
      previousUpdateFailed: true,
      now: () => 0,
      busy: () => false,
      latest: async () => "0.6.2",
      unsupported: () => undefined,
      install: async () => {},
      report: () => {},
    });
    expect(await updater.check()).toMatchObject({
      status: "error",
      error: expect.stringContaining("previous version"),
    });
    expect((await updater.check(true)).status).toBe("error");
    expect(await updater.start()).toMatchObject({ ok: true, info: { status: "installing" } });
  });
  it("keeps candidate mutations blocked until the authenticated pointer commit, including concurrent unlocks", async () => {
    let committed = false;
    const token = "a".repeat(64);
    const updater = createUpdater({
      currentVersion: "0.6.2",
      now: () => 0,
      busy: () => false,
      candidate: { token, pending: true, committed: async () => committed },
      latest: async () => "0.6.3",
      unsupported: () => undefined,
      install: async () => {},
      report: () => {},
    });
    expect(updater.ready("b".repeat(64))).toBe(false);
    expect(updater.ready(token)).toBe(true);
    expect((await updater.check()).status).toBe("restarting");
    expect(updater.beginMutation()).toBeUndefined();
    expect(await updater.activate(token)).toBe(false);
    committed = true;
    expect(await updater.activate("b".repeat(64))).toBe(false);
    expect(updater.beginMutation()).toBeUndefined();
    expect(await Promise.all([updater.activate(token), updater.activate(token)])).toEqual([
      true,
      true,
    ]);
    const release = updater.beginMutation();
    expect(release).toBeTypeOf("function");
    release?.();
    expect((await updater.start()).ok).toBe(true);
    expect(await updater.activate(token)).toBe(true);
    expect(updater.beginMutation()).toBeUndefined();
  });
});
