import { readFileSync } from "node:fs";
import { z } from "zod";
import type { TimedWord } from "../../kernel/ports/subtitles.js";
import type { StageContext } from "../../kernel/runner/index.js";
import type { LlmCall, StageProviders } from "../../kernel/runner/providers.js";
import type { StageRunResult } from "../../kernel/runner/work.js";
import { usesShorts } from "../admission/rules.js";
import { resolveBoldFont } from "../fonts/index.js";
import type { RevisionView } from "../revisions/model.js";
import type { PreparedOutput } from "../revisions/publication-model.js";
import { clipWords } from "../shorts/captions.js";
import { effectiveClips, pickedShortsOf } from "../shorts/clips.js";
import {
  defaultShortsPrompt,
  musicVolumeOf,
  shortImageCount,
  shortsSpeedOf,
} from "../shorts/model.js";
import {
  checkPicks,
  keepNumbers,
  noPicksMessage,
  type PickBrief,
  type PickLimits,
  pickMessages,
  pickRetryMessages,
  type ShortPick,
} from "../shorts/pick.js";
import { checkImagePrompts } from "../shorts/prompts.js";
import { renderShort, type ShortMusic } from "../shorts/render.js";
import { allocateAsset, discardPreparedAssets, sealAsset, writeAsset } from "../storage/assets.js";
import { outputPath, projectDir } from "../storage/layout.js";
import { probeDurationMs } from "../video/ffmpeg.js";
import { usesVoices } from "../voices/model.js";
import { sentencesText, transcriptSentences } from "../youtube/transcript.js";
import { shortsPickKey } from "./recipe-shorts.js";
import type { ExportExecutionDeps } from "./runtime-export.js";
import { type ExportSnapshot, exportSnapshot, revisionAudio } from "./runtime-export-inputs.js";
import { imageCall } from "./runtime-image.js";
import { savedCatalogue } from "./runtime-plan.js";
import { preparedResult, preparedTexts, publishResult } from "./runtime-publication.js";
import { wordsSchema } from "./runtime-subtitles.js";
import type { WorkPiece } from "./work-records.js";

// The Shorts step's four kinds of work (`recipe-shorts.ts`): the pick, each clip's image
// prompts, each image, and each clip's render. Each is one piece of its own, so a failure
// names the clip it belongs to and Retry stage redoes only what did not finish.
export async function executeShortsRecipe(
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
  const snapshot = exportSnapshot(deps, context, piece);
  if (!usesShorts(snapshot.view.revision.config)) throw setupError();
  if (piece.key === "shorts:pick") return pick(deps, context, providers, piece, snapshot);
  const matched = /^shorts:(\d+):(prompts|image:(\d+)|render)$/.exec(piece.key);
  const number = Number(matched?.[1]);
  if (matched === null || !Number.isInteger(number)) throw setupError();
  const clip = savedClips(snapshot).find((one) => one.number === number);
  if (clip === undefined)
    throw new Error(
      "The clip this short was cut from is no longer among the picked shorts. Use Pick different moments in Edit project → Shorts, then Retry stage.",
    );
  if (matched[2] === "prompts") return prompts(deps, context, providers, piece, snapshot, clip);
  if (matched[2] === "render") return render(deps, context, piece, snapshot, clip);
  return image(deps, context, providers, piece, clip, Number(matched[3]));
}

