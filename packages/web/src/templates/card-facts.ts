import type { TemplateCard } from "@app/slices/template-studio/schema.js";

const shapes: Readonly<Record<TemplateCard["format"], string>> = {
  "16:9": "Landscape 16:9",
  "9:16": "Vertical 9:16",
  "1:1": "Square 1:1",
};

const captions: Readonly<Record<TemplateCard["captions"], string>> = {
  off: "no captions",
  "burn-in": "captions on the video",
  files: "captions as a file",
};

// What a template makes, in one line: "Landscape 16:9 · Voice: Fable, OpenAI · about 2,200
// words · captions on the video · 2 shorts". `providerName` names a voice's service.
export function cardFacts(card: TemplateCard, providerName: (id: string) => string): string {
  return [
    card.video ? shapes[card.format] : "Narration only",
    card.voice === null
      ? undefined
      : `Voice: ${card.voice.name}, ${providerName(card.voice.provider)}`,
    card.words === null ? undefined : `about ${card.words.toLocaleString("en-US")} words`,
    card.video ? captions[card.captions] : undefined,
    card.shorts === 0
      ? undefined
      : `${String(card.shorts)} ${card.shorts === 1 ? "short" : "shorts"}`,
    card.pdf ? "a PDF" : undefined,
  ]
    .filter((part): part is string => part !== undefined)
    .join(" · ");
}
