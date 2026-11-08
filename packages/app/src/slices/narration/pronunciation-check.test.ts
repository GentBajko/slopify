import { describe, expect, it } from "vitest";
import {
  heardNames,
  heardSpreadFlag,
  namesAhead,
  namesAheadNotice,
  namesNarrated,
  narratedNotice,
  type PronunciationSources,
} from "./pronunciation-check.js";

const glossary = `## Pronunciation Glossary

| Name / Term | IPA |
|---|---|
| Belwar Dissengulp | ˈbɛlwɑːr ˈdɪsənɡʌlp |
| Drizzt | ˈdrɪzt |
| Catti-brie | ˌkæti ˈbriː |
| tiefling | ˈtiːflɪŋ |
`;
const sources = (over: Partial<PronunciationSources> = {}): PronunciationSources => ({
  glossary,
  rules: 2,
  ...over,
});

describe("before the narration is paid for", () => {
  it("names a two-word term's own word, which narration never matches on its own", () => {
    const ahead = namesAhead(
      "Belwar Dissengulp waited. Belwar spoke, and Belwar's axe rang.",
      sources(),
      true,
    );
    expect(ahead.names).toEqual([{ name: "Belwar", plain: 1, possessive: 1, proper: true }]);
    expect(ahead.mentions).toBe(2);
    expect(ahead.proper).toBe(2);
  });

  it("leaves a name the glossary pronounces alone", () => {
    expect(namesAhead("Drizzt walked, and Drizzt's blades sang.", sources(), true).names).toEqual(
      [],
    );
  });

  it("names a possessive the project's rules never wrap", () => {
    const ahead = namesAhead(
      "Drizzt walked, and Drizzt's blades sang.",
      sources({ rules: 1 }),
      false,
    );
    // Named by the name, not by the form: the two counts are the split.
    expect(ahead.names).toEqual([{ name: "Drizzt", plain: 0, possessive: 1, proper: true }]);
  });

  it("names a hyphenated term rules 1 had to skip, under the rules that read it", () => {
    const ahead = namesAhead("Catti-brie laughed.", sources({ rules: 1 }), false);
    expect(ahead.names).toEqual([{ name: "Catti-brie", plain: 1, possessive: 0, proper: true }]);
  });

  it("ranks proper names above common words and counts them apart", () => {
    // Rules 1 wrapped no possessive, so "tieflings'" and "Belwar's" both reached the voice as
    // written. Only the proper name is worth a person's time.
    const ahead = namesAhead(
      "the tiefling's city, the tiefling's war, and Belwar's axe.",
      sources({ rules: 1 }),
      false,
    );
    expect(ahead.names.map((row) => row.name)).toEqual(["Belwar", "tiefling"]);
    expect(ahead.mentions).toBe(3);
    expect(ahead.proper).toBe(1);
  });

  it("takes your own list and the pooled copy as pronunciations too", () => {
    const text = "Belwar spoke to Kimmuriel about Phandelver.";
    expect(
      namesAhead(
        text,
        sources({
          list: "Belwar: /ˈbɛlwɑːr/",
          shared: [{ term: "Kimmuriel", ipa: ["kɪˈmjʊəriəl"] }],
        }),
        true,
      ).names,
    ).toEqual([]);
  });

  it("reads a pooled one-word name the text also writes in lower case as an ordinary word", () => {
    // Rules 1 left both possessives as written. "Hall" is the pooled copy's own term, but this
    // text also says "hall", so here it is an ordinary English word and not worth a line.
    expect(
      namesAhead(
        "The Hall's gates closed, and the hall was cold.",
        sources({ glossary: "", shared: [{ term: "Hall", ipa: ["hɔːl"] }], rules: 1 }),
        false,
      ).names,
    ).toEqual([]);
    // An ending of more than two letters is another word, so a god called Torm stays a name.
    expect(
      namesAhead(
        "Torm's temple watched the torment.",
        sources({ glossary: "", shared: [{ term: "Torm", ipa: ["tɔːrm"] }], rules: 1 }),
        false,
      ).names,
    ).toEqual([{ name: "Torm", plain: 0, possessive: 1, proper: true }]);
  });

  it("says one line with the names, or nothing at all", () => {
    expect(namesAheadNotice(namesAhead("Drizzt walked.", sources(), true))).toBeNull();
    const notice = namesAheadNotice(namesAhead("Belwar spoke.", sources(), true));
    expect(notice).toContain("1 name in this article has no pronunciation anywhere");
    expect(notice).toContain("Belwar");
    expect(notice).toContain("Settings → Voices → Name pronunciations");
  });
});

