import { expect, it } from "vitest";
import { metricValue, studioDate, studioTime } from "../src/studio-pages.js";

it("reads Studio's numbers as it writes them", () => {
  expect(metricValue("493")).toBe(493);
  expect(metricValue("2.2%")).toBe(2.2);
  expect(metricValue("1.2K")).toBe(1200);
  expect(metricValue("1,204")).toBe(1204);
  expect(metricValue("32:19")).toBe(1939);
  expect(metricValue("1:02:03")).toBe(3723);
  expect(metricValue("—")).toBeUndefined();
});

it("writes dates and times the way Studio's schedule shows them", () => {
  const at = new Date(2026, 9, 4, 20, 0);
  expect(studioDate(at)).toBe("Oct 4, 2026");
  expect(studioTime(at)).toBe("8:00 PM");
});
