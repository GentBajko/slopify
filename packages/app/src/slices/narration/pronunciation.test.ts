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
  it.each(["Kishes", "O'Kish", "O’Kish", "Kish'll", "Kish’ll", "Kish'sword"])(
    "does not infer a pronunciation for %s",
    (source) => {
      const parsed = parsePronunciationGlossary("Kish: /kiːʃ/");
      if (!parsed.ok) throw new Error(parsed.reason);
      expect(pronunciationSpans(source, parsed.entries, true)).toEqual([]);
    },
  );
  it.each(["Kish's", "Kish’s", "'Kish's'", "‘Kish’s’"])(
    "rules 1 (projects started before possessives) do not infer a pronunciation for %s",
    (source) => {
      const parsed = parsePronunciationGlossary("Kish: /kiːʃ/", undefined, 1);
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
  it.each(["James' book", "James’ book", "'James’ book", "‘James' book"])(
    "does not treat an unpaired possessive apostrophe as a closing quote: %s",
    (source) => {
      const parsed = parsePronunciationGlossary("James: /dʒeɪmz/");
      if (!parsed.ok) throw new Error(parsed.reason);
      expect(pronunciationSpans(source, parsed.entries, true)).toEqual([]);
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

describe("possessives", () => {
  const glossary = [
    "Gygax: /ˈɡaɪɡæks/",
    "Lolth: /lɒlθ/",
    "Drizzt: /drɪzt/",
    "Kish: /kiːʃ/",
    "Drow: /draʊ/",
    "Vecna: /ˈvɛknə/",
    "House Baenre: /haʊs ˈbeɪnɹeɪ/",
  ].join("\n");
  const parsed = parsePronunciationGlossary(glossary);
  if (!parsed.ok) throw new Error(parsed.reason);
  const spansOf = (source: string, possessives = true) =>
    pronunciationSpans(source, parsed.entries, possessives).map((span) => [
      source.slice(span.start, span.end),
      span.text,
    ]);
  it.each([
    ["Gygax's", "/ˈɡaɪɡæksɪz/"],
    ["Gygax’s", "/ˈɡaɪɡæksɪz/"],
    ["GYGAX'S", "/ˈɡaɪɡæksɪz/"],
    ["Lolth's", "/lɒlθs/"],
    ["Drizzt’s", "/drɪzts/"],
    ["Kish's", "/kiːʃɪz/"],
    ["Drow's", "/draʊz/"],
    ["Vecna’s", "/ˈvɛknəz/"],
  ])("adds the possessive ending inside the same slashes for %s", (word, ipa) => {
    const source = `Then ${word} lair.`;
    expect(spansOf(source)).toEqual([[word, ipa]]);
    expect(pronunciationSpans(source, parsed.entries, true)[0]?.start).toBe(5);
  });
  it("puts the possessive on the last word of a multi-word term", () => {
    expect(spansOf("House Baenre's army marched.")).toEqual([
      ["House", "/haʊs/"],
      ["Baenre's", "/ˈbeɪnɹeɪz/"],
    ]);
  });
  it("leaves the plain word unchanged and keeps quotes out of the span", () => {
    expect(spansOf("Gygax wrote. 'Gygax's' and ‘Lolth’s’ and 'Kish'")).toEqual([
      ["Gygax", "/ˈɡaɪɡæks/"],
      ["Gygax's", "/ˈɡaɪɡæksɪz/"],
      ["Lolth’s", "/lɒlθs/"],
      ["Kish", "/kiːʃ/"],
    ]);
  });
  it.each([
    "Gygax'll go",
    "Lolth’ll go",
    "Gygax'd go",
    "Gygax'sword",
    "Gygaxs",
    "O'Gygax",
    "Gygax-king's",
    "James Gygax' book",
    "‘Tell Gygax’ he said",
  ])("still does not match %s", (source) => {
    expect(spansOf(source)).toEqual([]);
  });
  it("leaves a bare trailing apostrophe alone: it can't be told from a closing quote", () => {
    expect(spansOf("Drizzt' friends")).toEqual([]);
  });
  it("is off unless asked for", () => {
    expect(spansOf("Gygax's", false)).toEqual([]);
  });
  it("keeps the span for a possessive before a sentence end", () => {
    expect(spansOf("It was Lolth's.")).toEqual([["Lolth's", "/lɒlθs/"]]);
  });
});

describe("hyphenated names", () => {
  it("merges the IPA words of one written word, so it gets one slash pair", () => {
    const parsed = parsePronunciationGlossary(
      "Arach-Tinilith: /əˈræk ˈtɪnɪlɪθ/\nshadar-kai: /ˈʃɑːdɑːr kaɪ/\nCatti-brie: /ˌkæti ˈbriː/",
    );
    expect(parsed).toEqual({
      ok: true,
      entries: [
        { term: "Arach-Tinilith", ipa: ["əˈræk.ˈtɪnɪlɪθ"] },
        { term: "shadar-kai", ipa: ["ˈʃɑːdɑːr.kaɪ"] },
        { term: "Catti-brie", ipa: ["ˌkæti.ˈbriː"] },
      ],
    });
    if (!parsed.ok) return;
    const source = "At Arach-Tinilith, a shadar-kai met Catti-brie.";
    expect(pronunciationSpans(source, parsed.entries).map((span) => span.text)).toEqual([
      "/əˈræk.ˈtɪnɪlɪθ/",
      "/ˈʃɑːdɑːr.kaɪ/",
      "/ˌkæti.ˈbriː/",
    ]);
  });
  it("handles a mix of spaces and hyphens", () => {
    const parsed = parsePronunciationGlossary("House Do'Urden-Baenre: /haʊs doʊˈɜːrdən ˈbeɪnɹeɪ/");
    expect(parsed).toEqual({
      ok: true,
      entries: [{ term: "House Do'Urden-Baenre", ipa: ["haʊs", "doʊˈɜːrdən.ˈbeɪnɹeɪ"] }],
    });
  });
  it("still accepts one IPA word per written word and a pre-joined hyphen", () => {
    expect(parsePronunciationGlossary("Catti-brie: /ˌkæti.ˈbriː/")).toEqual({
      ok: true,
      entries: [{ term: "Catti-brie", ipa: ["ˌkæti.ˈbriː"] }],
    });
  });
  it("still skips a count that fits neither the words nor the hyphen parts", () => {
    const parsed = parsePronunciationGlossary("Arach-Tinilith-Mor: /əˈræk ˈtɪnɪlɪθ/");
    expect(parsed).toEqual({
      ok: true,
      entries: [],
      skipped: [{ row: 1, reason: expect.stringContaining("one IPA word for each written word") }],
    });
  });
  it("keeps the old rule for projects started before it (rules 1)", () => {
    const parsed = parsePronunciationGlossary("Arach-Tinilith: /əˈræk ˈtɪnɪlɪθ/", undefined, 1);
    expect(parsed.ok && parsed.entries).toEqual([]);
  });
});

describe("names left without a pronunciation on purpose", () => {
  it("counts them apart from the rows that failed", () => {
    const parsed = parsePronunciationGlossary(
      "## Pronunciation Glossary\n\n| Term | IPA |\n|---|---|\n| Gygax | ɡaɪɡæks |\n| Bob | — |\n| Sam | – |\n| Al | - |\n| Joe | n/a |\n| Una |  |\n| Cleopatra | klee-oh-PAT-ruh |",
    );
    expect(parsed).toEqual({
      ok: true,
      entries: [{ term: "Gygax", ipa: ["ɡaɪɡæks"] }],
      unpronounced: 5,
      skipped: [{ row: 7, reason: expect.stringContaining("standard-English IPA only") }],
    });
  });
  it("counts blank list and paragraph rows too, and a blank row's term still has to be valid", () => {
    const parsed = parsePronunciationGlossary("Kish: —\nLolth: n/a\nVecna:\n: —\nDrow: /draʊ/");
    expect(parsed).toEqual({
      ok: true,
      entries: [{ term: "Drow", ipa: ["draʊ"] }],
      unpronounced: 3,
      skipped: [{ row: 4, reason: "use Term: /IPA/ or a Term | IPA table" }],
    });
  });
  it("reports them as skipped errors under rules 1, as before", () => {
    const parsed = parsePronunciationGlossary("Kish: —", undefined, 1);
    expect(parsed).toMatchObject({ ok: true, skipped: [{ row: 1 }] });
  });
  it("has no unpronounced count when every row has one", () => {
    expect(parsePronunciationGlossary("Kish: /kiːʃ/")).toEqual({
      ok: true,
      entries: [{ term: "Kish", ipa: ["kiːʃ"] }],
    });
  });
  it("says it calmly, with where to fix it, and lists no rows", () => {
    const notice = skippedGlossaryNotice([], 49) ?? "";
    expect(notice).toContain("49 names have no pronunciation given and are read as written");
    expect(notice).toContain("Edit project → Article");
    expect(notice).not.toContain("skipped");
    expect(skippedGlossaryNotice([], 1)).toContain("1 name has no pronunciation given");
    expect(skippedGlossaryNotice([], 0)).toBeNull();
    const both = skippedGlossaryNotice([{ row: 3, reason: "use slash-delimited IPA" }], 2) ?? "";
    expect(both).toContain("entry 3: use slash-delimited IPA");
    expect(both).toContain("2 names have no pronunciation given");
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
