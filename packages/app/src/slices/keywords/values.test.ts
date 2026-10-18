import { describe, expect, it } from "vitest";
import { durationText, factValues, releaseDateText } from "./values.js";

const facts = {
  channel: "Night Archive",
  series: " Calm legends. ",
  links: [
    { name: "Website", url: "https://example.com" },
    { name: "Patreon", url: "https://patreon.com/x" },
  ],
  previousVideo: { title: "The Bridge", url: "https://youtu.be/a" },
  nextVideo: { title: "The Queen" },
  cast: [
    { name: "Mira", description: "an archivist" },
    { name: "Tom", description: " " },
  ],
  coveredBefore: ["The Bridge", "The Well"],
  episode: 7,
  brand: { colours: ["#ffffff", "#101010"], fonts: ["Barlow"] },
};

describe("factValues", () => {
  it("writes each fact as its keyword's text", () => {
    expect(factValues(facts, "The Gate", "article")).toEqual({
      Slopify_Title: "The Gate",
      Slopify_Channel: "Night Archive",
      Slopify_Series: "Calm legends.",
      Slopify_Links: "Website: https://example.com\nPatreon: https://patreon.com/x",
      Slopify_Previous_Video: "The Bridge – https://youtu.be/a",
      Slopify_Next_Video: "The Queen",
      Slopify_Cast: "Mira: an archivist\nTom",
      Slopify_Covered_Before: "The Bridge\nThe Well",
      Slopify_Episode: "7",
      Slopify_Brand: "Colours: #ffffff, #101010. Fonts: Barlow.",
    });
  });

  it("keeps the links live in a Description prompt", () => {
    const values = factValues(facts, "The Gate", "description");
    expect(values.Slopify_Links).toBe("Website: {{Website}}\nPatreon: {{Patreon}}");
    expect(values.Slopify_Previous_Video).toBe("{{Previous video}}");
    expect(values.Slopify_Next_Video).toBe("{{Next video}}");
  });

  it("leaves every fact blank when the run copied none", () => {
    const values = factValues(undefined, "The Gate", "image");
    expect(values.Slopify_Title).toBe("The Gate");
    expect(
      Object.entries(values)
        .filter(([name]) => name !== "Slopify_Title")
        .every(([, value]) => value === ""),
    ).toBe(true);
  });

  it("writes a previous video without a link as its title", () => {
    expect(
      factValues({ previousVideo: { title: "The Bridge" } }, "T", "article").Slopify_Previous_Video,
    ).toBe("The Bridge");
  });

  it("writes a brand kit with only fonts or only colours", () => {
    expect(factValues({ brand: { colours: [], fonts: ["A"] } }, "T", "image").Slopify_Brand).toBe(
      "Fonts: A.",
    );
    expect(
      factValues({ brand: { colours: ["#000000"], fonts: [] } }, "T", "image").Slopify_Brand,
    ).toBe("Colours: #000000.");
  });
});

describe("durationText", () => {
  it("says hours, minutes and seconds as far as they go", () => {
    expect(durationText(2530)).toBe("42 min 10 s");
    expect(durationText(3725.4)).toBe("1 h 2 min 5 s");
    expect(durationText(9)).toBe("9 s");
    expect(durationText(-3)).toBe("0 s");
  });
});

describe("releaseDateText", () => {
  it("says the date with its weekday", () => {
    expect(releaseDateText("2026-10-22T18:00:00.000Z", "UTC")).toBe("Thursday 22 October 2026");
  });

  it("is blank without a release time, or with one that is no date", () => {
    expect(releaseDateText("")).toBe("");
    expect(releaseDateText(undefined)).toBe("");
    expect(releaseDateText("soon")).toBe("");
  });
});
