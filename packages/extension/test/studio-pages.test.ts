import { expect, it } from "vitest";
import { studioDate, studioTime } from "../src/studio-pages.js";

it("writes dates and times the way Studio's schedule shows them", () => {
  const at = new Date(2026, 9, 4, 20, 0);
  expect(studioDate(at)).toBe("Oct 4, 2026");
  expect(studioTime(at)).toBe("8:00 PM");
});
