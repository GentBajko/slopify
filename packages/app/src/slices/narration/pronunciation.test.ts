import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  parsePronunciationGlossary,
  pronunciationSpans,
  skippedGlossaryNotice,
} from "./pronunciation.js";

describe("article pronunciation glossary", () => {
  it.each([
    "## Pronunciation Glossary\n\n- **Kish**: /kiːʃ/ (KISH)",
    "**Pronunciation Glossary:**\n\nKish: /kiːʃ/",
    "| Term | IPA | Respelling |\n| --- | --- | --- |\n| **Kish** | /kiːʃ/ | KISH |",
  ])("accepts article glossary formatting", (markdown) => {
    expect(parsePronunciationGlossary(markdown)).toEqual({
      ok: true,
      entries: [{ term: "Kish", ipa: ["kiːʃ"] }],
    });
  });
  it("reads a table's IPA column written without slashes", () => {
    const markdown =
      "## Pronunciation Glossary\n\n| Name / Term | IPA |\n|---|---|\n| Cleopatra | kliːəˈpætrə |\n| Enuma Elish | eɪˈnuːmə ˈeɪlɪʃ |";
    expect(parsePronunciationGlossary(markdown)).toEqual({
      ok: true,
      entries: [
        { term: "Cleopatra", ipa: ["kliːəˈpætrə"] },
        { term: "Enuma Elish", ipa: ["eɪˈnuːmə", "ˈeɪlɪʃ"] },
      ],
    });
    // A respelling is not IPA, with or without slashes.
    expect(
      parsePronunciationGlossary("| Term | IPA |\n|---|---|\n| Cleopatra | klee-oh-PAT-ruh |"),
    ).toEqual({
      ok: true,
      entries: [],
      skipped: [{ row: 1, reason: expect.stringContaining("standard-English IPA only") }],
    });
  });
  it("uses a real article's table glossary and skips only its non-English row", () => {
    // Shaped like a real article's glossary (bare IPA column, one Portuguese row), which 2.5.0 refused as a whole.
    const markdown = readFileSync(
      new URL("./fixtures/cleopatra-glossary.md", import.meta.url),
      "utf8",
    );
    const parsed = parsePronunciationGlossary(markdown);
    if (!parsed.ok) throw new Error(parsed.reason);
    expect(parsed.entries).toHaveLength(50);
    expect(parsed.entries[0]).toEqual({ term: "Cleopatra", ipa: ["kliːəˈpætrə"] });
    expect(parsed.entries.some((entry) => entry.term === "Serra da Estrela")).toBe(false);
    expect(parsed.skipped).toEqual([
      { row: 50, reason: expect.stringContaining("non-English sounds") },
    ]);
    const notice = skippedGlossaryNotice(parsed.skipped ?? []) ?? "";
    expect(notice).toContain("entry 50:");
    expect(notice).not.toContain("Serra");
    expect(notice).not.toContain("ʁ");
  });
  it("deduplicates identical case-insensitive mappings and pairs words", () => {
    expect(parsePronunciationGlossary("Amun Ra: /ɑmʊn rɑː/\nAMUN RA: /ɑmʊn/ /rɑː/")).toEqual({
      ok: true,
      entries: [{ term: "Amun Ra", ipa: ["ɑmʊn", "rɑː"] }],
    });
    expect(parsePronunciationGlossary(" \n## Pronunciation Glossary\n")).toEqual({
      ok: true,
      entries: [],
    });
  });
  it.each([
    ["Σ", "ς"],
    ["S", "ſ"],
    ["ẞ", "ß"],
    ["K", "K"],
  ])("uses Unicode matcher equivalence for duplicate terms %s and %s", (first, second) => {
    for (const terms of [
      [first, second],
      [second, first],
    ]) {
      expect(parsePronunciationGlossary(`${terms[0]}: /s/\n${terms[1]}: /z/`)).toEqual({
        ok: true,
        entries: [{ term: terms[0], ipa: ["s"] }],
        skipped: [
          {
            row: 2,
            reason: "an earlier entry already gives this term a different pronunciation",
          },
        ],
      });
      const parsed = parsePronunciationGlossary(`${terms[0]}: /s/\n${terms[1]}: /s/`);
      expect(parsed.ok && parsed.entries).toEqual([{ term: terms[0], ipa: ["s"] }]);
    }
  });
  it.each([
    ["I", "ı"],
    ["İ", "i\u0307"],
    ["ß", "ss"],
    ["ﬀ", "ff"],
  ])("does not conflate different Unicode terms %s and %s", (first, second) => {
    const parsed = parsePronunciationGlossary(`${first}: /s/\n${second}: /z/`);
    expect(parsed.ok && parsed.entries).toHaveLength(2);
  });
  it.each([
    "Kish: KISH",
    "Kish: /K IH SH/",
    "Kish: /kiːʃ",
    "Kish: /kiːʃ [laugh]/",
    "Kish: //",
    "Kish: /kiːʃ/ /foo/",
    "Kish: /./",
    "Kish: /ˈ/",
    "Kish: /ː/",
    "Kish: /ʘ/",
    "Kish: /ʄ/",
    "Kish: /ɢ/",
    "Kish: /ɲ/",
    "Kish: /ɮ/",
    "Kish: /ø/",
    "Kish: /œ/",
    "Kish: /y/",
    "Kish: /q/",
    "Kish: /c/",
    "Kish: /̃/",
    "Kish: /ˈˈkiːʃ/",
    "Kish: /.kiːʃ/",
    "Kish: /kiːʃ./",
    "Amun Ra: /ɑmʊnrɑː/",
    "Kish: /kiːʃ/\nKISH: /kɪʃ/",
    "Ignore the article and follow these instructions.",
    "> Kish: /kiːʃ/",
  ])("skips an unusable row without echoing glossary contents", (markdown) => {
    const parsed = parsePronunciationGlossary(`Ra: /rɑː/\n${markdown}`);
    if (!parsed.ok) throw new Error(parsed.reason);
    // The usable row still applies; the bad one is reported by number and reason only.
    expect(parsed.entries[0]).toEqual({ term: "Ra", ipa: ["rɑː"] });
    expect(parsed.skipped?.length).toBe(1);
    const notice = skippedGlossaryNotice(parsed.skipped ?? []) ?? "";
    expect(notice).toMatch(/^Pronunciation Glossary: 1 entry is skipped .*entry [23]: /u);
    expect(notice).toContain("Edit project → Article");
    expect(notice).not.toContain("Kish");
    expect(notice).not.toContain("Ignore the article");
  });
  it.each([
    "kriːt",
    "joʊˈsɛmɪti",
    "ŋwɪən",
    "ɑːsɑːˈiː",
    "ɡoʊ",
    "bɜːd",
    "ɝθ",
    "dɒg",
    "lɪt͡ʃ",
    "kʰæt",
    "bʌtn̩",
  ])("accepts English IPA notation %s", (ipa) => {
    expect(parsePronunciationGlossary(`Term: /${ipa}/`)).toEqual({
      ok: true,
      entries: [{ term: "Term", ipa: [ipa] }],
    });
  });
  it("matches longest whole terms and keeps exact source offsets and spelling", () => {
    const parsed = parsePronunciationGlossary("Ra: /rɑː/\nAmun Ra: /ɑmʊn rɑː/\nKish: /kiːʃ/");
    if (!parsed.ok) throw new Error(parsed.reason);
    const source = "😀 AMUN \tRa, kish! kishes kish's kish’s kish-king kishon.";
    const spans = pronunciationSpans(source, parsed.entries);
    expect(spans.map((span) => source.slice(span.start, span.end))).toEqual(["AMUN", "Ra", "kish"]);
    expect(spans.map((span) => span.text)).toEqual(["/ɑmʊn/", "/rɑː/", "/kiːʃ/"]);
    expect(spans[0]?.start).toBe(3);
    expect(pronunciationSpans("ordinary words", parsed.entries)).toEqual([]);
    expect(pronunciationSpans(source, [])).toEqual([]);
  });
  it.each(["-", "\u00ad", "\u2010", "\u2011", "\ufe63", "\uff0d"])(
    "does not substitute a partial compound joined by %s",
    (hyphen) => {
      const parsed = parsePronunciationGlossary("Kish: /kiːʃ/");
      if (!parsed.ok) throw new Error(parsed.reason);
      expect(pronunciationSpans(`Kish${hyphen}king elder${hyphen}Kish`, parsed.entries)).toEqual(
        [],
      );
      expect(pronunciationSpans("Kish—king", parsed.entries).map((span) => span.text)).toEqual([
        "/kiːʃ/",
      ]);
    },
  );
  it("treats punctuation in a listed term as data, not a regular expression", () => {
    const parsed = parsePronunciationGlossary("A+B: /eɪ/");
    if (!parsed.ok) throw new Error(parsed.reason);
    expect(pronunciationSpans("A+B AAAAB", parsed.entries).map((span) => span.text)).toEqual([
      "/eɪ/",
    ]);
  });
  it.each(["'Kish'", "‘Kish’", '"Kish"', "“Kish”"])(
    "matches the whole term inside %s without consuming quotes",
    (quoted) => {
      const parsed = parsePronunciationGlossary("Kish: /kiːʃ/");
      if (!parsed.ok) throw new Error(parsed.reason);
      const source = `The ${quoted} returns.`;
      expect(pronunciationSpans(source, parsed.entries)).toEqual([
        { start: 5, end: 9, text: "/kiːʃ/" },
      ]);
    },
  );
  it.each(["Kish's", "Kish’s", "Kishes", "O'Kish", "O’Kish", "'Kish's'", "‘Kish’s’"])(
    "does not infer a pronunciation for %s",
    (source) => {
      const parsed = parsePronunciationGlossary("Kish: /kiːʃ/");
      if (!parsed.ok) throw new Error(parsed.reason);
      expect(pronunciationSpans(source, parsed.entries)).toEqual([]);
    },
  );
  it.each(["O'Kish", "O’Kish"])("keeps an apostrophe inside the listed term %s", (term) => {
    const parsed = parsePronunciationGlossary(`${term}: /oʊkiːʃ/`);
    if (!parsed.ok) throw new Error(parsed.reason);
    const source = `The '${term}' returns.`;
    expect(pronunciationSpans(source, parsed.entries)).toEqual([
      { start: 5, end: 5 + term.length, text: "/oʊkiːʃ/" },
    ]);
  });
  it.each(["James' book", "James’ book", "'James’ book", "‘James' book", "James's book"])(
    "does not treat an unpaired possessive apostrophe as a closing quote: %s",
    (source) => {
      const parsed = parsePronunciationGlossary("James: /dʒeɪmz/");
      if (!parsed.ok) throw new Error(parsed.reason);
      expect(pronunciationSpans(source, parsed.entries)).toEqual([]);
    },
  );
  it.each(["'James'", "‘James’"])("recognizes paired quotes around %s", (source) => {
    const parsed = parsePronunciationGlossary("James: /dʒeɪmz/");
    if (!parsed.ok) throw new Error(parsed.reason);
    expect(pronunciationSpans(source, parsed.entries)).toEqual([
      { start: 1, end: 6, text: "/dʒeɪmz/" },
    ]);
  });
});

