import type { Message } from "../../kernel/ports/llm.js";

// Steps 1 and 2 of `logic/06`: the built-in instruction that asks for the chapter list,
// the reading of the answer, and the instruction each chapter's sub-agent is sent. Pure
// functions of the run's own configuration - nothing here calls anything.

// What both instructions are composed from (§Q46): the rendered article prompt and the
// run's keyword values, both already on the project (`logic/03` §Q25).
export interface ResearchBrief {
  readonly articlePrompt: string;
  readonly values: Readonly<Record<string, string>>;
}

export function plannerMessages(brief: ResearchBrief): readonly Message[] {
  return [
    {
      role: "user",
      content: [
        "You are planning the web research for an article.",
        "",
        briefText(brief),
        "",
        // §Q53: the prompt's section guide decides the chapters when it has one, and the
        // planner proposes them when it does not. There is no cap on the count.
        "List the chapters to research. If the prompt sets out a section guide, take the",
        "chapters from it, in the order it gives them. If it does not, propose the chapters",
        "this article needs.",
        "",
        "Answer with one chapter title per line and nothing else: no numbering, no",
        "commentary, no blank lines, no heading.",
      ].join("\n"),
    },
  ];
}

// The answer is a list, however the model chose to punctuate it. Numbering and bullets
// are stripped because the instruction above asks for neither and models add them
// anyway; a repeated title is dropped because `logic/06`'s invariant is that no chapter
// is researched twice.
export function chaptersFrom(text: string): readonly string[] {
  const seen = new Set<string>();
  const chapters: string[] = [];
  for (const line of text.split("\n")) {
    const title = line
      .trim()
      .replace(/^(?:[-*•]|\d+[.)])\s+/, "")
      .trim();
    const key = title.toLowerCase();
    if (title === "" || seen.has(key)) {
      continue;
    }
    seen.add(key);
    chapters.push(title);
  }
  return chapters;
}

// §Q52, §Q53: one sub-agent per chapter, web-grounded, answering that chapter's notes
// and its sources. The whole outline travels with it so it covers its own chapter and
// leaves the neighbouring ones to the sub-agents researching them.
export function subAgentMessages(
  brief: ResearchBrief,
  chapter: string,
  outline: readonly string[],
): readonly Message[] {
  return [
    {
      role: "user",
      content: [
        "You are researching one chapter of an article on the web.",
        "",
        briefText(brief),
        "",
        "The article's chapters:",
        "",
        outline.map((title) => `- ${title}`).join("\n"),
        "",
        `Research this chapter and no other: ${chapter}`,
        "",
        "Search the web and answer with plain-text notes on what you found: no markdown",
        "and no commentary on your own process. End with a line reading exactly",
        '"Sources", then the URL of every page you used, one per line.',
      ].join("\n"),
    },
  ];
}

// The half of every instruction that is the same for all three calls (§Q46): the
// rendered prompt the article will be written from, and the run's keyword values.
export function briefText(brief: ResearchBrief): string {
  const values = Object.entries(brief.values);
  return [
    "The article will be written from this prompt:",
    "",
    brief.articlePrompt,
    "",
    "Keyword values for this run:",
    "",
    values.length === 0 ? "(none)" : values.map(([name, value]) => `${name}: ${value}`).join("\n"),
  ].join("\n");
}
