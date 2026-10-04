import { describe, expect, it } from "vitest";
import { sortLibrary } from "./sort";

const rows = [
  { name: "beta", updatedAt: "2026-09-01T00:00:00Z" },
  { name: "Alpha", updatedAt: "2026-08-01T00:00:00Z" },
  { name: "gamma", updatedAt: "2026-09-01T00:00:00Z" },
];

describe("sortLibrary", () => {
  it("orders by name without regard to case", () => {
    expect(sortLibrary(rows, "name").map((row) => row.name)).toEqual(["Alpha", "beta", "gamma"]);
  });

  it("puts the last changed first, ties by name, and leaves the input alone", () => {
    expect(sortLibrary(rows, "changed").map((row) => row.name)).toEqual(["beta", "gamma", "Alpha"]);
    expect(rows[0]?.name).toBe("beta");
  });
});
