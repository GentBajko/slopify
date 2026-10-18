import { describe, expect, it } from "vitest";
import { designCatalogue } from "./designs.fake.js";
import { poster } from "./document.fake.js";
import type { DesignSamples, SampleView } from "./sample.js";
import { designStudioKind } from "./studio-kind.js";

function kind(sample: SampleView | null, schedule = false) {
  const samples: DesignSamples = {
    afterSave: () => ({ ok: true, value: sample }),
    request: () => ({ ok: true, value: sample as SampleView }),
    state: () => sample,
    designChanged: () => {},
    recover: () => {},
  };
  return designStudioKind({
    catalogue: () => designCatalogue,
    samples,
    document: () =>
      poster(schedule ? { schedule: { dateField: "Date", daysBefore: 7, time: "09:00" } } : {}),
  });
}
const view = (state: SampleView["state"]): SampleView => ({
  state,
  version: 2,
  designId: "d1",
  heldReason: null,
  quotedHigh: 0.04,
});

describe("the design kind of the Template Studio", () => {
  it("has the four sections and the free checks", () => {
    const design = kind(null);
    expect(design.kind).toBe("design");
    expect(design.sections.map((section) => section.label)).toEqual([
      "Picture",
      "Text layout",
      "Formats",
      "Schedule",
    ]);
    expect(design.freeChecks(poster(), { templateId: "t1" }).every((check) => check.ok)).toBe(true);
  });

  it("quotes the artwork only when the picture changed", () => {
    const design = kind(null);
    expect(design.quoteSample(poster(), ["text", "formats"]).high).toBe(0);
    expect(design.quoteSample(poster(), ["picture"]).high).toBeCloseTo(0.04);
  });

  it("tells each section's state from the sample", () => {
    expect(kind(null).sampleState("t1")).toEqual({
      picture: "off",
      text: "off",
      formats: "off",
      schedule: "off",
    });
    expect(kind(view("making"), true).sampleState("t1")).toEqual({
      picture: "making",
      text: "current",
      formats: "current",
      schedule: "current",
    });
    expect(kind(view("held")).sampleState("t1").picture).toBe("waiting");
    expect(kind(view("failed")).sampleState("t1").picture).toBe("needs-fix");
    expect(kind(view("done")).sampleState("t1").picture).toBe("current");
  });
});
