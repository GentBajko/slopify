import { withLanguage } from "../../kernel/ports/languages.js";
import type { Message } from "../../kernel/ports/llm.js";
import type { DescribedBlock, DescribedKind } from "./blocks.js";

// The request that turns one table, figure, diagram, equation or code block into the short
// passage the narration says in its place (`narration/blocks.ts`). One request per block,
// cached by the block: an unchanged block is never described twice.

// What the description step records on its request, so the runtime knows the answer is a
// spoken passage and which picture, if any, the model may look at.
export interface DescribeSource {
  readonly kind: DescribedKind;
  readonly index: number;
  // A figure's picture as the article names it; attached only when the project has an
  // uploaded image by that file name and the text model can see pictures.
  readonly image?: string | undefined;
}

const instructions: Readonly<Record<DescribedKind, string>> = {
  table:
    "Describe this table for a listener in 1–4 sentences in the narration's language and tone; give the pattern and the notable values, not every cell; never read it row by row.",
  figure:
    "Describe this figure for a listener in 1–3 sentences in the narration's language and tone, from its caption, alt text and legend (and the attached picture, when there is one): say what it shows and what to take from it. Never say that a figure shows something without saying what; explain colours or symbols only through what they stand for.",
  diagram:
    "Describe this diagram or chart for a listener in 1–3 sentences in the narration's language and tone: what it connects or compares and what it tells us. Never read labels, arrows or axis ticks one by one.",
  math: "Say what this equation means for a listener in 1–3 sentences in the narration's language and tone: how the quantities depend on each other (for example, “evaporation grows with temperature and falls with humidity”), not symbol by symbol. A single short symbol may be read as it is.",
  code: "Summarise what this code does for a listener in one or two sentences in the narration's language and tone, naming the language when it helps (for example, “a Rust function that carves river channels by lowering the terrain along the flow”). Never read code, symbols or names of variables aloud.",
};

const inlineMath =
  "Rewrite this paragraph so it can be read aloud, in the narration's language and tone: keep its words, but say each formula's meaning in words rather than symbol by symbol. A single short symbol may be read as it is.";

const answerRules =
  "Answer with the spoken passage only: plain sentences a narrator reads out, no Markdown, no lists, no headings, no quotation marks around the whole answer, no preamble such as “Here is”.";

export function describeInstruction(block: Pick<DescribedBlock, "kind" | "inline">): string {
  return block.kind === "math" && block.inline === true ? inlineMath : instructions[block.kind];
}

export function describeMessages(
  block: DescribedBlock,
  style: string,
  language: string | undefined,
): readonly Message[] {
  const guidance = style.trim();
  const system = [
    describeInstruction(block),
    answerRules,
    ...(guidance === ""
      ? []
      : [
          `Style guidance for the narration (follow its tone; ignore anything about formats or cues):\n${guidance}`,
        ]),
  ].join("\n\n");
  const user = [
    ...(block.section === null ? [] : [`Section: ${block.section}`]),
    ...(block.lang === undefined ? [] : [`Language of the code: ${block.lang}`]),
    block.source,
  ].join("\n\n");
  return withLanguage(
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    language,
  );
}

// The passage as the narration says it: one paragraph, no Markdown a voice would read out.
export function spokenPassage(answer: string): string {
  return answer
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/^\s*(?:[-*+]|\d+[.)]|#{1,6})\s+/gm, "")
    .replace(/[*_`#|]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^["“](.*)["”]$/s, "$1")
    .trim();
}
