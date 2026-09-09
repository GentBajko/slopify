import type { DatabaseSync } from "node:sqlite";
import type { Ids } from "../../kernel/ids.js";
import type { Message } from "../../kernel/ports/llm.js";
import type { StageContext } from "../../kernel/runner/index.js";
import { insertPiece, piecesOf, setPiece } from "../../kernel/runner/piece-repo.js";
import type { LlmAnswer, StageProviders } from "../../kernel/runner/providers.js";
import type { EntryMode, ProviderChoice, RunConfig } from "../admission/model.js";
import type { EntryCategory } from "../library/model.js";
import type { Tokens } from "../telemetry/model.js";
import { noTokens, plusUsage } from "../telemetry/model.js";
import type { SentMessages } from "./continuation.js";

// Shared by generated articles and entry preparation for a pasted article.
// Narration always reads these pieces from the Article stage, so re-narrating
// or changing its unfinished voice preserves already written entry text.
export interface SegmentText {
  readonly category: EntryCategory;
  readonly name: string;
  readonly mode: EntryMode;
  readonly text: string;
}

export interface WrittenSegment extends SegmentText {
  readonly tokens: Tokens;
}

export const categories: readonly EntryCategory[] = ["intro", "outro"];

export async function writeSegment(
  providers: StageProviders,
  choice: ProviderChoice | undefined,
  config: RunConfig,
  category: EntryCategory,
  article: string,
  sent: SentMessages[],
): Promise<WrittenSegment | undefined> {
  const picked = config[category];
  if (picked === undefined) return undefined;
  const body = config.rendered[category];
  if (body === undefined) throw new Error(`the run has no rendered ${category} text`);
  const common = { category, name: picked.name, mode: picked.mode };
  if (picked.mode === "text") return { ...common, text: body, tokens: noTokens };
  if (choice === undefined) throw new Error(`the ${category} has no LLM provider or model`);
  const messages = segmentMessages(body, config, article);
  sent.push({ label: category === "intro" ? "Intro" : "Outro", messages });
  const answer = await providers.llm({
    provider: choice.provider,
    model: choice.model,
    messages,
    check: (given: LlmAnswer): string | undefined =>
      given.text.trim() === "" ? `the ${category} answered with nothing` : undefined,
  });
  return { ...common, text: answer.text.trim(), tokens: plusUsage(noTokens, answer.usage) };
}

function segmentMessages(body: string, config: RunConfig, article: string): readonly Message[] {
  const values = Object.entries(config.values);
  return [
    {
      role: "user",
      content: [
        body,
        "",
        `Video title: ${config.title}`,
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

export function keepSegment(
  deps: { readonly db: DatabaseSync; readonly ids: Ids },
  context: Pick<StageContext, "stage">,
  segment: SegmentText,
  idx: number,
): void {
  const payload = JSON.stringify({
    category: segment.category,
    name: segment.name,
    mode: segment.mode,
    text: segment.text,
  } satisfies SegmentText);
  const existing = piecesOf(deps.db, context.stage.id, "segment").find(
    (piece) => piece.idx === idx,
  );
  if (existing === undefined) {
    insertPiece(deps.db, {
      id: deps.ids.next(),
      stageId: context.stage.id,
      kind: "segment",
      idx,
      state: "done",
      payload,
    });
  } else setPiece(deps.db, existing.id, "done", payload);
}

export function instructionsText(sent: readonly SentMessages[]): string {
  const parts = sent.map(
    (one) =>
      `=== ${one.label} ===\n\n${one.messages.map((message) => message.content).join("\n\n")}`,
  );
  return `${parts.join("\n\n")}\n`;
}
