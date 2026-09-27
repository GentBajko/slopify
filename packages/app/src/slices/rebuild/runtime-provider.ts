import type { AudioPreviewStore } from "../../kernel/audio-preview.js";
import type { StageContext } from "../../kernel/runner/index.js";
import type { LlmAnswer, StageProviders } from "../../kernel/runner/providers.js";
import type { StageRunResult } from "../../kernel/runner/work.js";
import { referenceKey, thumbnailVariant } from "../admission/model.js";
import { plainText } from "../article/plain.js";
import { splitEndMatter } from "../article/split.js";
import { observeNarration } from "../narration/live.js";
import { validatePreparation } from "../narration/preparation.js";
import { prepareRequests } from "../narration/steering.js";
import { chaptersFrom } from "../research/planner.js";
import { sourcedAnswer } from "../research/synthesis.js";
import type { RevisionDeps } from "../revisions/model.js";
import { discardPreparedAssets, writeAsset } from "../storage/assets.js";
import { outputPath } from "../storage/layout.js";
import type { RecordEvent } from "../telemetry/model.js";
import { probeDurationMs } from "../video/ffmpeg.js";
import { parseAttribution } from "../voices/attribution.js";
import { parseScript } from "../voices/script.js";
import { executeArticleRequests } from "./runtime-article.js";
import { imageCall } from "./runtime-image.js";
import { frozenInstructions } from "./runtime-instructions.js";
import { executionPlan, executionView, savedCatalogue } from "./runtime-plan.js";
import { preparedResult, preparedTexts, publishResult } from "./runtime-publication.js";
import { clearSoftening, softenedPrompt, softeningRequested, softenMessages } from "./soften.js";
import type { WorkPiece } from "./work-records.js";

export interface ProviderExecutionDeps extends RevisionDeps {
  readonly ffmpeg?: string | undefined;
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
            documents: input.documents,
            webSearch: input.webSearch,
            previewLabel: piece.key,
            check: (value) =>
              checkAnswer(piece, value) ?? checkPreparation(deps, context, piece, value),
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
      {
        provider: input.provider,
        model: input.model,
        voiceId: input.voice,
        text: input.text,
        ...(input.dialogue === undefined
          ? {}
          : {
              dialogue: input.dialogue.map((line) => ({ voiceId: line.voice, text: line.text })),
            }),
      },
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
    try {
      const durationMs =
        deps.count === undefined
          ? undefined
          : deps.measureAudio !== undefined
            ? await deps.measureAudio(
                outputPath(deps.paths, context.work.projectId, asset.path),
                context.signal,
              )
            : deps.ffmpeg === undefined
              ? undefined
              : await probeDurationMs(
                  deps.ffmpeg,
                  outputPath(deps.paths, context.work.projectId, asset.path),
                  context.signal,
                  deps.log,
                );
      await publishResult(
        deps,
        context,
        piece,
        [],
        {
          text: input.text,
          ...(input.spokenText === undefined ? {} : { spokenText: input.spokenText }),
          logicalKey: input.logicalKey,
          logicalText: input.logicalText,
          segment: input.segment,
          provider: input.provider,
          model: input.model,
          voice: input.voice,
          ...(durationMs === undefined ? {} : { durationMs }),
        },
        asset,
      );
      context.emit({
        type: "narration.piece",
        projectId: context.work.projectId,
        key: piece.key,
        durationMs: durationMs ?? null,
        revisionId: context.work.revisionId,
        workId: context.work.workId,
        workPieceId: piece.id,
      });
      deps.count?.("stage.completed", {
        stage: "audio",
        segment: input.segment,
        provider: input.provider,
        model: input.model,
        ...(durationMs === undefined ? {} : { audioSeconds: durationMs / 1000 }),
      });
    } finally {
      discardPreparedAssets(deps, [asset]);
    }
    return "done";
  }
  if (input.kind === "image") {
    const view = executionView(deps, context.work.projectId, context.work.revisionId);
    const index = piece.key.startsWith("image:")
      ? (view?.revision.content.imageOrder.indexOf(piece.key.slice(6)) ?? 0) + 1
      : undefined;
    // Which thumbnail this is (1-3), or undefined for any other image.
    const variant = thumbnailVariant(piece.key);
    const label =
      variant !== undefined
        ? variant === 1
          ? "Thumbnail"
          : `Thumbnail ${String(variant)}`
        : piece.key === referenceKey
          ? "Establishing image"
          : index === undefined
            ? "Image"
            : `Image ${String(index)}`;
    const softened = await softenIfAsked(deps, context, wrapped, piece, input.prompt, label);
    if (softened === "held") return "held";
    const prompt = softened ?? input.prompt;
    const image = await wrapped.image(
      imageCall(deps, context.work.projectId, { ...input, prompt }, label),
    );
    if (!image.ok) return "held";
    const asset = writeAsset(
      deps,
      context.work.projectId,
      image.value.mime === "image/jpeg" ? "image.jpg" : "image.png",
      image.value.bytes,
    );
    const output = preparedResult(
      deps,
      context,
      piece,
      variant !== undefined ? "thumbnail" : piece.key === referenceKey ? "reference" : "image",
      asset,
      null,
      {
        prompt,
        provider: input.provider,
        model: input.model,
        ...(index === undefined ? {} : { index }),
        // The second and third thumbnails carry their number; the first keeps the meta a
        // thumbnail always had.
        ...(variant === undefined || variant === 1 ? {} : { index: variant }),
      },
    );
    await publishResult(deps, context, piece, [output], { prompt }, asset);
    if (softened !== undefined) clearSoftening(deps.db, context.work.projectId, [piece.key]);
    deps.count?.("stage.completed", {
      stage: context.work.kind,
      provider: input.provider,
      model: input.model,
      ...(variant !== undefined ? { thumbnails: 1 } : { images: 1 }),
    });
    return "done";
  }
  throw new Error(
    "Slopify hit an internal error (this step has no provider request to run). Use Try again; if it happens again, use Download diagnostics in Settings and report it.",
  );
}

