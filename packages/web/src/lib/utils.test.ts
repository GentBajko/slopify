import { describe, expect, it } from "vitest";
import { exactTime, shortDate, startedAt } from "./utils.js";

describe("dates people compare", () => {
  const now = new Date(2026, 9, 4, 12, 0);

  it("reads today as a clock time and adds the year only for another year", () => {
    expect(startedAt(new Date(2026, 9, 4, 9, 30).toISOString(), now)).not.toMatch(/2026|Oct/);
    expect(startedAt(new Date(2026, 8, 30, 9, 30).toISOString(), now)).not.toContain("2026");
    expect(startedAt(new Date(2025, 8, 30, 9, 30).toISOString(), now)).toContain("2025");
    expect(shortDate(new Date(2025, 0, 2).toISOString(), now)).toContain("2025");
    expect(shortDate(new Date(2026, 0, 2).toISOString(), now)).not.toContain("2026");
  });

  it("gives the exact moment with its year for a hover", () => {
    expect(exactTime(new Date(2026, 9, 4, 21, 14).toISOString())).toContain("2026");
  });
});
