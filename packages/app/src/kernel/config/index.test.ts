import { homedir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { configFrom } from "./index.js";

describe("configFrom", () => {
  it("falls back to the documented defaults", () => {
    expect(configFrom({}, {})).toEqual({
      port: 4242,
      host: "127.0.0.1",
      dataDir: join(homedir(), ".slopify"),
      open: true,
    });
  });

  it("prefers the environment over the defaults", () => {
    const config = configFrom(
      {},
      {
        SLOPIFY_PORT: "5000",
        SLOPIFY_HOST: "0.0.0.0",
        SLOPIFY_DATA_DIR: "/env/dir",
        SLOPIFY_NO_OPEN: "1",
      },
    );

    expect(config).toEqual({ port: 5000, host: "0.0.0.0", dataDir: "/env/dir", open: false });
  });

  it("prefers a flag over the environment", () => {
    const config = configFrom(
      { port: "6000", host: "::1", "data-dir": "/flag/dir", "no-open": true },
      {
        SLOPIFY_PORT: "5000",
        SLOPIFY_HOST: "0.0.0.0",
        SLOPIFY_DATA_DIR: "/env/dir",
        SLOPIFY_NO_OPEN: "",
      },
    );

    expect(config).toEqual({ port: 6000, host: "::1", dataDir: "/flag/dir", open: false });
  });

  it("treats an empty, zero or false SLOPIFY_NO_OPEN as unset", () => {
    for (const value of ["", "0", "false", "  "]) {
      expect(configFrom({}, { SLOPIFY_NO_OPEN: value }).open).toBe(true);
    }
  });

  it("resolves a relative data directory against the working directory", () => {
    expect(configFrom({ "data-dir": "./here" }, {}).dataDir).toBe(join(process.cwd(), "here"));
  });

  it.each(["abc", "", "80.5", "0", "-1", "65536"])("rejects the port %o", (port) => {
    expect(() => configFrom({ port }, {})).toThrow(/invalid port/);
  });

  it("names the source of a bad port from the environment", () => {
    expect(() => configFrom({}, { SLOPIFY_PORT: "nope" })).toThrow(
      'invalid port "nope": expected an integer between 1 and 65535',
    );
  });

  it("rejects a blank host", () => {
    expect(() => configFrom({ host: "  " }, {})).toThrow(/host must not be empty/);
  });
});
