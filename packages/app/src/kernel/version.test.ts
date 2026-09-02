import { describe, expect, it } from "vitest";
import { readVersion } from "./version.js";

describe("readVersion", () => {
  it("reads the package version next to the built module", () => {
    expect(readVersion()).toMatch(/^\d+\.\d+\.\d+/);
  });
});
