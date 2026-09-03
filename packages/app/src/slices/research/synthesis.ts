import type { Message } from "../../kernel/ports/llm.js";
import type { ResearchBrief } from "./planner.js";
import { briefText } from "./planner.js";

// The editorial pass, and the one rule its output has to satisfy.

export interface Finding {
  readonly title: string;
  readonly notes: string;
}

// An editorial pass over every sub-agent's output that selects and organizes the findings; it
// does not concatenate. The sub-agents' notes are the material, not the answer, and the
// synthesising model is told so.
export function synthesisMessages(
  brief: ResearchBrief,
  findings: readonly Finding[],
): readonly Message[] {
  return [
    {
      role: "user",
      content: [
        "You are the editor of the research behind an article.",
        "",
        briefText(brief),
        "",
        "One researcher covered each chapter. Their findings follow.",
        "",
        findings.map(block).join("\n\n"),
        "",
        "Write the research notes the article will be written from. Select what the",
        "article needs, organise it, and resolve what the researchers disagree on. Do not",
        "concatenate their reports and do not add anything they did not find.",
        "",
        "Answer with plain-text notes: no markdown and no commentary on your own process.",
        'End with a line reading exactly "Sources", then the URL of every source you kept,',
        "one per line, with no duplicates.",
      ].join("\n"),
    },
  ];
}

// The stored notes always end with a Sources list, and an answer without
// one "counts as a failed attempt". A heading with nothing under it is not a list, so
// the line has to be followed by something.
const heading =
  /^\s*(?:#{1,6}\s*)?(?:\*\*)?\s*sources(?:\s+(?:list|consulted))?\s*(?:\*\*)?\s*:?\s*$/i;

export function endsWithSources(text: string): boolean {
  const lines = text.split("\n");
  const at = lines.findLastIndex((line) => heading.test(line));
  return at !== -1 && lines.slice(at + 1).some((line) => line.trim() !== "");
}

// The one shape a stage hands `StageProviders.llm` as its `check`: an answer that arrived
// but cannot be used is a failed attempt, so the wrapper retries it.
export function sourcedAnswer(who: string, text: string): string | undefined {
  if (text.trim() === "") {
    return `${who} answered with nothing`;
  }
  return endsWithSources(text) ? undefined : `${who} answered with no Sources list`;
}

function block(finding: Finding): string {
  return `--- ${finding.title} ---\n${finding.notes}`;
}
