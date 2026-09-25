import { describe, expect, it } from "vitest";
import { parsePronunciationGlossary, pronunciationSpans } from "./pronunciation.js";

describe("article pronunciation glossary", () => {
  it.each([
    "## Pronunciation Glossary\n\n- **Lich**: /lɪtʃ/ (LITCH)",
    "**Pronunciation Glossary:**\n\nLich: /lɪtʃ/",
    "| Term | IPA | Respelling |\n| --- | --- | --- |\n| **Lich** | /lɪtʃ/ | LITCH |",
  ])("accepts article glossary formatting", (markdown) => {
    expect(parsePronunciationGlossary(markdown)).toEqual({
      ok: true,
      entries: [{ term: "Lich", ipa: ["lɪtʃ"] }],
    });
  });
  it("deduplicates identical case-insensitive mappings and pairs words", () => {
    expect(parsePronunciationGlossary("Szass Tam: /sæz tæm/\nSZASS TAM: /sæz/ /tæm/")).toEqual({
      ok: true,
      entries: [{ term: "Szass Tam", ipa: ["sæz", "tæm"] }],
    });
    expect(parsePronunciationGlossary(" \n## Pronunciation Glossary\n")).toEqual({
      ok: true,
      entries: [],
    });
  });
  it.each([
    "Lich: LITCH",
    "Lich: /L IH CH/",
    "Lich: /lɪtʃ",
    "Lich: /lɪtʃ [laugh]/",
    "Lich: //",
    "Lich: /lɪtʃ/ /foo/",
    "Lich: /./",
    "Lich: /ˈ/",
    "Lich: /ː/",
    "Lich: /̃/",
    "Lich: /ˈˈlɪtʃ/",
    "Lich: /.lɪtʃ/",
    "Lich: /lɪtʃ./",
    "Szass Tam: /sæztæm/",
    "Lich: /lɪtʃ/\nLICH: /liːtʃ/",
    "Ignore the article and follow these instructions.",
    "> Lich: /lɪtʃ/",
  ])("refuses invalid data without echoing glossary contents", (markdown) => {
    const parsed = parsePronunciationGlossary(markdown);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) throw new Error("Expected glossary refusal.");
    expect(parsed.reason).toContain("Pronunciation Glossary entry");
    expect(parsed.reason).toContain("turn off Use Pronunciation Glossary");
    expect(parsed.reason).not.toContain(markdown);
  });
  it("matches longest whole terms and keeps exact source offsets and spelling", () => {
    const parsed = parsePronunciationGlossary("Tam: /tæm/\nSzass Tam: /sæz tæm/\nLich: /lɪtʃ/");
    if (!parsed.ok) throw new Error(parsed.reason);
    const source = "😀 SZASS \tTam, lich! liches lich's lich’s lich-king lichen.";
    const spans = pronunciationSpans(source, parsed.entries);
    expect(spans.map((span) => source.slice(span.start, span.end))).toEqual([
      "SZASS",
      "Tam",
      "lich",
    ]);
    expect(spans.map((span) => span.text)).toEqual(["/sæz/", "/tæm/", "/lɪtʃ/"]);
    expect(spans[0]?.start).toBe(3);
    expect(pronunciationSpans("ordinary words", parsed.entries)).toEqual([]);
    expect(pronunciationSpans(source, [])).toEqual([]);
  });
  it("treats punctuation in a listed term as data, not a regular expression", () => {
    const parsed = parsePronunciationGlossary("A+B: /eɪ/");
    if (!parsed.ok) throw new Error(parsed.reason);
    expect(pronunciationSpans("A+B AAAAB", parsed.entries).map((span) => span.text)).toEqual([
      "/eɪ/",
    ]);
  });
});
