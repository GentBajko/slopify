import { describe, expect, it } from "vitest";
import { fillKeywords, fillLateKeywords, mentionsKeyword } from "./fill.js";

describe("fillKeywords", () => {
  it("returns a body without keywords exactly as it was", () => {
    const body = "  Write about {{Topic}}.\n\n\n{{Scene}} and {{Appearance}}  ";
    expect(fillKeywords(body, "article", {})).toEqual({ ok: true, text: body });
  });

  it("fills each keyword with its value, every time it appears", () => {
    expect(
      fillKeywords("{{Slopify_Title}} on {{ Slopify_Channel }}: {{Slopify_Title}}", "article", {
        Slopify_Title: "The Gate",
        Slopify_Channel: "Quiet Histories",
      }),
    ).toEqual({ ok: true, text: "The Gate on Quiet Histories: The Gate" });
  });

  it("leaves out a line whose keyword has nothing to fill", () => {
    expect(
      fillKeywords("Intro.\n\nSeries: {{Slopify_Series}}\n\nEnd.", "article", {
        Slopify_Series: "",
      }),
    ).toEqual({ ok: true, text: "Intro.\n\nEnd." });
  });

  it("says which keywords are still being written", () => {
    expect(
      fillKeywords("{{Slopify_Summary}} {{Slopify_Hook}} {{Slopify_Title}}", "description", {
        Slopify_Title: "The Gate",
      }),
    ).toEqual({ ok: false, waiting: ["Slopify_Summary", "Slopify_Hook"] });
  });

  it("leaves the picture keywords for the pictures to fill", () => {
    const body = "{{Slopify_Scene}} {{Slopify_Setting}} {{Slopify_Mood}} {{Slopify_Appearance}}";
    expect(fillKeywords(body, "image", {})).toEqual({ ok: true, text: body });
  });

  it("leaves the release date and the length to be filled when the step runs", () => {
    const body = "On {{Slopify_Release_Date}}, {{Slopify_Duration}} long.";
    expect(fillKeywords(body, "description", {})).toEqual({ ok: true, text: body });
  });

  it("leaves a keyword alone where it can't be used, which Play refuses", () => {
    expect(fillKeywords("{{Slopify_Chapters}}", "article", {})).toEqual({
      ok: true,
      text: "{{Slopify_Chapters}}",
    });
  });

  it("leaves an unknown Slopify_ name for the person's own value", () => {
    expect(fillKeywords("{{Slopify_Wish}}", "article", {})).toEqual({
      ok: true,
      text: "{{Slopify_Wish}}",
    });
  });

  it("puts a value in as written, never reading keywords inside it", () => {
    expect(
      fillKeywords("{{Slopify_Title}}", "article", { Slopify_Title: "{{Slopify_Channel}}" }),
    ).toEqual({ ok: true, text: "{{Slopify_Channel}}" });
  });
});

describe("fillLateKeywords", () => {
  it("fills the release date and the length", () => {
    expect(
      fillLateKeywords("Out {{Slopify_Release_Date}}, {{Slopify_Duration}}.", {
        releaseDate: "Thursday 22 October 2026",
        duration: "42 min",
      }),
    ).toBe("Out Thursday 22 October 2026, 42 min.");
  });

  it("leaves out a line with no release date", () => {
    expect(fillLateKeywords("A\nOut {{Slopify_Release_Date}}\nB", {})).toBe("A\nB");
  });

  it("returns a text without them unchanged", () => {
    expect(fillLateKeywords("  plain {{Topic}}\n\n\n", {})).toBe("  plain {{Topic}}\n\n\n");
  });
});

describe("mentionsKeyword", () => {
  it("tells a body with a Slopify_ keyword from one without", () => {
    expect(mentionsKeyword("{{ Slopify_Title }}")).toBe(true);
    expect(mentionsKeyword("{{Scene}} {{Title}}")).toBe(false);
  });
});
