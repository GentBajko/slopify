import type { AudioPreviewStore } from "../../kernel/audio-preview.js";
import type { StageContext } from "../../kernel/runner/index.js";
import type { LlmAnswer, StageProviders } from "../../kernel/runner/providers.js";
import type { StageRunResult } from "../../kernel/runner/work.js";
import { plainText } from "../article/plain.js";
import { splitEndMatter } from "../article/split.js";
import { observeNarration } from "../narration/live.js";
import { chaptersFrom } from "../research/planner.js";
import { sourcedAnswer } from "../research/synthesis.js";
import type { RevisionDeps } from "../revisions/model.js";
import { writeAsset } from "../storage/assets.js";
import type { RecordEvent } from "../telemetry/model.js";
import { executeArticleRequests } from "./runtime-article.js";
import { frozenInstructions } from "./runtime-instructions.js";
import { executionPlan, executionView, savedCatalogue } from "./runtime-plan.js";
import { preparedResult, preparedTexts, publishResult } from "./runtime-publication.js";
import type { WorkPiece } from "./work-records.js";

export interface ProviderExecutionDeps extends RevisionDeps {
  readonly audioPreviews?: AudioPreviewStore | undefined;
  readonly count?: RecordEvent | undefined;
}

export async function executeProviderRecipe(
  deps: ProviderExecutionDeps,
  context: StageContext,
  providers: StageProviders,
  piece: WorkPiece,
): Promise<StageRunResult> {
  if (
    deps.db
      .prepare("SELECT state FROM revision_work_pieces WHERE id=? AND work_id=?")
      .get(piece.id, context.work.workId)?.state === "done"
  )
    return "done";
  const input = piece.input;
  const wrapped = providers.forPiece(piece.id);
  if (input.kind === "llm") {
    const answer =
      piece.key === "article:body"
        ? await executeArticleRequests(deps, context, providers, piece)
        : await wrapped.llm({
            provider: input.provider,
            model: input.model,
            ...(input.thinking === null ? {} : { thinking: input.thinking }),
            thinkingConfig: input.thinkingConfig,
            messages: input.messages,
            webSearch: input.webSearch,
            previewLabel: piece.key,
            check: (value) => checkAnswer(piece, value),
          });
    if (!answer.ok) return "held";
    await publishText(deps, context, piece, answer.value);
    const segment =
      piece.key === "entry:intro:text"
        ? "intro"
        : piece.key === "entry:outro:text"
          ? "outro"
          : undefined;
    deps.count?.("stage.completed", {
      stage: context.work.kind,
      provider: input.provider,
      model: input.model,
      ...(segment === undefined ? {} : { segment }),
      tokensIn: answer.value.usage?.inputTokens ?? 0,
      tokensOut: answer.value.usage?.outputTokens ?? 0,
    });
    return "done";
  }
  if (input.kind === "tts") {
    const spoken = await wrapped.tts(
      { provider: input.provider, model: input.model, voiceId: input.voice, text: input.text },
      observeNarration(
        deps.audioPreviews,
        context.work.projectId,
        piece.id,
        narrationLabel(deps, context, piece),
        { revisionId: context.work.revisionId, workId: context.work.workId, workPieceId: piece.id },
      ),
    );
    if (!spoken.ok) return "held";
    const asset = writeAsset(deps, context.work.projectId, "narration.mp3", spoken.value.bytes);
    await publishResult(
      deps,
      context,
      piece,
      [],
      { text: input.text, logicalKey: input.logicalKey, segment: input.segment },
      asset,
    );
    return "done";
  }
  if (input.kind === "image") {
    const image = await wrapped.image({
      provider: input.provider,
      model: input.model,
      prompt: input.prompt,
      aspect: input.aspect,
    });
    if (!image.ok) return "held";
    const asset = writeAsset(
      deps,
      context.work.projectId,
      image.value.mime === "image/jpeg" ? "image.jpg" : "image.png",
      image.value.bytes,
    );
    const view = executionView(deps, context.work.projectId, context.work.revisionId);
    const index = piece.key.startsWith("image:")
      ? (view?.revision.content.imageOrder.indexOf(piece.key.slice(6)) ?? 0) + 1
      : undefined;
    const output = preparedResult(
      deps,
      context,
      piece,
      piece.key === "thumbnail:image" ? "thumbnail" : "image",
      asset,
      null,
      {
        prompt: input.prompt,
        provider: input.provider,
        model: input.model,
        ...(index === undefined ? {} : { index }),
      },
    );
    await publishResult(deps, context, piece, [output], { prompt: input.prompt }, asset);
    deps.count?.("stage.completed", {
      stage: context.work.kind,
      provider: input.provider,
      model: input.model,
      ...(piece.key === "thumbnail:image" ? { thumbnails: 1 } : { images: 1 }),
    });
    return "done";
  }
  throw new Error("Expected an exact provider recipe.");
}

