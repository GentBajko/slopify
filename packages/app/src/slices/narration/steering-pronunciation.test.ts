import { describe, expect, it } from "vitest";
import { type Cue, preparationMessages, sourceSentences } from "./preparation.js";
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
  it.each(["'Lich'", "‘Lich’"])("preserves quotes around %s in both texts", (quoted) => {
    const source = `The ${quoted} returns.`;
    expect(prepareRequests(source, [], 100, pronunciationSpans(source, entries))).toEqual({
      ok: true,
      requests: [{ text: source.replace("Lich", "/lɪtʃ/"), spokenText: source }],
    });
  });
  it("keeps punctuated terms intact at sentence and request boundaries", () => {
    const parsed = parsePronunciationGlossary("P!nk: /pɪŋk/");
    if (!parsed.ok) throw new Error(parsed.reason);
    const source = "P!nk sings.\r\n😀 P!nk returns.";
    for (const cap of [4000, ...Array.from({ length: 35 }, (_, index) => index + 6)]) {
      const result = prepareRequests(source, [], cap, pronunciationSpans(source, parsed.entries));
      expect(result.ok, `cap ${cap}`).toBe(true);
      if (!result.ok) throw new Error(result.reason);
      expect(result.requests.map((part) => part.spokenText).join("")).toBe(source);
      expect(result.requests.map((part) => part.text).join("")).toBe(
        "/pɪŋk/ sings.\r\n😀 /pɪŋk/ returns.",
      );
      for (const part of result.requests) {
        expect(part.text.length).toBeLessThanOrEqual(cap);
        expect(part.text.replaceAll("/pɪŋk/", "")).not.toContain("/");
        expect(Buffer.from(part.text).toString("utf8")).toBe(part.text);
      }
    }
  });
  it("moves an interior sentence cue immediately before its term without changing preparation", () => {
    const parsed = parsePronunciationGlossary("P!nk: /pɪŋk/");
    if (!parsed.ok) throw new Error(parsed.reason);
    const source = "Hello P!nk sings. Later.";
    const messages = preparationMessages("calm", source);
    expect(sourceSentences(source)).toEqual([
      { sentence: 1, text: "Hello P!" },
      { sentence: 2, text: "nk sings. " },
      { sentence: 3, text: "Later." },
    ]);
    expect(
      prepareRequests(
        source,
        [
          { sentence: 2, kind: "instruction", text: "warm" },
          { sentence: 2, kind: "sound", sound: "sigh" },
          { sentence: 3, kind: "reset" },
        ],
        100,
        pronunciationSpans(source, parsed.entries),
      ),
    ).toEqual({
      ok: true,
      requests: [{ text: "Hello [warm] [sigh] /pɪŋk/ sings. [reset] Later.", spokenText: source }],
    });
    expect(preparationMessages("calm", source)).toEqual(messages);
  });
  it.each([false, true])("carries the last collapsed direction (reset: %s)", (reset) => {
    const parsed = parsePronunciationGlossary("A!B?C: /eɪ/");
    if (!parsed.ok) throw new Error(parsed.reason);
    const source = "A!B?C sings. More words keep going for several requests.";
    const cues: Cue[] = [
      { sentence: 1, kind: "instruction", text: "calm" },
      { sentence: 1, kind: "sound", sound: "sigh" },
      { sentence: 2, kind: "instruction", text: "warm" },
      { sentence: 2, kind: "sound", sound: "sigh" },
      reset ? { sentence: 3, kind: "reset" } : { sentence: 3, kind: "instruction", text: "bright" },
      { sentence: 3, kind: "sound", sound: "laugh" },
    ];
    const prefix = `[calm] [sigh] [warm] [sigh] [${reset ? "reset" : "bright"}] [laugh] `;
    const cap = prefix.length + "/eɪ/".length;
    const spans = pronunciationSpans(source, parsed.entries);
    expect(prepareRequests(source, cues, cap - 1, spans).ok).toBe(false);
    const result = prepareRequests(source, cues, cap, spans);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason);
    expect(result.requests[0]).toEqual({ text: `${prefix}/eɪ/`, spokenText: "A!B?C" });
    expect(result.requests.length).toBeGreaterThan(1);
    expect(result.requests.map((part) => part.spokenText).join("")).toBe(source);
    expect(
      result.requests
        .map((part) => part.text)
        .join("")
        .match(/\[sigh\]/gu),
    ).toHaveLength(2);
    expect(
      result.requests
        .map((part) => part.text)
        .join("")
        .match(/\[laugh\]/gu),
    ).toHaveLength(1);
    for (const part of result.requests.slice(1)) {
      expect(part.text.length).toBeLessThanOrEqual(cap);
      expect(part.text.startsWith("[bright] ")).toBe(!reset);
      expect(part.text).not.toContain("[calm]");
      expect(part.text).not.toContain("[warm]");
      expect(part.text).not.toContain("[reset]");
    }
  });
  it("refuses an interior cue when its indivisible term cannot fit", () => {
    const parsed = parsePronunciationGlossary("P!nk: /pɪŋk/");
    if (!parsed.ok) throw new Error(parsed.reason);
    const source = "Hello P!nk sings.";
    const spans = pronunciationSpans(source, parsed.entries);
    const cues: Cue[] = [{ sentence: 2, kind: "instruction", text: "calm" }];
    expect(prepareRequests(source, [], 5, spans).ok).toBe(false);
    expect(prepareRequests(source, cues, 12, spans).ok).toBe(false);
    const result = prepareRequests(source, cues, 13, spans);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason);
    expect(result.requests[1]).toEqual({ text: "[calm] /pɪŋk/", spokenText: "P!nk" });
    expect(result.requests.map((part) => part.spokenText).join("")).toBe(source);
    expect(result.requests.every((part) => part.text.length <= 13)).toBe(true);
  });
  it("does not detach an interior sound from its term to fit trailing whitespace", () => {
    const parsed = parsePronunciationGlossary("P!nk: /pɪŋk/");
    if (!parsed.ok) throw new Error(parsed.reason);
    const source = "Hi P!nk    sings.";
    const result = prepareRequests(
      source,
      [{ sentence: 2, kind: "sound", sound: "sigh" }],
      16,
      pronunciationSpans(source, parsed.entries),
    );
    expect(result).toEqual({
      ok: true,
      requests: [
        { text: "Hi [sigh] /pɪŋk/", spokenText: "Hi P!nk" },
        { text: "    sings.", spokenText: "    sings." },
      ],
    });
  });
  it("preserves the original sentence anchors with empty or unmatched spans", () => {
    const source = "Hello P!nk sings. Later.";
    const cues: Cue[] = [
      { sentence: 2, kind: "instruction", text: "warm" },
      { sentence: 2, kind: "sound", sound: "sigh" },
      { sentence: 3, kind: "reset" },
    ];
    expect(prepareRequests(source, cues, 100, [])).toEqual({
      ok: true,
      requests: [{ text: "Hello P![warm] [sigh] nk sings. [reset] Later.", spokenText: source }],
    });
    for (let cap = 2; cap <= 60; cap++) {
      expect(prepareRequests(source, cues, cap, [])).toEqual(prepareRequests(source, cues, cap));
      expect(prepareRequests(source, cues, cap, pronunciationSpans(source, entries))).toEqual(
        prepareRequests(source, cues, cap),
      );
    }
  });
  it.each([
    [{ start: -1, end: 1, text: "/eɪ/" }],
    [{ start: 0.5, end: 1, text: "/eɪ/" }],
    [{ start: 0, end: 10, text: "/eɪ/" }],
    [{ start: 0, end: 0, text: "/eɪ/" }],
    [{ start: 0, end: 5, text: "/eɪ/" }],
    [{ start: 2, end: 3, text: "/eɪ/" }],
    [{ start: 3, end: 4, text: "/eɪ/" }],
    [
      { start: 5, end: 9, text: "/wɜːd/" },
      { start: 6, end: 9, text: "/eɪ/" },
    ],
    [
      { start: 0, end: 1, text: "/eɪ/" },
      { start: 0, end: 1, text: "/biː/" },
    ],
  ])("rejects supplied spans that cannot be consumed as whole source atoms: %j", (...spans) => {
    expect(() => prepareRequests("A 😀 word", [], 100, spans)).toThrow();
  });
});
