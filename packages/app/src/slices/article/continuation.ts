import type { Message } from "../../kernel/ports/llm.js";

// The one message the article is written from, and the continuations that finish it when the
// model runs into its own output limit (`rebuild/runtime-article.ts` sends them).

// What the message is composed from: the rendered article prompt, and the research notes
// when research ran.
export interface ArticleBrief {
  readonly articlePrompt: string;
  readonly notes?: string | undefined;
}

// At most 3 continuations; still unfinished after the third is a failed attempt.
export const continuationLimit = 3;

// A fixed 'Research notes' header followed by the notes, then the rendered article prompt;
// without research, the rendered prompt alone. One user message, and no parameters of the app's
// own: the provider's defaults are used.
export function articleMessages(brief: ArticleBrief): readonly Message[] {
  const notes = brief.notes?.trim();
  const content =
    notes === undefined || notes === ""
      ? brief.articlePrompt
      : `Research notes\n\n${notes}\n\n${brief.articlePrompt}`;
  return [{ role: "user", content }];
}

// The article so far goes back as the assistant turn it was, so the model continues its
// own answer rather than being asked to write a second article. Nothing is inserted at
// the seam - the pieces are concatenated exactly as they arrived, and the stored text is
// the model's, never edited by the app - so the instruction has to carry the whole of the
// rule that keeps the seam invisible.
export function continuationMessages(base: readonly Message[], soFar: string): readonly Message[] {
  return [
    ...base,
    { role: "assistant", content: soFar },
    {
      role: "user",
      content: [
        "You stopped at your output limit before the article was finished.",
        "Continue from the exact character you stopped at, in the same voice and format.",
        "Do not repeat anything you have already written, do not restate the last",
        "sentence, and do not open with a heading or a preamble unless the article was",
        "already in the middle of one.",
      ].join("\n"),
    },
  ];
}
