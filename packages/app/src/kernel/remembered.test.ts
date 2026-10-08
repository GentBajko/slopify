import { expect, it } from "vitest";
import { remembered } from "./remembered.js";

it("answers a repeated input from memory and forgets the oldest past its size", () => {
  let runs = 0;
  const double = remembered(
    2,
    (value: number) => String(value),
    (value: number) => {
      runs += 1;
      return value * 2;
    },
  );
  expect([double(1), double(1), double(2)]).toEqual([2, 2, 4]);
  expect(runs).toBe(2);
  double(3);
  double(1);
  expect(runs).toBe(4);
});
