import { describe, expect, it, vi } from "vitest";
import { idleBeforeReload, reloadIfUpdated } from "../src/self-update.js";

function api(installType: string | undefined, running: string) {
  const reload = vi.fn();
  return {
    reload,
    api: {
      runtime: {
        getURL: (path: string) => `chrome-extension://x/${path}`,
        getManifest: () => ({ version: running }),
        reload,
      },
      management: { getSelf: async () => ({ installType }) },
    } as never,
  };
}

describe("reloadIfUpdated", () => {
  const quiet = idleBeforeReload + 1;
  it("reloads an unpacked extension when the folder holds another version and it is quiet", async () => {
    const { api: one, reload } = api("development", "1.3.2");
    expect(await reloadIfUpdated(one, 0, quiet, async () => ({ version: "1.3.3" }))).toBe(
      "reloaded",
    );
    expect(reload).toHaveBeenCalledOnce();
  });
  it("waits while a fill is going through it", async () => {
    const { api: one, reload } = api("development", "1.3.2");
    expect(await reloadIfUpdated(one, 1000, 2000, async () => ({ version: "1.3.3" }))).toBe("busy");
    expect(reload).not.toHaveBeenCalled();
  });
  it("leaves a store install and an unchanged folder alone", async () => {
    const store = api("normal", "1.3.2");
    expect(await reloadIfUpdated(store.api, 0, quiet, async () => ({ version: "1.3.3" }))).toBe(
      "not-unpacked",
    );
    const same = api("development", "1.3.2");
    expect(await reloadIfUpdated(same.api, 0, quiet, async () => ({ version: "1.3.2" }))).toBe(
      "current",
    );
    const missing = api("development", "1.3.2");
    expect(
      await reloadIfUpdated(missing.api, 0, quiet, async () => {
        throw new Error("gone");
      }),
    ).toBe("current");
    expect(store.reload).not.toHaveBeenCalled();
    expect(same.reload).not.toHaveBeenCalled();
    expect(missing.reload).not.toHaveBeenCalled();
  });
});
