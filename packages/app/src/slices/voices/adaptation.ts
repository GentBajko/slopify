import type { Message } from "../../kernel/ports/llm.js";
import type { Speaker, VoiceFormat } from "./model.js";
import { scriptContract } from "./script.js";

// "Adapt into a conversation": the text model rewrites an existing article as speaker turns in
// the chosen format (a podcast's hosts talking it through, an interview). The article itself is
// left as written; the conversation is the narration's script, kept beside it. Unlike the
// audiobook's speaker split this is a rewrite, so the words are not held to the source - only
// its facts and order are asked for - and the script is checked as a script before it is used.
export function adaptationMessages(
  source: string,
  format: VoiceFormat,
  speakers: readonly Speaker[],
): readonly Message[] {
  return [
    {
      role: "system",
      content: [
        scriptContract(format, speakers),
        "Turn the text you are given into this conversation. Keep its facts, names and order, and say nothing the text does not support.",
        "Keep the text's own chapter headings as the section headings.",
      ].join("\n"),
    },
    { role: "user", content: source },
  ];
}
