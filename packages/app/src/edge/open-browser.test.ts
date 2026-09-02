import { describe, expect, it } from "vitest";
import { browserCommand } from "./open-browser.js";

describe("browserCommand", () => {
  it("uses the opener of the platform it runs on", () => {
    expect(browserCommand("darwin", "http://127.0.0.1:4242")).toEqual([
      "open",
      ["http://127.0.0.1:4242"],
    ]);
    expect(browserCommand("win32", "http://127.0.0.1:4242")).toEqual([
      "cmd",
      ["/c", "start", "", "http://127.0.0.1:4242"],
    ]);
    expect(browserCommand("linux", "http://127.0.0.1:4242")).toEqual([
      "xdg-open",
      ["http://127.0.0.1:4242"],
    ]);
  });
});
