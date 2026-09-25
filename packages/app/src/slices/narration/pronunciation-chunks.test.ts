import { expect, it } from "vitest";
import { type Chunking, chunkNarration } from "./chunk.js";
import { parsePronunciationGlossary } from "./pronunciation.js";
import { type NarrationSource, pronunciationChunks } from "./pronunciation-chunks.js";

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

it.each([0, 1])("keeps repeated merged group %s at its saved occurrence", (occurrence) => {
  const source = "Before. Meet Dr.\t Doom today. Middle. Meet Dr.\t Doom today. After.";
  const mode = { mode: "words", words: 1 } as const;
  const merged = pronunciationChunks(source, mode, entries);
  const groups = merged.filter((group) => group.source !== undefined);
  const saved = groups[occurrence];
  if (saved?.source === undefined) throw new Error("Missing merged source.");
  const bindings = { [saved.key]: saved.source };
  expect(pronunciationChunks(source, mode, entries, new Set([saved.key]), bindings)).toEqual(
    merged,
  );
  const unmatched = pronunciationChunks(source, mode, [], new Set([saved.key]), bindings);
  expect(unmatched.filter((group) => group.source !== undefined)).toEqual([saved]);
  expect(unmatched.findIndex((group) => group.key === saved.key)).toBe(occurrence === 0 ? 1 : 4);
});

it("preserves exact saved whitespace and other overridden base keys without a glossary", () => {
  const source = "Before.\n\nMeet Dr.\t \n\nDoom today.\n\nAfter.";
  const mode = { mode: "paragraph" } as const;
  const groups = pronunciationChunks(source, mode, entries);
  const bindings = Object.fromEntries(
    groups.flatMap((group) => (group.source === undefined ? [] : [[group.key, group.source]])),
  );
  expect(
    pronunciationChunks(source, mode, [], new Set(groups.map((group) => group.key)), bindings),
  ).toEqual(groups);
});

it("does not bind a saved merge after source or chunking changes", () => {
  const source = "Meet Dr. Doom today.";
  const mode = { mode: "words", words: 1 } as const;
  const saved = pronunciationChunks(source, mode, entries)[0];
  if (saved?.source === undefined) throw new Error("Missing merged source.");
  const bindings = { [saved.key]: saved.source };
  for (const [text, chunking] of [
    [`Before. ${source}`, mode],
    [source, { mode: "words", words: 2 } as const],
  ] as const) {
    expect(pronunciationChunks(text, chunking, [], new Set([saved.key]), bindings)).toEqual(
      pronunciationChunks(text, chunking, []),
    );
  }
});

it("rejects stale offsets, fingerprints, source text, and group keys", () => {
  const source = "Meet Dr. Doom today.";
  const mode = { mode: "words", words: 1 } as const;
  const saved = pronunciationChunks(source, mode, entries)[0];
  if (saved?.source === undefined) throw new Error("Missing merged source.");
  const invalid: readonly Partial<NarrationSource>[] = [
    { start: -1 },
    { start: 1 },
    { text: "Meet Dr." },
    { text: "Doom today." },
    { bodyFingerprint: "0".repeat(64) },
    { chunkingFingerprint: "0".repeat(64) },
  ];
  for (const patch of invalid)
    expect(
      pronunciationChunks(source, mode, [], new Set([saved.key]), {
        [saved.key]: { ...saved.source, ...patch },
      }),
    ).toEqual(pronunciationChunks(source, mode, []));
  expect(
    pronunciationChunks(source, mode, [], new Set(), { "audio:body:wrong-1": saved.source }),
  ).toEqual(pronunciationChunks(source, mode, []));
});