async function pick(
  deps: ExportExecutionDeps,
  context: StageContext,
  providers: StageProviders,
  piece: WorkPiece,
  snapshot: ExportSnapshot,
): Promise<StageRunResult> {
  const input = piece.input;
  if (input.kind !== "local" || input.operation !== "shorts-pick-v1") throw setupError();
  const { view } = snapshot;
  const config = view.revision.config;
  const shorts = config.shorts;
  if (shorts === undefined) throw setupError();
  const llm = config.llm;
  if (llm === undefined || llm.provider.trim() === "" || llm.model.trim() === "")
    throw new Error(
      "Shorts need an AI text model to pick the clips, and none is chosen. Choose one in Edit project → Providers, then Retry stage.",
    );
  const sentences = transcriptSentences(timingWords(deps, context, view));
  if (sentences.length === 0)
    throw new Error(
      "The narration's word timing holds no words, so there is nothing to cut shorts from. Use Re-run section on Video, then Retry stage.",
    );
  const audio = await revisionAudio(deps, context, view);
  const durationSeconds = audio.reduce((sum, segment) => sum + segment.seconds, 0);
  const limits: PickLimits = {
    count: shorts.count,
    minSeconds: shorts.minSeconds,
    maxSeconds: shorts.maxSeconds,
    durationSeconds,
  };
  // Nothing to ask the model for, and nothing to pay for.
  if (durationSeconds < shorts.minSeconds) throw new Error(noPicksMessage([], limits));
  const saved = Array.isArray(input.values) ? input.values[4] : undefined;
  const brief: PickBrief = {
    instruction: typeof saved === "string" && saved.trim() !== "" ? saved : defaultShortsPrompt,
    title: config.title,
    durationSeconds,
    count: shorts.count,
    minSeconds: shorts.minSeconds,
    maxSeconds: shorts.maxSeconds,
    sentences: sentencesText(
      sentences,
      usesVoices(config) && config.voices !== undefined
        ? Object.fromEntries(
            config.voices.speakers.map((speaker) => [speaker.id, speaker.name.trim()]),
          )
        : undefined,
    ),
  };
  const ask = llmCall(deps, context, piece, view, (text) => {
    const checked = checkPicks(text, sentences, limits);
    return checked.ok ? undefined : checked.reason;
  });
  const first = await providers.forPiece(piece.id).llm(ask(pickMessages(brief)));
  if (!first.ok) return "held";
  let checked = checkPicks(first.value.text, sentences, limits);
  if (!checked.ok) throw new Error(checked.reason);
  // One more ask when clips were missing or broke the rules, with what was wrong; then
  // whichever answer held more usable clips.
  if (checked.picks.length < shorts.count && checked.problems.length > 0) {
    if (!context.maySubmit(piece.id)) return "held";
    const second = await providers
      .forPiece(piece.id)
      .llm(ask(pickRetryMessages(brief, first.value.text, checked.problems)));
    if (!second.ok) return "held";
    const again = checkPicks(second.value.text, sentences, limits);
    if (again.ok && again.picks.length >= checked.picks.length) checked = again;
  }
  if (checked.picks.length === 0) throw new Error(noPicksMessage(checked.problems, limits));
  // A clip picked again with the same sentences keeps its number and seed, so its prompts,
  // images and render are reused; the new ones carry this pick's token.
  const previous = pickedShortsOf(
    view.pieces.find((row) => row.key === shortsPickKey && row.selected)?.piece.payload,
  );
  const picks = keepNumbers(
    checked.picks,
    previous?.shorts ?? [],
    view.revision.content.regenerationTokens[shortsPickKey] ?? null,
  );
  await publishResult(
    deps,
    context,
    piece,
    preparedTexts(deps, context, piece, [
      [
        "shorts",
        "shorts.json",
        JSON.stringify(
          {
            shorts: picks.map(({ text: _text, seed: _seed, ...clip }) => clip),
          },
          null,
          2,
        ),
      ],
    ]),
    {
      shorts: picks,
      durationSeconds,
      // The numbered transcript's times, which a range set by hand is measured against.
      sentences: sentences.map(({ start, end, text }) => ({ start, end, text })),
    },
    null,
    // The shorts past the new count, from a pick that made more.
    (key) => Number(/^shorts:(\d+):/.exec(key)?.[1] ?? 0) > picks.length,
  );
  return "done";
}

async function prompts(
  deps: ExportExecutionDeps,
  context: StageContext,
  providers: StageProviders,
  piece: WorkPiece,
  snapshot: ExportSnapshot,
  clip: ShortPick,
): Promise<StageRunResult> {
  const input = piece.input;
  if (input.kind !== "llm") throw setupError();
  const count = shortImageCount(clip.end - clip.start, snapshot.view.revision.config.imageSeconds);
  const answer = await providers.forPiece(piece.id).llm({
    provider: input.provider,
    model: input.model,
    ...(input.thinking === null ? {} : { thinking: input.thinking }),
    thinkingConfig: input.thinkingConfig,
    messages: input.messages,
    webSearch: false,
    previewLabel: piece.key,
    check: (value) => {
      const checked = checkImagePrompts(value.text, count);
      return checked.ok ? undefined : checked.reason;
    },
  });
  if (!answer.ok) return "held";
  const checked = checkImagePrompts(answer.value.text, count);
  if (!checked.ok) throw new Error(checked.reason);
  const images = new RegExp(`^shorts:${String(clip.number)}:image:(\\d+)$`);
  await publishResult(
    deps,
    context,
    piece,
    [],
    { prompts: checked.prompts },
    null,
    // The images past this count, from a longer clip made before.
    (key) => Number(images.exec(key)?.[1] ?? 0) > count,
  );
  return "done";
}