function checkAnswer(piece: WorkPiece, answer: LlmAnswer): string | undefined {
  if (answer.text.trim() === "") return "The provider answered with nothing.";
  if (piece.key === "research:planner")
    return chaptersFrom(answer.text).length === 0 ? "The planner named no chapters." : undefined;
  if (piece.key === "research:notes" || piece.key.startsWith("research:chapter:"))
    return sourcedAnswer(piece.key, answer.text);
  return undefined;
}
async function publishText(
  deps: RevisionDeps,
  context: StageContext,
  piece: WorkPiece,
  answer: LlmAnswer,
): Promise<void> {
  if (piece.key === "article:body") {
    const parts = splitEndMatter(answer.text);
    await publishResult(
      deps,
      context,
      piece,
      preparedTexts(deps, context, piece, [
        ["instructions", "instructions.md", frozenInstructions(deps, context, piece)],
        ["article_md", "article.md", answer.text],
        ["article_txt", "article.txt", plainText(parts.body)],
        ...(parts.sources ? [["sources", "sources.md", parts.sources] as const] : []),
        ...(parts.glossary ? [["glossary", "glossary.md", parts.glossary] as const] : []),
      ]),
      { text: answer.text },
    );
    return;
  }
  if (piece.key === "research:notes") {
    await publishResult(
      deps,
      context,
      piece,
      preparedTexts(deps, context, piece, [
        ["notes", "notes.md", answer.text],
        ["instructions", "instructions.md", frozenInstructions(deps, context, piece)],
      ]),
      { text: answer.text },
    );
    return;
  }
  if (piece.key === "research:planner") {
    await publishResult(deps, context, piece, [], { outline: chaptersFrom(answer.text) });
    return;
  }
  if (piece.key.startsWith("research:chapter:")) {
    const view = executionView(deps, context.work.projectId, context.work.revisionId);
    const planner = view?.pieces.find((row) => row.selected && row.key === "research:planner");
    const outline: unknown = JSON.parse(planner?.piece.payload ?? "{}");
    const titles =
      typeof outline === "object" &&
      outline !== null &&
      "outline" in outline &&
      Array.isArray(outline.outline)
        ? outline.outline
        : [];
    const title: unknown = titles[Number(piece.key.split(":").at(-1)) - 1];
    if (typeof title !== "string") throw new Error("Research chapter has no pinned title.");
    await publishResult(deps, context, piece, [], { title, notes: answer.text });
    return;
  }
  await publishResult(
    deps,
    context,
    piece,
    preparedTexts(deps, context, piece, [
      ["instructions", "instructions.md", frozenInstructions(deps, context, piece)],
    ]),
    { text: answer.text, prompt: answer.text },
  );
}

function narrationLabel(deps: RevisionDeps, context: StageContext, piece: WorkPiece): string {
  if (piece.input.kind !== "tts") return "Narration";
  const name =
    piece.input.segment === "body" ? "Body" : piece.input.segment === "intro" ? "Intro" : "Outro";
  const view = executionView(deps, context.work.projectId, context.work.revisionId);
  const row = deps.db
    .prepare("SELECT recipe_context FROM revision_work WHERE id=?")
    .get(context.work.workId);
  if (view === undefined || row?.recipe_context === undefined || row.recipe_context === null)
    return name;
  const segment = piece.input.segment;
  const parts = executionPlan(deps, view, savedCatalogue(row.recipe_context)).recipes.filter(
    (recipe) => recipe.input.kind === "tts" && recipe.input.segment === segment,
  );
  const index = parts.findIndex((recipe) => recipe.key === piece.key);
  return parts.length > 1 && index >= 0 ? `${name} part ${index + 1} of ${parts.length}` : name;
}
