import { expect, it } from "vitest";
import { titleForPath } from "./document-title";

it("names every 4.0 page in the browser tab, not just Slopify", () => {
  expect(titleForPath("/designs")).toBe("Library · Designs");
  expect(titleForPath("/designs/d1")).toBe("Design");
  expect(titleForPath("/design-templates/t1")).toBe("Design template");
  expect(titleForPath("/templates")).toBe("Library · Templates");
  expect(titleForPath("/templates/t1")).toBe("Template studio");
  expect(titleForPath("/schedules/s1")).toBe("Calendar");
});
