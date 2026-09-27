import type { Message } from "../../kernel/ports/llm.js";
import type { Speaker } from "./model.js";
import { type NamedSpeaker, parseScript, type ScriptResult } from "./script.js";

// Audiobooks from an existing text: the text model hands each passage to a speaker - the
// narrator's prose to the narrator, each quoted line to the character who says it - and
// answers in the script format. It may not write: the words it returns are checked against the
// source, so a model that summarises or embellishes fails the attempt and is asked again.

export function attributionMessages(
  source: string,
  speakers: readonly Speaker[],
): readonly Message[] {
  const narrator = speakers.find((speaker) => speaker.role === "narrator")?.name.trim();
  return [
    {
      role: "system",
      content: [
        "You split a text into speaker turns for an audiobook. You never write, shorten, reword or translate anything.",
        "Speakers (name - role):",
        ...speakers.map((speaker) => `- ${speaker.name.trim()} - ${speaker.role}`),
        `Give narration, description and dialogue tags to ${narrator ?? "the narrator"}. Give each quoted line of dialogue, without its quotation marks, to the character who says it; a character not in the list is read by ${narrator ?? "the narrator"}.`,
        "Answer only with the script, in this exact format:",
        "- Every turn is one paragraph that starts with the speaker's name and a colon, e.g. `Name: words`.",
        "- Separate turns with a blank line. Use only the names above.",
        "- Keep the text's own chapter headings as Markdown heading lines (`# Title`).",
        "- Every word of the text appears exactly once, in order.",
      ].join("\n"),
    },
    { role: "user", content: source },
  ];
}

// The answer must parse as a script and keep the source's words: at least 90% of them in
// order, and no more than 10% words of its own.
export function parseAttribution(
  answer: string,
  source: string,
  speakers: readonly NamedSpeaker[],
): ScriptResult {
  const parsed = parseScript(answer, speakers);
  if (!parsed.ok) return parsed;
  const expected = words(source);
  const got = words(parsed.script.turns.map((turn) => turn.text).join(" "));
  const kept = commonInOrder(expected, got);
  if (expected.length > 0 && kept / expected.length < 0.9)
    return {
      ok: false,
      reason: `The speaker split left out ${String(expected.length - kept)} of the text's ${String(expected.length)} words. The text model must hand every word to a speaker; Try again, or choose another model in Edit project → Providers.`,
    };
  if (got.length - kept > Math.max(3, expected.length * 0.1))
    return {
      ok: false,
      reason: `The speaker split added ${String(got.length - kept)} words that are not in the text. The text model must not write anything of its own; Try again, or choose another model in Edit project → Providers.`,
    };
  return parsed;
}

function words(text: string): readonly string[] {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((word) => word !== "");
}

// A greedy walk rather than a full longest-common-subsequence: both lists are the same words in
// the same order save for what a model dropped or added, and a book chapter is too long for
// the quadratic table.
function commonInOrder(expected: readonly string[], got: readonly string[]): number {
  let at = 0;
  let kept = 0;
  for (const word of got) {
    const found = expected.indexOf(word, at);
    if (found === -1 || found - at > 40) continue;
    kept += 1;
    at = found + 1;
  }
  return kept;
}
