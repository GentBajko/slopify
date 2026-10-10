import { describe, expect, it } from "vitest";
import { fileSize } from "./consequences.js";

describe("fileSize", () => {
  it("uses binary units with one decimal under ten", () => {
    expect(fileSize(512)).toBe("512 B");
    expect(fileSize(3.4 * 1024 * 1024)).toBe("3.4 MB");
    expect(fileSize(12 * 1024 ** 3)).toBe("12 GB");
  });
});
