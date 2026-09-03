import type { LlmEvent, Message } from "../../kernel/ports/llm.js";
import type { LlmAnswer, StageProviders } from "../../kernel/runner/providers.js";
import type { ProviderChoice } from "../admission/model.js";
import type { Tokens } from "../telemetry/model.js";
import { noTokens, plusUsage } from "../telemetry/model.js";

// Steps 1 to 3 of `logic/07`: the one message the article is written from, the streamed
// call that writes it, and the continuations that finish it when the model runs into its
// own output limit. Every call goes through the wrapped `providers.llm`, so nothing here
// counts attempts or waits.

// What the message is composed from (§Q56): the rendered article prompt of `logic/03`,
// and the research notes when research ran.
export interface ArticleBrief {
  readonly articlePrompt: string;
  readonly notes?: string | undefined;
}

export interface SentMessages {
  readonly label: string;
  readonly messages: readonly Message[];
}

export interface WrittenArticle {
  readonly markdown: string;
  // §Q57: the exact messages sent, in the order they were sent, for the project to store.
  readonly sent: readonly SentMessages[];
  // logic/16 step 3: the article and its continuations are one unit, so their usage is
  // summed here and counted once by the stage.
  readonly tokens: Tokens;
}

// §Q59: "at most 3 continuations; still unfinished after the third is a failed attempt".
export const continuationLimit = 3;

// The provider's own word for "I stopped because I ran out of room", which is what every
// adapter maps its finish reason to (`kernel/ports/llm.ts`).
const truncatedReason = "length";

// §Q56: "a fixed 'Research notes' header followed by the notes, then the rendered article
// prompt; without research, the rendered prompt alone". One user message, and no
// parameters of the app's own: the provider's defaults are used (§Q61).
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
// the seam - the pieces are concatenated exactly as they arrived (§Q57: the stored text
// is the model's, never edited by the app) - so the instruction has to carry the whole
// of the rule that keeps the seam invisible.
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

export async function writeArticle(
  providers: StageProviders,
  choice: ProviderChoice,
  brief: ArticleBrief,
  onDelta: (text: string) => void,
): Promise<WrittenArticle> {
  const base = articleMessages(brief);
  const sent: SentMessages[] = [{ label: "Article", messages: base }];
  const stream = (event: LlmEvent): void => {
    if (event.type === "delta") {
      onDelta(event.text);
    }
  };

  let answer = await providers.llm(
    { provider: choice.provider, model: choice.model, messages: base, check: written },
    stream,
  );
  const pieces = [answer.text];
  let tokens = plusUsage(noTokens, answer.usage);

  for (let n = 1; truncated(answer) && n <= continuationLimit; n += 1) {
    const messages = continuationMessages(base, pieces.join(""));
    sent.push({ label: `Continuation ${String(n)}`, messages });
    answer = await providers.llm(
      {
        provider: choice.provider,
        model: choice.model,
        messages,
        // The last continuation allowed is the one that has to end the article: a fourth
        // truncation is a failed attempt, which is the wrapper's to retry (§Q59). The
        // loop therefore never sees a truncated answer with its budget spent.
        check: n === continuationLimit ? finished : written,
      },
      stream,
    );
    pieces.push(answer.text);
    tokens = plusUsage(tokens, answer.usage);
  }

  return { markdown: pieces.join(""), sent, tokens };
}

function truncated(answer: LlmAnswer): boolean {
  return answer.finishReason === truncatedReason;
}

// §Q61: "Empty response → failed attempt".
function written(answer: LlmAnswer): string | undefined {
  return answer.text.trim() === "" ? "the article answered with nothing" : undefined;
}

function finished(answer: LlmAnswer): string | undefined {
  const empty = written(answer);
  if (empty !== undefined) {
    return empty;
  }
  return truncated(answer)
    ? `the article was still unfinished after ${String(continuationLimit)} continuations`
    : undefined;
}
