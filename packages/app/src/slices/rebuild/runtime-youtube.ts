import { readFileSync } from "node:fs";
import type { StageContext } from "../../kernel/runner/index.js";
import type { StageProviders } from "../../kernel/runner/providers.js";
import type { StageRunResult } from "../../kernel/runner/work.js";
import { outputPath } from "../storage/layout.js";
import {
  assembleDescription,
  checkDescriptionAnswer,
  descriptionMessages,
  tagsText,
} from "../youtube/answer.js";
import { defaultDescriptionPrompt } from "../youtube/model.js";
import { transcriptPassages, transcriptText } from "../youtube/transcript.js";
import type { ExportExecutionDeps } from "./runtime-export.js";
import { exportSnapshot, revisionAudio } from "./runtime-export-inputs.js";
import { savedCatalogue } from "./runtime-plan.js";
import { preparedTexts, publishResult } from "./runtime-publication.js";
import { wordsSchema } from "./runtime-subtitles.js";
import type { WorkPiece } from "./work-records.js";

// Writes the YouTube description and tags from the saved word timing: the transcript's
// passages carry their start in the final video, so the chapters the model picks are real
// times. An answer that breaks YouTube's chapter or tag rules is a failed attempt, which the
// provider wrapper asks again while attempts remain.
export async function executeYoutubeRecipe(
  deps: ExportExecutionDeps,
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
  if (!context.maySubmit(piece.id)) return "held";
  context.signal.throwIfAborted();
  const input = piece.input;
  if (input.kind !== "local" || input.operation !== "youtube-description-v1")
    throw new Error(
      "Slopify hit an internal error (the YouTube description step was set up wrongly). Retry stage; if it happens again, use Download diagnostics in Settings and report it.",
    );
  const { view } = exportSnapshot(deps, context, piece);
  const config = view.revision.config;
  const llm = config.llm;
  if (llm === undefined || llm.provider.trim() === "" || llm.model.trim() === "")
    throw new Error(
      "The YouTube description needs an AI text model, and none is chosen. Choose one in Edit project → Providers, then Retry stage.",
    );
  const timing = view.outputs.find(
    (row) =>
      row.selected &&
      row.available &&
      row.state === "ready" &&
      row.workKey === "subtitles:timing" &&
      row.output.role === "subtitle_words",
  );
  if (timing === undefined)
    throw new Error(
      "The narration's word timing, which the YouTube description's chapters come from, is missing. Use Re-run section on Video, then Retry stage.",
    );
  const { words } = wordsSchema.parse(
    JSON.parse(
      readFileSync(outputPath(deps.paths, context.work.projectId, timing.output.path), "utf8"),
    ),
  );
  const passages = transcriptPassages(words);
  if (passages.length === 0)
    throw new Error(
      "The narration's word timing holds no words, so there is nothing to write the YouTube description from. Use Re-run section on Video, then Retry stage.",
    );
  // The same timeline the timing walked: silence at the start, intro, gaps, body, outro and
  // silence at the end.
  const audio = await revisionAudio(deps, context, view);
  const durationSeconds = audio.reduce((sum, segment) => sum + segment.seconds, 0);
  const saved = Array.isArray(input.values) ? input.values[4] : undefined;
  const instruction =
    typeof saved === "string" && saved.trim() !== "" ? saved : defaultDescriptionPrompt;
  const messages = descriptionMessages({
    instruction,
    title: config.title,
    durationSeconds,
    transcript: transcriptText(passages),
  });
  const row = deps.db
    .prepare("SELECT recipe_context FROM revision_work WHERE id=?")
    .get(context.work.workId);
  const model = savedCatalogue(row?.recipe_context).llm.find(
    (one) => one.provider === llm.provider && one.id === llm.model,
  );
  if (!context.maySubmit(piece.id)) return "held";
  const answer = await providers.forPiece(piece.id).llm({
    provider: llm.provider,
    model: llm.model,
    ...(llm.thinking === undefined ? {} : { thinking: llm.thinking }),
    thinkingConfig:
      llm.thinking === undefined ? null : (model?.llm.thinking?.[llm.thinking] ?? null),
    messages,
    webSearch: false,
    previewLabel: piece.key,
    check: (value) => {
      const checked = checkDescriptionAnswer(value.text, durationSeconds);
      return checked.ok ? undefined : checked.reason;
    },
  });
  if (!answer.ok) return "held";
  const checked = checkDescriptionAnswer(answer.value.text, durationSeconds);
  if (!checked.ok) throw new Error(checked.reason);
  const description = assembleDescription(checked.value);
  const tags = tagsText(checked.value.tags);
  await publishResult(
    deps,
    context,
    piece,
    preparedTexts(deps, context, piece, [
      ["youtube_description", "description.txt", description],
      ["youtube_tags", "tags.txt", tags],
    ]),
    { description, tags: checked.value.tags, chapters: checked.value.chapters, durationSeconds },
  );
  deps.count?.("stage.completed", {
    provider: llm.provider,
    model: llm.model,
    tokensIn: answer.value.usage?.inputTokens ?? 0,
    tokensOut: answer.value.usage?.outputTokens ?? 0,
    descriptions: 1,
  });
  return "done";
}
