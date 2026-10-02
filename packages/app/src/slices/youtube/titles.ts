// A title made from a pattern with keywords ("{{Topic}} | Stories To Sleep To") keeps its
// fixed wording in YouTube's title A/B test: the other titles change only what the keywords
// stand for ("The Lighthouse Keeper | Stories To Sleep To"). A title without
// keywords has nothing fixed, and its other titles are free.

const slot = /\{\{([^{}\n]*)\}\}/g;

export interface TitleShape {
  readonly pattern: string;
  // Each keyword of the pattern and what it holds in the video's own title.
  readonly keywords: readonly { readonly name: string; readonly value: string }[];
}

// Undefined when the project kept no pattern, or the pattern has no keyword.
export function titleShape(
  pattern: string | undefined,
  values: Readonly<Record<string, string>> | undefined,
): TitleShape | undefined {
  if (pattern === undefined) return undefined;
  const names = [...pattern.matchAll(slot)].map((match) => (match[1] ?? "").trim());
  if (names.length === 0) return undefined;
  return {
    pattern,
    keywords: [...new Set(names)].map((name) => ({ name, value: values?.[name] ?? "" })),
  };
}

// The rule the model is given: which part may change, and what it holds now.
export function titleShapeRule(shape: TitleShape): string {
  const held = shape.keywords.map((one) => `{{${one.name}}} is "${one.value}"`).join(", and ");
  const parts = shape.keywords.map((one) => `{{${one.name}}}`).join(" and ");
  return `- The video title is made from the channel's title pattern "${shape.pattern}", where ${held}. Each other title keeps every word of the pattern outside ${parts} exactly as it is, and changes only what ${parts} holds.`;
}

const escaped = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Whether a title keeps the pattern's fixed wording, each keyword filled with something.
export function keepsShape(shape: TitleShape, title: string): boolean {
  const literal = shape.pattern.split(slot).filter((_, index) => index % 2 === 0);
  const source = literal.map((part) => escaped(part.trim())).join("\\s*(.+?)\\s*");
  return new RegExp(`^${source}$`, "u").test(title.trim());
}
