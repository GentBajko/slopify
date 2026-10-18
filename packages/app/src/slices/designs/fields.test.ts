import { describe, expect, it } from "vitest";
import { poster } from "./document.fake.js";
import {
  designFields,
  fieldProblems,
  fillDocument,
  missingSentence,
  missingValues,
} from "./fields.js";
import { designDocumentSchema } from "./schema.js";

describe("design document schema", () => {
  it("takes a poster and refuses what it can't draw", () => {
    expect(designDocumentSchema.safeParse(poster()).success).toBe(true);
    const bad = [
      { ...poster(), version: 2 },
      poster({ formats: [] }),
      poster({
        formats: [
          { format: "a4", focus: { x: 0.5, y: 0.5 } },
          { format: "a4", focus: { x: 0, y: 0 } },
        ],
      }),
      poster({ formats: [{ format: "square", focus: { x: 1.5, y: 0 } }] }),
      poster({ formats: [{ format: "brochure", focus: { x: 0.5, y: 0.5 } }] }),
      poster({
        text: {
          ...poster().text,
          blocks: [{ ...poster().text.blocks[0], color: "white" } as never],
        },
      }),
      poster({
        text: {
          ...poster().text,
          blocks: [poster().text.blocks[0], poster().text.blocks[0]] as never,
        },
      }),
      poster({ picture: { ...poster().picture, castMemberIds: ["a", "b", "c", "d"] } }),
      poster({ schedule: { dateField: "Date", daysBefore: 91, time: "09:00" } }),
      poster({ schedule: { dateField: "Date", daysBefore: 7, time: "24:00" } }),
      { ...poster(), extra: true },
    ];
    for (const doc of bad) expect(designDocumentSchema.safeParse(doc).success).toBe(false);
  });

  it("needs a brochure's pages exactly when Brochure is ticked", () => {
    const brochure = {
      settings: { theme: "plain" as const },
      title: "{{Event}} programme",
      body: "# Tonight\n\nDoors at {{Doors}}.",
    };
    expect(
      designDocumentSchema.safeParse(
        poster({ formats: [{ format: "brochure", focus: { x: 0.5, y: 0.5 } }], brochure }),
      ).success,
    ).toBe(true);
    expect(designDocumentSchema.safeParse(poster({ brochure })).success).toBe(false);
  });
});

describe("design fields", () => {
  it("lists every field once, in the order it first appears", () => {
    expect(designFields(poster())).toEqual(["Event", "Date", "Venue", "Price"]);
    expect(
      designFields(
        poster({
          brochure: { settings: { theme: "plain" }, title: "{{Event}}", body: "At {{Doors}}" },
        }),
      ),
    ).toEqual(["Event", "Date", "Venue", "Price", "Doors"]);
  });

  it("names a reserved name, a broken field and a schedule date nobody uses", () => {
    const doc = poster({
      picture: { ...poster().picture, prompt: "{{Slopify_Title}} on {{Scene}} and {{Event" },
      schedule: { dateField: "When", daysBefore: 7, time: "09:00" },
    });
    expect(fieldProblems(doc).map((problem) => problem.sentence)).toEqual([
      "The picture prompt has a {{ without its }}. Fix it so every field reads {{Name}}.",
      "{{Slopify_Title}} is a name Slopify keeps for videos, so a design can't use it. Rename it (for example {{TitleText}}).",
      "{{Scene}} is a name Slopify keeps for videos, so a design can't use it. Rename it (for example {{SceneText}}).",
      "The schedule reads each row's date from {{When}}, but no text uses it. Put {{When}} in a text block, or choose another date field under Schedule.",
    ]);
    expect(fieldProblems(poster())).toEqual([]);
  });

  it("counts a blank or absent value as missing and says which to fill", () => {
    expect(missingValues(poster(), { Event: "Late Set", Date: " ", Venue: "Cellar" })).toEqual([
      "Date",
      "Price",
    ]);
    expect(missingValues(poster(), { constructor: "x" } as Record<string, string>)).toEqual([
      "Event",
      "Date",
      "Venue",
      "Price",
    ]);
    expect(missingSentence(["Price"])).toBe(
      "{{Price}} has no value. Fill it in under Fields, then press Make.",
    );
    expect(missingSentence(["Date", "Venue", "Price"])).toBe(
      "{{Date}}, {{Venue}} and {{Price}} have no value. Fill them in under Fields, then press Make.",
    );
  });

  it("fills every text verbatim, never reading a value as a field", () => {
    const filled = fillDocument(poster(), {
      Event: "{{Price}} night",
      Date: "2026-11-14",
      Venue: "Cellar",
      Price: "€12",
    });
    expect(filled.picture.prompt).toBe("A jazz club stage for {{Price}} night, warm light");
    expect(filled.text.blocks.map((block) => block.text)).toEqual([
      "{{Price}} night",
      "2026-11-14 · Cellar · €12",
    ]);
    expect(filled.formats).toEqual(poster().formats);
  });
});