// Soften and retry (`soften.ts`): the project's AI model rewords a refused image prompt
// before the image is drawn again. Undefined when nobody asked, or the project has no model.
async function softenIfAsked(
  deps: ProviderExecutionDeps,
  context: StageContext,
  providers: StageProviders,
  piece: WorkPiece,
  prompt: string,
  label: string,
): Promise<string | "held" | undefined> {
  if (!softeningRequested(deps.db, context.work.projectId, piece.key)) return undefined;
  const llm = executionView(deps, context.work.projectId, context.work.revisionId)?.revision.config
    .llm;
  if (llm === undefined) return undefined;
  const answer = await providers.llm({
    provider: llm.provider,
    model: llm.model,
    ...(llm.thinking === undefined ? {} : { thinking: llm.thinking }),
    messages: softenMessages(prompt),
    previewLabel: `${label}: softened prompt`,
    check: (value) =>
      softenedPrompt(value.text) === ""
        ? "The AI model sent back an empty prompt while softening it. Use Soften and retry again, or reword the prompt yourself in Edit project → Images."
        : undefined,
  });
  return answer.ok ? softenedPrompt(answer.value.text) : "held";
}

function checkAnswer(piece: WorkPiece, answer: LlmAnswer): string | undefined {
  if (answer.text.trim() === "")
    return "The AI model sent back an empty answer. Use Try again; if it keeps happening, choose another model in the Providers section of Edit project.";
  if (piece.key === "research:planner")
    return chaptersFrom(answer.text).length === 0
      ? "The AI model's research plan listed no chapters, so research could not go on. Use Try again; if it keeps happening, choose another model in the Providers section of Edit project."
      : undefined;
  if (piece.key === "research:notes" || piece.key.startsWith("research:chapter:"))
    return sourcedAnswer(piece.key, answer.text);
  // A speaker split that loses or adds words is asked for again rather than narrated.
  if (piece.input.kind === "llm" && piece.input.script?.attribute === true) {
    const checked = parseAttribution(
      answer.text,
      attributionSource(piece.input.messages),
      piece.input.script.speakers,
    );
    return checked.ok ? undefined : checked.reason;
  }
  return undefined;
}
function attributionSource(messages: readonly { readonly content: string }[]): string {
  return messages.at(-1)?.content ?? "";
}
async function publishText(
  deps: RevisionDeps,
  context: StageContext,
  piece: WorkPiece,
  answer: LlmAnswer,
): Promise<void> {
  if (piece.input.kind === "llm" && piece.input.preparation !== undefined) {
    const checked = validatePreparation(answer.text, piece.input.preparation.source);
    if (!checked.ok) throw new Error(checked.reason);
    await publishResult(deps, context, piece, [], {
      text: answer.text,
      preparation: piece.input.preparation,
      cues: checked.cues,
      logicalFingerprint: piece.logicalFingerprint ?? piece.fingerprint,
    });
    return;
  }
  if (piece.key === "article:body") {
    const parts = splitEndMatter(answer.text);
    // A script is read before it is kept: one the narration could not speak fails here, with
    // the line to fix, rather than at the narration.
    if (piece.input.kind === "llm" && piece.input.script !== undefined) {
      const checked = parseScript(parts.body, piece.input.script.speakers);
      if (!checked.ok)
        throw new Error(
          `The text model's script can't be read: ${checked.reason} Try again to have it written again, or fix it in Edit project → Article.`,
        );
    }
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
  if (piece.key === "script:attribute") {
    await publishResult(
      deps,
      context,
      piece,
      preparedTexts(deps, context, piece, [["script_md", "script.md", answer.text]]),
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
    if (typeof title !== "string")
      throw new Error(
        "Slopify hit an internal error (a research chapter has no title in the research plan). Use Try again; if it happens again, use Download diagnostics in Settings and report it.",
      );
    const asset = writeAsset(
      deps,
      context.work.projectId,
      `research-${piece.key.split(":").at(-1)}.md`,
      Buffer.from(answer.text),
    );
    await publishResult(deps, context, piece, [], { title, notes: answer.text }, asset);
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

function checkPreparation(
  deps: RevisionDeps,
  context: StageContext,
  piece: WorkPiece,
  answer: LlmAnswer,
): string | undefined {
  if (piece.input.kind !== "llm" || piece.input.preparation === undefined) return undefined;
  const source = piece.input.preparation.source;
  const checked = validatePreparation(answer.text, source);
  if (!checked.ok) return checked.reason;
  const row = deps.db
    .prepare("SELECT recipe_context FROM revision_work WHERE id=?")
    .get(context.work.workId);
  const model = savedCatalogue(row?.recipe_context).tts.find(
    (model) => model.provider === "inworld" && model.id === "inworld-tts-2",
  );
  const prepared = prepareRequests(source, checked.cues, model?.tts.maxCharacters ?? 4000);
  return prepared.ok ? undefined : prepared.reason;
}