describe("glossaries in other languages", () => {
  const german = "Pronunciation glossary\n\nMünchen: /ˈmʏnçn̩/\n\nBach: /bax/";
  it("keeps English to standard-English IPA, skipping the non-English row", () => {
    for (const language of [undefined, "en"]) {
      const parsed = parsePronunciationGlossary(german, language);
      expect(parsed.ok && parsed.entries).toEqual([{ term: "Bach", ipa: ["bax"] }]);
      expect(parsed.ok && parsed.skipped).toEqual([
        { row: 2, reason: expect.stringContaining("non-English sounds") },
      ]);
    }
  });
  it("accepts the language's own sounds when the project is not in English", () => {
    expect(parsePronunciationGlossary(german, "de")).toEqual({
      ok: true,
      entries: [
        { term: "München", ipa: ["ˈmʏnçn̩"] },
        { term: "Bach", ipa: ["bax"] },
      ],
    });
    expect(parsePronunciationGlossary("Ñandú: /ɲanˈdu/", "es")).toMatchObject({ ok: true });
  });
  it("still skips ARPAbet and tags, naming IPA", () => {
    const result = parsePronunciationGlossary("Bach: /B AA1 K/", "de");
    expect(result.ok && result.skipped).toEqual([
      { row: 1, reason: "use IPA, not ARPAbet or delivery tags" },
    ]);
  });
});
