import type { Message } from "../../kernel/ports/llm.js";
import type { Format } from "../admission/model.js";

// The one message the prompt writer is sent: the filled thumbnail prompt as the
// instruction, then the video title, the keyword values, the run's aspect and the full
// plain-text article.
//
// Pure, and beside the stage rather than inside it: what was sent is stored on the project,
// and a resumed run has to reproduce it without calling anything.

export interface ThumbnailBrief {
  // The thumbnail template with this run's keyword values already substituted in.
  readonly instruction: string;
  readonly title: string;
  readonly values: Readonly<Record<string, string>>;
  readonly format: Format;
  // The plain-text article: the narration source, which is the article without its end
  // matter.
  readonly article: string;
}

export function thumbnailMessages(brief: ThumbnailBrief): readonly Message[] {
  const values = Object.entries(brief.values);
  return [
    {
      role: "user",
      content: [
        brief.instruction,
        "",
        `Video title: ${brief.title}`,
        "",
        "Keyword values for this run:",
        "",
        values.length === 0
          ? "(none)"
          : values.map(([name, value]) => `${name}: ${value}`).join("\n"),
        "",
        `Aspect ratio of the thumbnail: ${brief.format}`,
        "",
        "The article this video narrates:",
        "",
        brief.article,
      ].join("\n"),
    },
  ];
}

// Empty output is a failed attempt. Returned as the sentence the stage would show rather than
// thrown, because the wrapper's `check` hook is what makes it a retry.
export function writtenPrompt(text: string): string | undefined {
  return text.trim() === "" ? "the LLM wrote no thumbnail prompt" : undefined;
}
