import { describe, expect, it } from "vitest";
import { poster } from "./document.fake.js";
import { designDocumentSchema } from "./schema.js";
import { designAffectedSections, sampleNeedsPicture, sectionOfKey } from "./sections.js";

describe("which sections a Save changed", () => {
  it("places every key of the document in a section", () => {
    expect(Object.keys(sectionOfKey).toSorted()).toEqual(
      Object.keys(designDocumentSchema.shape).toSorted(),
    );
  });

  it("names the sections whose settings differ, in the editor's order", () => {
    const before = poster();
    expect(designAffectedSections(before, before)).toEqual([]);
    expect(
      designAffectedSections(before, poster({ text: { ...before.text, preset: "centered" } })),
    ).toEqual(["text"]);
    expect(
      designAffectedSections(
        before,
        poster({
          schedule: { dateField: "Date", daysBefore: 7, time: "09:00" },
          formats: [{ format: "square", focus: { x: 0.5, y: 0.5 } }],
        }),
      ),
    ).toEqual(["formats", "schedule"]);
    expect(
      designAffectedSections(before, poster({ picture: { ...before.picture, prompt: "A barn" } })),
    ).toEqual(["picture"]);
  });

  it("counts a changed sample the prompt uses as a new picture, and others as text only", () => {
    const before = poster();
    const venue = poster({ samples: { ...before.samples, Venue: "The Attic" } });
    expect(designAffectedSections(before, venue)).toEqual(["text"]);
    expect(sampleNeedsPicture(designAffectedSections(before, venue))).toBe(false);
    const event = poster({ samples: { ...before.samples, Event: "Early Set" } });
    expect(designAffectedSections(before, event)).toEqual(["picture", "text"]);
    const own = (doc: typeof before) => ({
      ...doc,
      picture: { ...doc.picture, source: "picture" as const },
    });
    expect(designAffectedSections(own(before), own(event))).toEqual(["text"]);
  });
});
