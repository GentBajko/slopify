import { expect, it } from "vitest";
import { aliasMatches } from "../../kernel/ports/narration-aliases.js";
import { aliasedSentences, aliasSpans, withAliasSpans } from "./aliases.js";
import { preparationMessages, sourceSentences } from "./preparation.js";
import { prepareRequests } from "./steering.js";

const aliases = [
  { written: "Dr.", spoken: "Doctor", wholeWord: true, caseSensitive: false },
  { written: "et al.", spoken: "and others", wholeWord: true, caseSensitive: false },
];

it("sends the aliased words to the voice and keeps the written ones as the transcript", () => {
  const source = "Dr. Grey et al. wrote it.";
  const spans = aliasSpans(source, aliases);
  expect(spans).toEqual([
    { start: 0, end: 3, text: "Doctor" },
    { start: 9, end: 11, text: "and others" },
    { start: 12, end: 15, text: "" },
  ]);
  const prepared = prepareRequests(source, [], 500, spans);
  expect(prepared).toEqual({
    ok: true,
    requests: [{ text: "Doctor Grey and others wrote it.", spokenText: source }],
  });
});

it("lets an alias win over a glossary pronunciation of the same word", () => {
  const glossary = [
    { start: 0, end: 3, text: "/dɑk/" },
    { start: 4, end: 8, text: "/ɡreɪ/" },
  ];
  expect(withAliasSpans(glossary, aliasSpans("Dr. Grey", aliases))).toEqual([
    { start: 0, end: 3, text: "Doctor" },
    { start: 4, end: 8, text: "/ɡreɪ/" },
  ]);
  expect(withAliasSpans(glossary, [])).toBe(glossary);
});

it("shows Narration Preparation the aliased sentences under the written numbering", () => {
  const source = "Dr. Grey arrived. She et al. left.";
  const sentences = sourceSentences(source);
  const aliased = aliasedSentences(sentences, aliasMatches(source, aliases));
  expect(aliased.map((row) => row.sentence)).toEqual(sentences.map((row) => row.sentence));
  expect(aliased.map((row) => row.text).join("")).toBe("Doctor Grey arrived. She and others left.");
  // No alias: the request is byte-for-byte what it was before aliases existed.
  expect(preparationMessages("Calm.", source, [])).toEqual(preparationMessages("Calm.", source));
  // "Dr." ends a sentence for the segmenter; the aliased text keeps that cut.
  const sent = JSON.stringify(preparationMessages("Calm.", source, aliasMatches(source, aliases)));
  expect(sent).toContain('{\\"sentence\\":1,\\"text\\":\\"Doctor \\"}');
  expect(sent).toContain("She and others left.");
});

// The later words of a multi-word alias say nothing, and the whitespace in front of them goes
// with them, so the voice never gets two spaces where the written phrase had one.
it.each([
  ["et al. wrote it.", "and others wrote it."],
  ["They wrote it, et al.", "They wrote it, and others"],
  ["(et al.) wrote", "(and others) wrote"],
  ["Grey et al., then", "Grey and others, then"],
  ["Grey et  al. then", "Grey and others then"],
  ["Grey et\nal. then", "Grey and others then"],
  ["New York City is big.", "NYC is big."],
  ["Visit New York City.", "Visit NYC."],
  ["New York City", "NYC"],
])("reads %j as %j with single spaces", (source, spoken) => {
  const phrases = [
    ...aliases,
    { written: "New York City", spoken: "NYC", wholeWord: true, caseSensitive: false },
  ];
  const prepared = prepareRequests(source, [], 500, aliasSpans(source, phrases));
  expect(prepared).toEqual({ ok: true, requests: [{ text: spoken, spokenText: source }] });
});

it("keeps the words either side of a multi-word alias apart when the request is split", () => {
  const source = "One two et al. three four.";
  const prepared = prepareRequests(source, [], 12, aliasSpans(source, aliases));
  if (!prepared.ok) throw new Error(prepared.reason);
  expect(prepared.requests.map((request) => request.spokenText).join("")).toBe(source);
  expect(prepared.requests.map((request) => request.text).join("")).toBe(
    "One two and others three four.",
  );
});
