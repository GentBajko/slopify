// Near-duplicate checks for generated topics. Pure, so the web bundle can import it too.
//
// Two topics are the same when, after normalising (accents dropped, lower case, punctuation
// to spaces, "&" read as "and"):
// - the texts are equal, or
// - their word sets overlap by at least `jaccardMin` (shared words / all words), or
// - one's words all appear in the other's and cover at least `containmentMin` of it
//   ("Tiamat" and "Tiamat's Lair" are one video; "Red Dragons" and "Blue Dragons" are two).
// Words are compared without filler words ("the", "of", …) and without a plural "s".
// A project title is compared more loosely: every word of the topic appearing in it is enough,
// because the title wraps the topic in the template's own words ("D&D Lore: Tiamat").

export const jaccardMin = 0.6;
export const containmentMin = 0.5;

const filler = new Set([
  "a",
  "an",
  "the",
  "of",
  "and",
  "or",
  "in",
  "on",
  "to",
  "for",
  "with",
  "vs",
  "s",
]);

export function normaliseTopic(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function topicWords(text: string): ReadonlySet<string> {
  const words = normaliseTopic(text)
    .split(" ")
    .filter((word) => word !== "" && !filler.has(word))
    .map((word) =>
      word.length > 3 && word.endsWith("s") && !word.endsWith("ss") ? word.slice(0, -1) : word,
    );
  return new Set(words);
}

function shared(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  let count = 0;
  for (const word of a) if (b.has(word)) count += 1;
  return count;
}

export function similarTopics(a: string, b: string): boolean {
  const left = normaliseTopic(a);
  const right = normaliseTopic(b);
  if (left === right) return left !== "";
  const wa = topicWords(a);
  const wb = topicWords(b);
  if (wa.size === 0 || wb.size === 0) return false;
  const common = shared(wa, wb);
  if (common / (wa.size + wb.size - common) >= jaccardMin) return true;
  const small = Math.min(wa.size, wb.size);
  const large = Math.max(wa.size, wb.size);
  return common === small && small / large >= containmentMin;
}

// A topic already made as a project: all of its words appear in the project's title.
export function topicInTitle(topic: string, title: string): boolean {
  if (similarTopics(topic, title)) return true;
  const words = topicWords(topic);
  if (words.size === 0) return false;
  return shared(words, topicWords(title)) === words.size;
}

export interface KnownTitles {
  // Topics queued, held, rejected or used by the schedule: compared both ways.
  readonly topics: readonly string[];
  // Every project's title and the channel's existing videos' titles: compared with
  // `topicInTitle`.
  readonly projects: readonly string[];
}

// Keeps the candidates that are new, in their order, dropping repeats among themselves too.
export function newTopics(candidates: readonly string[], known: KnownTitles): string[] {
  const kept: string[] = [];
  for (const candidate of candidates) {
    if (known.topics.some((topic) => similarTopics(candidate, topic))) continue;
    if (known.projects.some((title) => topicInTitle(candidate, title))) continue;
    if (kept.some((topic) => similarTopics(candidate, topic))) continue;
    kept.push(candidate);
  }
  return kept;
}
