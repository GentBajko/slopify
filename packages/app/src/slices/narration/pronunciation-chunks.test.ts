import { expect, it } from "vitest";
import { type Chunking, chunkNarration } from "./chunk.js";
import { parsePronunciationGlossary } from "./pronunciation.js";
import { pronunciationChunks } from "./pronunciation-chunks.js";

const glossary = parsePronunciationGlossary(
  "P!nk: /pɪŋk/\nDr.: /dɑk/\nDr. Doom: /dɒktə duːm/\nA!B?C: /eɪ/",
);
if (!glossary.ok) throw new Error(glossary.reason);
const entries = glossary.entries;
const modes: readonly Chunking[] = [
  { mode: "whole" },
  { mode: "words", words: 1 },
  { mode: "characters", characters: 3 },
  { mode: "paragraph" },
];

it.each(modes)("preserves unmatched $mode chunks exactly", (mode) => {
  const source = " Ordinary.\r\n\r\nMore words.  ";
  expect(pronunciationChunks(source, mode, entries).map((chunk) => chunk.text)).toEqual(
    chunkNarration(source, mode),
  );
  expect(pronunciationChunks(source, mode, entries)).toEqual(pronunciationChunks(source, mode, []));
  expect(pronunciationChunks(" \n\t ", mode, entries)).toEqual([]);
});

it.each([
  { source: "Start.\n\nMeet Dr.\t \n\nDoom today.\n\nEnd.", mode: { mode: "paragraph" } as const },
  { source: "Start. Meet Dr.\t  Doom today. End.", mode: { mode: "words", words: 2 } as const },
  {
    source: "Start. Meet Dr.\t  Doom today. End.",
    mode: { mode: "characters", characters: 5 } as const,
  },
])(
  "merges only crossed $mode.mode boundaries using the original whitespace",
  ({ source, mode }) => {
    const result = pronunciationChunks(source, mode, entries);
    expect(result.map((chunk) => chunk.text)).toEqual([
      "Start.",
      source.slice(source.indexOf("Meet"), source.indexOf("today.") + "today.".length),
      "End.",
    ]);
    const old = pronunciationChunks(source, mode, []);
    expect(result[0]).toEqual(old[0]);
    expect(result.at(-1)).toEqual(old.at(-1));
  },
);

it("merges every boundary inside one punctuated term and gives repeats distinct keys", () => {
  const result = pronunciationChunks(
    "A!B?C sings. A!B?C sings.",
    { mode: "characters", characters: 2 },
    entries,
  );
  expect(result.map((chunk) => chunk.text)).toEqual(["A!B?C sings.", "A!B?C sings."]);
  expect(new Set(result.map((chunk) => chunk.key)).size).toBe(2);
});

it.each([0, 1, 2])("never partially merges a term touching overridden group %s", (index) => {
  const source = "A!B?C sings.";
  const mode = { mode: "characters", characters: 2 } as const;
  const old = pronunciationChunks(source, mode, []);
  const key = old[index]?.key;
  if (key === undefined) throw new Error("Missing original chunk.");
  expect(pronunciationChunks(source, mode, entries, new Set([key]))).toEqual(old);
});

it("uses longest nonoverlapping whole matches when deciding which boundaries to keep", () => {
  const parsed = parsePronunciationGlossary(
    "One. Two.: /wʌn tuː/\nTwo. Three.: /tuː θriː/\nTwo.: /tuː/",
  );
  if (!parsed.ok) throw new Error(parsed.reason);
  expect(
    pronunciationChunks("One. Two. Three.", { mode: "words", words: 1 }, parsed.entries).map(
      (chunk) => chunk.text,
    ),
  ).toEqual(["One. Two.", "Three."]);
});
