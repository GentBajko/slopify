// The keywords Slopify fills itself: never fields for the person, always written with the
// reserved `Slopify_` prefix so they never take a name a template already uses. One table
// says, for each, what fills it, where it works and what it costs; the editor's Insert bar,
// its hover cards, the help tips, the lint and the fillers all read it. Browser-safe: the
// editor imports it.

// Where a keyword can appear: the prompt kinds, the intro and outro entries, and the title.
export const keywordPlaces = [
  "title",
  "article",
  "script",
  "narration",
  "intro",
  "outro",
  "image",
  "thumbnail",
  "description",
  "shorts",
  "review",
] as const;
export type KeywordPlace = (typeof keywordPlaces)[number];

// What fills a keyword: facts copied when the run starts, the release date read when the step
// runs, the article's chapter titles, the finished length, the shared digest call, the scenes
// call and the appearance lookup.
export const fillerKinds = [
  "facts",
  "release",
  "chapters",
  "duration",
  "digest",
  "scenes",
  "appearance",
] as const;
export type FillerKind = (typeof fillerKinds)[number];

// Free, or part of one AI call per run (shared by every keyword with the same cost).
export const keywordCosts = ["free", "digest", "scenes", "appearance"] as const;
export type KeywordCost = (typeof keywordCosts)[number];

export const reservedPrefix = "Slopify_";

export interface KeywordSpec {
  readonly name: `Slopify_${string}`;
  readonly filler: FillerKind;
  // What it fills in, an example value and when it exists, in the words the editor shows.
  readonly fills: string;
  readonly example: string;
  readonly available: string;
  readonly places: readonly KeywordPlace[];
  readonly cost: KeywordCost;
  // The name it had before the prefix, which keeps working.
  readonly legacy?: string;
  // 1 for the first batch the spec starred, 2 for the rest.
  readonly batch: 1 | 2;
}

// The whole prefix is Slopify's, whatever its case, so a near miss never turns into a field
// that a later keyword would take over.
export function isReserved(name: string): boolean {
  return name.toLowerCase().startsWith(reservedPrefix.toLowerCase());
}

// What a keyword's cost says in the Insert bar.
export function costLabel(cost: KeywordCost): string {
  switch (cost) {
    case "free":
      return "Free: no AI call.";
    case "digest":
      return "Part of one AI call per run: the keyword digest, shared by every digest keyword.";
    case "scenes":
      return "Part of one AI call per run: the scenes call, shared by every picture.";
    case "appearance":
      return "Part of one AI call per run: the appearance lookup, with web search.";
  }
}

// How the editor names a place: the prompt kinds and the two entry categories.
export const placeLabels: Readonly<Record<KeywordPlace, string>> = {
  title: "Title",
  article: "Article",
  script: "Script",
  narration: "Narration",
  intro: "Intro",
  outro: "Outro",
  image: "Image",
  thumbnail: "Thumbnail",
  description: "Description",
  shorts: "Shorts",
  review: "Review",
};

// "A, B and C".
export function listOf(words: readonly string[]): string {
  if (words.length <= 1) return words.join("");
  return `${words.slice(0, -1).join(", ")} and ${words.at(-1) ?? ""}`;
}
