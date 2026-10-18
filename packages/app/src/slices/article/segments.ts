import type { Message } from "../../kernel/ports/llm.js";
import type { RunConfig } from "../admission/model.js";
import { subjectOf } from "../admission/model.js";

// The message an intro or outro is written from by the text model: its prompt, the title, the
// run's keywords and the article's plain text (`rebuild/recipe-text.ts`).
export function segmentMessages(
  body: string,
  config: RunConfig,
  article: string,
): readonly Message[] {
  const values = Object.entries(config.values);
  return [
    {
      role: "user",
      content: [
        body,
        "",
        `Video title: ${subjectOf(config)}`,
        "",
        "Keyword values for this run:",
        "",
        values.length === 0
          ? "(none)"
          : values.map(([name, value]) => `${name}: ${value}`).join("\n"),
        "",
        "The article this video narrates:",
        "",
        article,
      ].join("\n"),
    },
  ];
}
