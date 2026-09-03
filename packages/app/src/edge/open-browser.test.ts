import { describe, expect, it } from "vitest";
import { browserCommand, isWsl } from "./open-browser.js";

const url = "http://127.0.0.1:6969";
const wslKernel = "Linux version 6.6.87.2-microsoft-standard-WSL2 (root@439a258ad544)";
const plainKernel = "Linux version 6.8.0-45-generic (buildd@lcy02)";

describe("browserCommand", () => {
  it("uses the opener of the platform it runs on", () => {
    expect(browserCommand("darwin", "http://127.0.0.1:6969")).toEqual([
      "open",
      ["http://127.0.0.1:6969"],
    ]);
    expect(browserCommand("win32", "http://127.0.0.1:6969")).toEqual([
      "cmd",
      ["/c", "start", "", "http://127.0.0.1:6969"],
    ]);
    expect(browserCommand("linux", "http://127.0.0.1:6969")).toEqual([
      "xdg-open",
      ["http://127.0.0.1:6969"],
    ]);
  });

  // Under WSL the platform is linux, but xdg-open reaches a browser inside the
  // distribution - usually none - rather than the Windows one on screen.
  it("crosses the interop boundary on WSL rather than opening inside the distribution", () => {
    expect(browserCommand("linux", url, true)).toEqual(["cmd.exe", ["/c", "start", "", url]]);
  });

  it("leaves real linux on xdg-open", () => {
    expect(browserCommand("linux", url, false)).toEqual(["xdg-open", [url]]);
  });
});

describe("isWsl", () => {
  it("reads the environment WSL sets", () => {
    expect(isWsl("linux", { WSL_DISTRO_NAME: "Ubuntu" }, () => plainKernel)).toBe(true);
    expect(isWsl("linux", { WSL_INTEROP: "/run/WSL/1582_interop" }, () => plainKernel)).toBe(true);
  });

  // Those variables are absent under `sudo` and in a shell a service started, so the
  // kernel string is what decides when they are missing.
  it("falls back to the kernel string when the environment says nothing", () => {
    expect(isWsl("linux", {}, () => wslKernel)).toBe(true);
    expect(isWsl("linux", {}, () => plainKernel)).toBe(false);
  });

  it("is false on a machine that is not linux at all", () => {
    expect(isWsl("darwin", { WSL_DISTRO_NAME: "Ubuntu" }, () => wslKernel)).toBe(false);
    expect(isWsl("win32", {}, () => wslKernel)).toBe(false);
  });

  // /proc/version does not exist everywhere, and a browser that does not open is a
  // nuisance rather than a reason to fail the boot.
  it("says no rather than throwing when the kernel cannot be read", () => {
    expect(
      isWsl("linux", {}, () => {
        throw new Error("ENOENT");
      }),
    ).toBe(false);
  });
});
