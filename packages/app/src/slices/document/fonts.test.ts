import { jsPDF } from "jspdf";
import { expect, it } from "vitest";
import { faceWidth } from "./fonts.js";

it("measures a word as it is drawn, without the kerning the drawing leaves out", () => {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const times = { family: "times", style: "normal", letterSpacing: 0 } as const;
  // Times kerns "V" and "e" closer; the drawn text doesn't, so neither may the measure.
  expect(faceWidth(doc, times, 10, "Ve")).toBeCloseTo(
    faceWidth(doc, times, 10, "V") + faceWidth(doc, times, 10, "e"),
    6,
  );
});
