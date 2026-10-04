import { expect, it } from "vitest";
import { limitCount } from "./limit-count";

it("counts against the limit and says how far over it is", () => {
  expect(limitCount(1234, 10000, "characters")).toBe("1,234 of 10,000 characters");
  expect(limitCount(10002, 10000, "characters")).toBe(
    "10,002 of 10,000 characters: 2 over the limit, shorten it to save.",
  );
});
