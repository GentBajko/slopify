import { describe, expect, it } from "vitest";
import { parsePronunciationGlossary, pronunciationSpans } from "./pronunciation.js";
import { prepareRequests } from "./steering.js";

describe("IPA request boundaries", () => {
  const parsed = parsePronunciationGlossary("Lich: /lɪtʃ/\nSzass Tam: /sæz tæm/");
  if (!parsed.ok) throw new Error(parsed.reason);
  const entries = parsed.entries;
  it("sends one slash pair per word and preserves all clean characters", () => {
    const source = "Szass \tTam is a LICH.";
    expect(prepareRequests(source, [], 100, pronunciationSpans(source, entries))).toEqual({
      ok: true,
      requests: [{ text: "/sæz/ \t/tæm/ is a /lɪtʃ/.", spokenText: source }],
    });
  });
  it("keeps IPA and astral points atomic across every nearby UTF-16 cap", () => {
    const source = "Lich 😀 Lich. Szass Tam.";
    for (let cap = 6; cap <= 40; cap++) {
      const result = prepareRequests(source, [], cap, pronunciationSpans(source, entries));
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.reason);
      expect(result.requests.map((part) => part.spokenText).join("")).toBe(source);
      for (const part of result.requests) {
        expect(part.text.length).toBeLessThanOrEqual(cap);
        expect(part.text.replace(/\/[^/]+\//gu, "")).not.toContain("/");
        expect(Buffer.from(part.text).toString("utf8")).toBe(part.text);
      }
    }
  });
  it("counts carried directions and does not repeat one-shot sounds", () => {
    const source = "Lich keeps speaking. Lich rests.";
    const result = prepareRequests(
      source,
      [
        { sentence: 1, kind: "instruction", text: "calm" },
        { sentence: 1, kind: "sound", sound: "sigh" },
      ],
      24,
      pronunciationSpans(source, entries),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason);
    expect(result.requests.map((part) => part.spokenText).join("")).toBe(source);
    expect(
      result.requests
        .map((part) => part.text)
        .join("")
        .match(/\[sigh\]/gu),
    ).toHaveLength(1);
    expect(result.requests.every((part) => part.text.startsWith("[calm] "))).toBe(true);
    expect(result.requests.every((part) => part.text.length <= 24)).toBe(true);
  });
  it("refuses an indivisible IPA token with no room after its required cue", () => {
    const source = "Lich";
    expect(prepareRequests(source, [], 5, pronunciationSpans(source, entries)).ok).toBe(false);
    expect(
      prepareRequests(
        source,
        [{ sentence: 1, kind: "instruction", text: "calm" }],
        12,
        pronunciationSpans(source, entries),
      ).ok,
    ).toBe(false);
    expect(
      prepareRequests(
        source,
        [{ sentence: 1, kind: "instruction", text: "calm" }],
        13,
        pronunciationSpans(source, entries),
      ),
    ).toEqual({
      ok: true,
      requests: [{ text: "[calm] /lɪtʃ/", spokenText: source }],
    });
  });
  it("leaves existing steering requests unchanged when there are no matches", () => {
    const source = "Ordinary 😀 words. More here.";
    for (let cap = 2; cap <= 60; cap++)
      expect(prepareRequests(source, [], cap, pronunciationSpans(source, entries))).toEqual(
        prepareRequests(source, [], cap),
      );
  });
});