async function image(
  deps: ExportExecutionDeps,
  context: StageContext,
  providers: StageProviders,
  piece: WorkPiece,
  clip: ShortPick,
  index: number,
): Promise<StageRunResult> {
  const input = piece.input;
  if (input.kind !== "image") throw setupError();
  const made = await providers
    .forPiece(piece.id)
    .image(
      imageCall(
        deps,
        context.work.projectId,
        input,
        `Short ${String(clip.number)} image ${String(index)}`,
      ),
    );
  if (!made.ok) return "held";
  const asset = writeAsset(
    deps,
    context.work.projectId,
    made.value.mime === "image/jpeg" ? "short-image.jpg" : "short-image.png",
    made.value.bytes,
  );
  const output = preparedResult(deps, context, piece, "short_image", asset, null, {
    short: clip.number,
    sentences: [clip.first, clip.last],
    index,
    prompt: input.prompt,
    provider: input.provider,
    model: input.model,
  });
  await publishResult(deps, context, piece, [output], { prompt: input.prompt }, asset);
  return "done";
}

async function render(
  deps: ExportExecutionDeps,
  context: StageContext,
  piece: WorkPiece,
  snapshot: ExportSnapshot,
  clip: ShortPick,
): Promise<StageRunResult> {
  const { view, plan } = snapshot;
  const config = view.revision.config;
  const prefix = `shorts:${String(clip.number)}:image:`;
  const images = plan.recipes
    .filter((recipe) => recipe.key.startsWith(prefix))
    .toSorted((left, right) => imageIndex(left.key) - imageIndex(right.key))
    .map((recipe) => {
      const row = view.outputs.find(
        (one) =>
          one.workKey === recipe.key && one.selected && one.available && one.state === "ready",
      );
      if (row === undefined)
        throw new Error(
          `Short ${String(clip.number)} is missing one of its images. Retry stage to make it again; if it keeps happening, use Make this short again in Edit project → Shorts.`,
        );
      return outputPath(deps.paths, context.work.projectId, row.output.path);
    });
  const words = clipWords(timingWords(deps, context, view), clip.start, clip.end);
  const timeline = await revisionAudio(deps, context, view);
  // The bundled Barlow is drawn in its own Bold face; any other font is emboldened.
  const font = await resolveBoldFont(deps.paths, config.subtitles?.fontId ?? "default");
  const shorts = config.shorts;
  const speed = shorts === undefined ? 1 : shortsSpeedOf(shorts);
  const music = await backgroundMusic(deps, context, view);
  if (!context.maySubmit(piece.id)) return "held";
  const pending = allocateAsset(deps, context.work.projectId, "short.mp4");
  const prepared: PreparedOutput[] = [];
  const seconds = (clip.end - clip.start) / speed;
  try {
    await renderShort({
      bin: deps.ffmpeg,
      timeline,
      start: clip.start,
      end: clip.end,
      images,
      imageSeconds: config.imageSeconds,
      motionStyle: config.motionStyle,
      zoomPercent: config.zoomPercent,
      words,
      font,
      ...(shorts?.titleOnScreen === true ? { title: clip.title } : {}),
      speed,
      music,
      output: pending.absolutePath,
      scratch: projectDir(deps.paths, context.work.projectId),
      signal: context.signal,
      log: deps.log,
      onProgress: (elapsedMs) =>
        context.emit({
          type: "stage.progress",
          projectId: context.work.projectId,
          stage: "video",
          current: Math.min(100, Math.round(elapsedMs / (seconds * 10))),
          total: 100,
        }),
    });
    context.signal.throwIfAborted();
    const durationMs = await probeDurationMs(
      deps.ffmpeg,
      pending.absolutePath,
      context.signal,
      deps.log,
    );
    const asset = sealAsset(deps, pending);
    prepared.push(
      preparedResult(deps, context, piece, "short_video", asset, durationMs, {
        short: clip.number,
        sentences: [clip.first, clip.last],
      }),
    );
    await publishResult(
      deps,
      context,
      piece,
      prepared,
      { short: clip.number, start: clip.start, end: clip.end, durationMs },
      asset,
    );
    // One per rendered short, with no stage: stage "video" would read as a finished video.
    // Its pick and prompt tokens are not counted here.
    deps.count?.("stage.completed", { shorts: 1 });
    return "done";
  } finally {
    discardPreparedAssets(deps, [pending, ...prepared.map((one) => one.asset)]);
  }
}