describe("after the render", () => {
  it("counts what the voice script sent as written, not as IPA", () => {
    const script =
      "[speak gently] /ˈdrɪzt/ walked, and Drizzt's blades sang. /ˈbɛlwɑːr/ /ˈdɪsənɡʌlp/ waited; Belwar spoke.";
    const narrated = namesNarrated(script, sources());
    expect(narrated.names).toEqual([
      { name: "Belwar", plain: 1, possessive: 0, proper: true },
      { name: "Drizzt", plain: 0, possessive: 1, proper: true },
    ]);
  });

  it("does not read a slash in ordinary prose as a pronunciation", () => {
    expect(namesNarrated("His/her Belwar, and/or not.", sources()).names).toEqual([
      { name: "Belwar", plain: 1, possessive: 0, proper: true },
    ]);
  });

  it("does not count a name inside a delivery tag", () => {
    expect(namesNarrated("[speak as Belwar would] /ˈdrɪzt/ walked.", sources()).names).toEqual([]);
  });
});

describe("how each name was heard", () => {
  const word = (text: string, confidence: number) => ({ text, confidence });

  it("flags a name whose mentions disagree, not one that is merely low", () => {
    const even = Array.from({ length: 10 }, () => word("Drizzt", 0.6));
    const uneven = [
      ...Array.from({ length: 5 }, () => word("Catti-brie,", 0.3)),
      ...Array.from({ length: 5 }, () => word("Catti-brie", 0.95)),
    ];
    const heard = heardNames([...even, ...uneven], sources(), "Drizzt and Catti-brie");
    expect(heard.uneven.map((row) => row.name)).toEqual(["Catti-brie"]);
    const low = heard.names.find((row) => row.name === "Drizzt");
    expect(low?.mean).toBeCloseTo(0.6);
    expect(low?.spread).toBe(0);
    expect(low?.uneven).toBe(false);
  });

  it("needs enough mentions for the spread to mean anything", () => {
    const few = [word("Belwar", 0.2), word("Belwar", 0.9), word("Belwar", 0.5)];
    const heard = heardNames(few, sources(), "Belwar");
    expect(heard.names[0]?.spread).toBeGreaterThanOrEqual(heardSpreadFlag);
    expect(heard.uneven).toEqual([]);
  });

  it("reads a possessive and trailing punctuation as the same name", () => {
    const heard = heardNames(
      [word("Drizzt's", 0.5), word("Drizzt,", 0.5), word('"Drizzt."', 0.5)],
      sources(),
      "Drizzt",
    );
    expect(heard.names).toHaveLength(1);
    expect(heard.names[0]?.mentions).toBe(3);
  });

  it("reads every word's confidence as the baseline, and ignores words without one", () => {
    const heard = heardNames(
      [word("Drizzt", 0.5), { text: "walked" }, word("home", 0.9)],
      sources(),
      "Drizzt",
    );
    expect(heard.words).toBe(2);
    expect(heard.confidence).toBeCloseTo(0.7);
  });

  it("says one line about both halves, or nothing at all", () => {
    expect(narratedNotice(null, null)).toBeNull();
    const narrated = namesNarrated("Belwar spoke.", sources());
    const heard = heardNames(
      [
        ...Array.from({ length: 5 }, () => ({ text: "Catti-brie", confidence: 0.3 })),
        ...Array.from({ length: 5 }, () => ({ text: "Catti-brie", confidence: 0.95 })),
      ],
      sources(),
      "Catti-brie",
    );
    const notice = narratedNotice(narrated, heard);
    expect(notice).toContain("the voice guessed 1 name (Belwar)");
    expect(notice).toContain("1 name was heard more than one way (Catti-brie)");
  });
});
