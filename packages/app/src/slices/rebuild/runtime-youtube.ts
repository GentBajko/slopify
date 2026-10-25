import { internalError } from "../../kernel/errors.js";
import { withLanguage } from "../../kernel/ports/languages.js";
import { editSettings } from "../../kernel/ports/settings-places.js";
import type { StageContext } from "../../kernel/runner/index.js";
import type { StageProviders } from "../../kernel/runner/providers.js";
import type { StageRunResult } from "../../kernel/runner/work.js";
import {
  assembleDescription,
  checkDescriptionAnswer,
  descriptionMessages,
  tagsText,
} from "../youtube/answer.js";
import { defaultDescriptionPrompt } from "../youtube/model.js";
import { keepsShape, titleShape } from "../youtube/titles.js";
import { transcriptPassages, transcriptText } from "../youtube/transcript.js";
import type { ExportExecutionDeps } from "./runtime-export.js";
import { exportSnapshot, revisionAudio } from "./runtime-export-inputs.js";
import { workLlm } from "./runtime-plan.js";
import { preparedTexts, publishResult } from "./runtime-publication.js";
import { readTimingWords } from "./runtime-subtitles.js";
import { pieceAlreadyDone, type WorkPiece } from "./work-records.js";

// Writes the YouTube description, tags, pinned comment and other titles from the saved word timing: the transcript's
// passages carry their start in the final video, so the chapters the model picks are real
// times. An answer that breaks YouTube's chapter or tag rules is a failed attempt, which the
// provider wrapper asks again while attempts remain.
export async function executeYoutubeRecipe(
  deps: ExportExecutionDeps,
  context: StageContext,
  providers: StageProviders,
  piece: WorkPiece,
): Promise<StageRunResult> {
  if (pieceAlreadyDone(deps.db, context.work.workId, piece.id)) return "done";
  if (!context.maySubmit(piece.id)) return "held";
  context.signal.throwIfAborted();
  const input = piece.input;
  if (input.kind !== "local" || input.operation !== "youtube-description-v1")
    throw new Error(internalError("the YouTube description step was set up wrongly"));
  const { view } = exportSnapshot(deps, context, piece);
  const config = view.revision.config;
  const llm = config.llm;
  if (llm === undefined || llm.provider.trim() === "" || llm.model.trim() === "")
    throw new Error(
      `The YouTube description needs an AI model, and none is chosen. Choose a Service and a Model in ${editSettings.writer}, then Try again.`,
    );
  const { words } = readTimingWords(
    deps,
    context,
    view,
    "the YouTube description's chapters come from",
  );
  const passages = transcriptPassages(words);
  if (passages.length === 0)
    throw new Error(
      "The narration's word timing holds no words, so there is nothing to write the YouTube description from. Press Make the video again in the project's Video section, then Try again.",
    );
  // The same timeline the timing walked: silence at the start, intro, gaps, body, outro and
  // silence at the end.
  const audio = await revisionAudio(deps, context, view);
  const durationSeconds = audio.reduce((sum, segment) => sum + segment.seconds, 0);
  const saved = Array.isArray(input.values) ? input.values[4] : undefined;
  const instruction =
    typeof saved === "string" && saved.trim() !== "" ? saved : defaultDescriptionPrompt;
  // A title renamed away from its pattern in Edit project has nothing fixed any more.
  const pattern = titleShape(config.titlePattern, config.values);
  const shape = pattern !== undefined && keepsShape(pattern, config.title) ? pattern : undefined;
  const messages = withLanguage(
    descriptionMessages({
      instruction,
      title: config.title,
      shape,
      durationSeconds,
      transcript: transcriptText(passages),
    }),
    config.language,
  );
  const call = workLlm(deps.db, context.work.workId, llm, piece.key);
  if (!context.maySubmit(piece.id)) return "held";
  const answer = await providers.forPiece(piece.id).llm(
    call({
      messages,
      check: (value) => {
        const checked = checkDescriptionAnswer(value.text, durationSeconds, config.title, shape);
        return checked.ok ? undefined : checked.reason;
      },
    }),
  );
  if (!answer.ok) return "held";
  const checked = checkDescriptionAnswer(answer.value.text, durationSeconds, config.title);
  if (!checked.ok) throw new Error(checked.reason);
  const description = assembleDescription(checked.value);
  const tags = tagsText(checked.value.tags);
  const pinnedComment = checked.value.pinnedComment;
  const titles = checked.value.titles.join("\n");
  await publishResult(
    deps,
    context,
    piece,
    preparedTexts(deps, context, piece, [
      ["youtube_description", "description.txt", description],
      ["youtube_tags", "tags.txt", tags],
      ["youtube_pinned_comment", "pinned-comment.txt", pinnedComment],
      ["youtube_titles", "titles.txt", titles],
    ]),
    {
      description,
      tags: checked.value.tags,
      chapters: checked.value.chapters,
      pinnedComment,
      titles: checked.value.titles,
      durationSeconds,
    },
  );
  deps.count?.(
    "stage.completed",
    {
      provider: llm.provider,
      model: llm.model,
      tokensIn: answer.value.usage?.inputTokens ?? 0,
      tokensOut: answer.value.usage?.outputTokens ?? 0,
      descriptions: 1,
    },
    context.work.projectId,
  );
  return "done";
}