// The clips the pick saved for this plan, with any range set by hand in place: the
// selected pick whose fingerprint is the one the plan asks for.
function savedClips(snapshot: ExportSnapshot): readonly ShortPick[] {
  const recipe = snapshot.plan.recipes.find((one) => one.key === shortsPickKey);
  const row = snapshot.view.pieces.find(
    (one) =>
      one.key === shortsPickKey &&
      one.selected &&
      one.piece.state === "done" &&
      one.fingerprint === recipe?.fingerprint,
  );
  const picked = pickedShortsOf(row?.piece.payload);
  const shorts = snapshot.view.revision.config.shorts;
  if (picked === undefined || recipe === undefined || shorts === undefined) return [];
  return effectiveClips(
    picked,
    snapshot.view.revision.content.shortsRanges,
    recipe.fingerprint,
    shorts,
  );
}

// The project's background music for the shorts, checked readable before the render so a
// bad file is named as the music rather than as a failed render.
async function backgroundMusic(
  deps: ExportExecutionDeps,
  context: StageContext,
  view: RevisionView,
): Promise<ShortMusic | undefined> {
  const assetId = view.revision.content.shortsMusic;
  const shorts = view.revision.config.shorts;
  if (assetId === undefined || shorts === undefined) return undefined;
  const fix =
    "Choose another file under Background music in Edit project → Shorts, or remove the music, then Retry stage.";
  const row = z
    .object({ path: z.string() })
    .safeParse(
      deps.db
        .prepare("SELECT path FROM project_assets WHERE project_id=? AND id=?")
        .get(context.work.projectId, assetId),
    );
  if (!row.success)
    throw new Error(`The shorts' background music file is no longer in the project. ${fix}`);
  const path = outputPath(deps.paths, context.work.projectId, row.data.path);
  let durationMs: number;
  try {
    durationMs = await probeDurationMs(deps.ffmpeg, path, context.signal, deps.log);
  } catch (error) {
    context.signal.throwIfAborted();
    throw new Error(
      `The shorts' background music couldn't be read as audio (${error instanceof Error ? error.message : String(error)}). ${fix}`,
    );
  }
  if (durationMs <= 0) throw new Error(`The shorts' background music file holds no sound. ${fix}`);
  return { path, volume: musicVolumeOf(shorts) };
}

function timingWords(
  deps: ExportExecutionDeps,
  context: StageContext,
  view: RevisionView,
): readonly TimedWord[] {
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
      "The narration's word timing, which the shorts are cut and captioned from, is missing. Use Re-run section on Video, then Retry stage.",
    );
  return wordsSchema.parse(
    JSON.parse(
      readFileSync(outputPath(deps.paths, context.work.projectId, timing.output.path), "utf8"),
    ),
  ).words;
}

// The project's text model, with the thinking settings saved for this step's catalogue.
function llmCall(
  deps: ExportExecutionDeps,
  context: StageContext,
  piece: WorkPiece,
  view: RevisionView,
  check: (text: string) => string | undefined,
): (messages: LlmCall["messages"]) => LlmCall {
  const llm = view.revision.config.llm ?? { provider: "", model: "" };
  const row = deps.db
    .prepare("SELECT recipe_context FROM revision_work WHERE id=?")
    .get(context.work.workId);
  const model = savedCatalogue(row?.recipe_context).llm.find(
    (one) => one.provider === llm.provider && one.id === llm.model,
  );
  return (messages) => ({
    provider: llm.provider,
    model: llm.model,
    ...(llm.thinking === undefined ? {} : { thinking: llm.thinking }),
    thinkingConfig:
      llm.thinking === undefined ? null : (model?.llm.thinking?.[llm.thinking] ?? null),
    messages,
    webSearch: false,
    previewLabel: piece.key,
    check: (value) => check(value.text),
  });
}

function imageIndex(key: string): number {
  return Number(key.split(":").at(-1));
}

function setupError(): Error {
  return new Error(
    "Slopify hit an internal error (a Shorts step was set up wrongly). Retry stage; if it happens again, use Download diagnostics in Settings and report it.",
  );
}
