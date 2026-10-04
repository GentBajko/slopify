import { describe, expect, it } from "vitest";
import { fileSize, usd } from "./format";

describe("usd", () => {
  it("writes nothing as $0, a fraction of a cent with its digits and the rest in cents", () => {
    expect(usd(0)).toBe("$0");
    expect(usd(0.0032)).toBe("$0.0032");
    expect(usd(0.5)).toBe("$0.50");
    expect(usd(1234.5)).toBe("$1,234.50");
  });
});

describe("fileSize", () => {
  it("uses binary units with one decimal under ten", () => {
    expect(fileSize(512)).toBe("512 B");
    expect(fileSize(3.4 * 1024 * 1024)).toBe("3.4 MB");
    expect(fileSize(12 * 1024 ** 3)).toBe("12 GB");
  });
});
