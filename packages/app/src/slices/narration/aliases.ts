import {
  type AliasMatch,
  aliasMatches,
  type NarrationAlias,
} from "../../kernel/ports/narration-aliases.js";
import type { SourceSentence } from "./preparation.js";
import type { PronunciationSpan } from "./pronunciation.js";

// Narration aliases ride the same rails as the Pronunciation Glossary: a span of the clean
// narration text with what the voice gets instead. The clean text (what the transcript and
// captions show) is untouched. A span never holds whitespace, so an alias whose written form
// has several words puts all of the spoken form on its first word and nothing on the rest.
export function aliasSpans(
  source: string,
  aliases: readonly NarrationAlias[],
): readonly PronunciationSpan[] {
  const spans: PronunciationSpan[] = [];
  for (const match of aliasMatches(source, aliases))
    for (const [index, word] of Array.from(
      source.slice(match.start, match.end).matchAll(/\S+/gu),
    ).entries()) {
      const start = match.start + word.index;
      spans.push({ start, end: start + word[0].length, text: index === 0 ? match.spoken : "" });
    }
  return spans;
}

// An alias wins over a glossary pronunciation of the same words: it says what to read, and the
// glossary only how to read what is written.
export function withAliasSpans(
  glossary: readonly PronunciationSpan[],
  aliases: readonly PronunciationSpan[],
): readonly PronunciationSpan[] {
  if (aliases.length === 0) return glossary;
  const kept = glossary.filter(
    (span) => !aliases.some((alias) => alias.start < span.end && span.start < alias.end),
  );
  return [...kept, ...aliases].sort((a, b) => a.start - b.start);
}

// The sentences Narration Preparation reads, with the aliases already applied, so its
// delivery cues fit what will actually be said. The sentences are cut from the clean text
// first, so their numbers stay the ones the cues are checked and placed against.
export function aliasedSentences(
  sentences: readonly SourceSentence[],
  matches: readonly AliasMatch[],
): readonly SourceSentence[] {
  if (matches.length === 0) return sentences;
  let offset = 0;
  return sentences.map((sentence) => {
    const start = offset;
    const end = start + sentence.text.length;
    offset = end;
    let text = "";
    let at = start;
    for (const match of matches) {
      if (match.end <= start || match.start >= end) continue;
      if (match.start >= at) text += sentence.text.slice(at - start, match.start - start);
      // The spoken form goes with the sentence the written form starts in.
      if (match.start >= start) text += match.spoken;
      at = Math.max(at, Math.min(match.end, end));
    }
    text += sentence.text.slice(at - start);
    return { sentence: sentence.sentence, text };
  });
}
