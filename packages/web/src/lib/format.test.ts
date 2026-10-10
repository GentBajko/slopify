import { describe, expect, it } from "vitest";
import { usd } from "./format";

describe("usd", () => {
  it("writes nothing as $0, a fraction of a cent with its digits and the rest in cents", () => {
    expect(usd(0)).toBe("$0");
    expect(usd(0.0032)).toBe("$0.0032");
    expect(usd(0.5)).toBe("$0.50");
    expect(usd(1234.5)).toBe("$1,234.50");
  });
});
