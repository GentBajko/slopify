// Topic scoring: how new a generated topic is next to what the library already covers, and,
// when the person opted in, how much public search interest it has. Pure, so the web bundle
// can import it too. Never reads a channel's analytics.

import type { InterestResult } from "../../kernel/ports/interest.js";
import { type KnownTitles, normaliseTopic, topicWords } from "./similar.js";

// What public search said about one topic.
export interface InterestReading {
  // How many of up to ten search suggestions name the topic; null when no suggestion service
  // answered.
  readonly suggestHits: number | null;
  readonly examples: readonly string[];
  // Its Wikipedia article's views last month; null without one.
  readonly wikiViews: number | null;
}

// A suggestion names the topic when it holds every word of it.
export function readingOf(
  topic: string,
  result: Extract<InterestResult, { ok: true }>,
): InterestReading {
  const words = topicWords(topic);
  const matching =
    result.suggestions?.slice(0, 10).filter((suggestion) => {
      const said = topicWords(suggestion);
      return words.size > 0 && [...words].every((word) => said.has(word));
    }) ?? null;
  return {
    suggestHits: matching === null ? null : matching.length,
    examples:
      matching?.filter((one) => normaliseTopic(one) !== normaliseTopic(topic)).slice(0, 2) ?? [],
    wikiViews: result.wikiViews,
  };
}

export interface Novelty {
  // 1 is nothing like it was made or queued; 0 is the same topic.
  readonly value: number;
  readonly nearest?: { readonly title: string; readonly overlap: number };
}

export interface TopicScore {
  readonly score: number;
  readonly interest: number | null;
  readonly novelty: number;
  readonly reasons: readonly string[];
}

// The key a topic's score is kept by: its normalised title, so a recased or repunctuated
// topic keeps its score.
export function topicKey(title: string): string {
  return normaliseTopic(title);
}

function overlap(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let common = 0;
  for (const word of a) if (b.has(word)) common += 1;
  // A known title that holds every word of the topic covers it, however long the title is.
  return common === a.size ? 1 : common / (a.size + b.size - common);
}

export function noveltyOf(topic: string, known: KnownTitles): Novelty {
  const words = topicWords(topic);
  let nearest: { title: string; overlap: number } | undefined;
  for (const title of [...known.topics, ...known.projects]) {
    const share = overlap(words, topicWords(title));
    if (share > 0 && (nearest === undefined || share > nearest.overlap))
      nearest = { title, overlap: share };
  }
  return nearest === undefined
    ? { value: 1 }
    : { value: Math.max(0, 1 - nearest.overlap), nearest };
}

// ceiling: ten million views a month (log10 7) is as popular as a topic gets here.
const viewsCeiling = 7;

export function interestOf(reading: InterestReading | null): number | null {
  if (reading === null) return null;
  const views = Math.min(1, Math.log10((reading.wikiViews ?? 0) + 1) / viewsCeiling);
  const hits = Math.min(10, reading.suggestHits ?? 0) / 10;
  return 0.6 * views + 0.4 * hits;
}

export function scoreOf(interest: number | null, novelty: number): number {
  return Math.round(100 * (interest === null ? novelty : 0.6 * interest + 0.4 * novelty));
}

function views(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (count >= 1000) return `${String(Math.round(count / 1000))}k`;
  return String(count);
}

// Why a topic scored as it did, one line per signal, as the score chip shows them.
export function reasonsOf(
  novelty: Novelty,
  reading: InterestReading | null,
  search: "off" | "unreachable" | "read",
): readonly string[] {
  const lines: string[] = [];
  if (search === "read" && reading !== null) {
    if (reading.suggestHits !== null) {
      const example = reading.examples[0];
      lines.push(
        `Search: ${String(reading.suggestHits)} of 10 suggestions match${example === undefined ? "" : `, e.g. “${example}”`}`,
      );
    }
    lines.push(
      reading.wikiViews === null
        ? "Wikipedia: no article found"
        : `Wikipedia: ${views(reading.wikiViews)} views last month`,
    );
  }
  if (search === "unreachable")
    lines.push("Search interest unknown: no connection to Google, DuckDuckGo or Wikipedia");
  lines.push(
    novelty.nearest === undefined
      ? "Library: new; nothing like it made or queued"
      : novelty.value === 0
        ? `Library: already covered by “${novelty.nearest.title}”`
        : `Library: new; nearest “${novelty.nearest.title}” (${String(Math.round(novelty.nearest.overlap * 100))}% overlap)`,
  );
  return lines;
}

export function topicScore(
  novelty: Novelty,
  reading: InterestReading | null,
  search: "off" | "unreachable" | "read",
): TopicScore {
  const interest = search === "read" ? interestOf(reading) : null;
  return {
    score: scoreOf(interest, novelty.value),
    interest,
    novelty: novelty.value,
    reasons: reasonsOf(novelty, reading, search),
  };
}

// The queue once scored: topics the person added or moved keep their place at the front in
// their own order, then the scored ones, best first. Stable: equal scores keep their order.
export function orderQueue<T extends { readonly title: string }>(
  items: readonly T[],
  scores: ReadonlyMap<string, { readonly score: number; readonly pinned: boolean }>,
): readonly T[] {
  const kept: T[] = [];
  const scored: { item: T; score: number }[] = [];
  for (const item of items) {
    const found = scores.get(topicKey(item.title));
    if (found === undefined || found.pinned) kept.push(item);
    else scored.push({ item, score: found.score });
  }
  return [...kept, ...scored.toSorted((a, b) => b.score - a.score).map((one) => one.item)];
}
