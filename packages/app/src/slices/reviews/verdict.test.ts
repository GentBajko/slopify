import { describe, expect, it } from "vitest";
import { parseVerdict, reviewMessages } from "./verdict.js";

describe("parseVerdict", () => {
  it("reads a pass and a fail with its reasons", () => {
    expect(parseVerdict('{"verdict":"pass","reasons":[]}')).toEqual({
      ok: true,
      value: { passed: true, reasons: [] },
    });
    expect(
      parseVerdict(' {"verdict":"fail","reasons":["Six fingers on the left hand."]} '),
    ).toEqual({
      ok: true,
      value: { passed: false, reasons: ["Six fingers on the left hand."] },
    });
  });

  it("accepts the one ```json fence models add unasked", () => {
    expect(parseVerdict('```json\n{"verdict":"pass","reasons":[]}\n```')).toMatchObject({
      ok: true,
    });
  });

  it.each([
    ["prose", "Looks good to me!"],
    ["prose around the JSON", 'Sure: {"verdict":"pass","reasons":[]}'],
    ["an unknown verdict", '{"verdict":"maybe","reasons":[]}'],
    ["an extra key", '{"verdict":"pass","reasons":[],"score":9}'],
    ["a fail with no reason", '{"verdict":"fail","reasons":[]}'],
    ["a blank reason", '{"verdict":"fail","reasons":["  "]}'],
    ["a missing key", '{"verdict":"pass"}'],
    ["an empty answer", "  "],
  ])("refuses %s with a plain error saying what to do", (_, text) => {
    const parsed = parseVerdict(text);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.reason).toMatch(/^The reviewer/);
      expect(parsed.reason).toContain("Edit project → Reviews");
    }
  });

  it("names where the verdict was malformed", () => {
    const parsed = parseVerdict('{"verdict":"fail","reasons":[1]}');
    expect(!parsed.ok && parsed.reason).toContain("(reasons.0)");
  });
});

describe("reviewMessages", () => {
  it("asks for the strict answer and lists the attached images", () => {
    const messages = reviewMessages({
      stage: "images",
      instruction: "Check hands.",
      sections: [{ label: "Brief", text: "A lighthouse" }],
      images: ["the image to review"],
    });
    const user = messages.at(-1)?.content ?? "";
    expect(user).toContain("Check hands.");
    expect(user).toContain("the image to review");
    expect(user).toContain('{"verdict":"fail","reasons":["..."]}');
    expect(messages[0]?.role).toBe("system");
  });
});
