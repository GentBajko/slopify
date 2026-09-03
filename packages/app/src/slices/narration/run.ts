import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import type { Clock } from "../../kernel/clock.js";
import { transact } from "../../kernel/db/tx.js";
import type { Ids } from "../../kernel/ids.js";
import type { Log } from "../../kernel/log.js";
import type { Paths } from "../../kernel/paths.js";
import type { StageContext } from "../../kernel/runner/index.js";
import type { StagePiece } from "../../kernel/runner/piece-repo.js";
import { insertPiece, piecesOf, setPiece } from "../../kernel/runner/piece-repo.js";
import type { StageProviders } from "../../kernel/runner/providers.js";
import type { VoiceChoice } from "../admission/model.js";
import { entryModes } from "../admission/model.js";
import { projectById, setStageProgress, stagesOf } from "../admission/repo.js";
import { entryCategories } from "../library/model.js";
import { outputFileName, outputPath } from "../storage/layout.js";
import type { Output, OutputRole } from "../storage/model.js";
import { insertOutput, outputsOf } from "../storage/repo.js";
import type { AudioSegment, RecordEvent } from "../telemetry/model.js";
import { probeDurationMs } from "../video/ffmpeg.js";
import { chunkNarration, defaultChunking } from "./chunk.js";
import { joinNarration } from "./concat.js";

// `logic/08`: the narration source is cut per the run's chunking choice, every chunk is
// synthesized in parallel as a resumable piece, the chunk audio is concatenated in order
// into one body file, and the picked intro and outro are one request each. Every call
// goes through the wrapped `providers.tts`, so the retry policy of `logic/01` step 6
// covers all of them and nothing here waits or counts attempts.

export interface NarrationDeps {
  readonly db: DatabaseSync;
  readonly paths: Paths;
  readonly ids: Ids;
  readonly clock: Clock;
  readonly log: Log;
  readonly ffmpeg: string;
  // logic/16 step 2: one event per narrated segment - body, intro, outro.
  readonly count: RecordEvent;
}

// §Q67, verbatim: an empty narration source is an "immediate stage failure 'nothing to
// narrate', no retries". Thrown from the slice rather than from a provider call, so the
// attempt wrapper never sees it and nothing is retried.
export const nothingToNarrate = "nothing to narrate";

// What a chunk piece carries between runs: the text that was sent, and the file it came
// back as once the provider answered. That is the whole of the resume of §Q66.
const chunkPayload = z.object({ text: z.string(), file: z.string().optional() });

// What the article stage left on its `segment` pieces (`logic/07` step 5).
const segmentPayload = z.object({
  category: z.enum(entryCategories),
  name: z.string(),
  mode: z.enum(entryModes),
  text: z.string(),
});

// The chunk audio sits in a folder of its own under the project. It is not an output:
// §Q65's invariant makes the concatenated body plus the picked intro and outro "the
// project's only audio outputs", so the pieces name these files and the boot reconcile
// keeps them by that name (`slices/storage/reconcile.ts`).
const chunkDir = "audio-chunks";

export async function runNarration(
  deps: NarrationDeps,
  context: StageContext,
  providers: StageProviders,
): Promise<void> {
  const { projectId } = context.stage;
  const project = projectById(deps.db, projectId);
  if (project === undefined) {
    throw new Error(`project ${projectId} has no row`);
  }
  const choice = project.config.audio;
  if (choice === undefined) {
    // Admission refuses a run whose audio is Generate without a provider and a voice
    // (`logic/04`), so reaching here is a bug in admission rather than something the user
    // did.
    throw new Error("the run has no TTS provider or voice");
  }
  // Read once, before anything is written: the segment steps below ask it what a previous
  // run already stored, and the body step is the only thing that adds to it.
  const outputs = outputsOf(deps.db, projectId);

  // Step 2. The end matter is already out of this text: the article stage cut it into
  // files of its own (§Q63, `logic/07` step 4), so nothing here can narrate a sources list.
  const chunking = project.config.chunking ?? defaultChunking;
  const texts = chunkNarration(narrationSource(deps, outputs, projectId), chunking);
  if (texts.length === 0) {
    throw new Error(nothingToNarrate);
  }

  const files = await speakChunks(deps, context, providers, choice, plan(deps, context, texts));
  await storeBody(deps, context, choice, files, outputs);
  await speakSegments(deps, context, providers, choice, outputs);

  deps.log.write("info", "narration.done", {
    projectId,
    stage: "audio",
    detail: `${String(texts.length)} chunks in ${chunking.mode} mode`,
  });
}

// The narration source of §Q37 and `logic/07` step 4: the plain-text article, written by
// the article stage or pasted in by a user whose article stage was set to Provide.
function narrationSource(
  deps: NarrationDeps,
  outputs: readonly Output[],
  projectId: string,
): string {
  const article = outputs.find((output) => output.role === "article_txt");
  if (article === undefined) {
    throw new Error(nothingToNarrate);
  }
  return readFileSync(outputPath(deps.paths, projectId, article.path), "utf8");
}

// The chunk list, planned once and kept. A retry after a failure finds the rows the first
// run wrote and narrates only the ones that did not finish (§Q66).
function plan(
  deps: NarrationDeps,
  context: StageContext,
  texts: readonly string[],
): readonly StagePiece[] {
  const existing = piecesOf(deps.db, context.stage.id, "chunk");
  if (existing.length > 0) {
    return existing;
  }
  const planned: StagePiece[] = texts.map((text, index) => ({
    id: deps.ids.next(),
    stageId: context.stage.id,
    kind: "chunk",
    idx: index + 1,
    state: "pending",
    payload: JSON.stringify({ text }),
  }));
  transact(deps.db, () => {
    for (const piece of planned) {
      insertPiece(deps.db, piece);
    }
  });
  return planned;
}

// Step 3: "Synthesize every chunk in parallel". §Q66: a chunk a previous run finished is
// not spoken again, and one that fails fails the whole stage while its siblings finish
// and keep their audio for the next resume.
async function speakChunks(
  deps: NarrationDeps,
  context: StageContext,
  providers: StageProviders,
  choice: VoiceChoice,
  pieces: readonly StagePiece[],
): Promise<readonly string[]> {
  const { projectId } = context.stage;
  const total = pieces.length;
  let done = pieces.filter((piece) => finished(deps, projectId, piece)).length;
  report(deps, context, done, total);

  const outcomes = await Promise.all(
    pieces.map(async (piece): Promise<Outcome> => {
      const carried = chunkOf(piece);
      const kept = finished(deps, projectId, piece);
      if (kept !== undefined) {
        return { ok: true, file: kept };
      }
      const file = `${chunkDir}/${String(piece.idx).padStart(3, "0")}.mp3`;
      setPiece(deps.db, piece.id, "running", piece.payload);
      try {
        const spoken = await providers.forPiece(piece.id).tts({
          provider: choice.provider,
          voiceId: choice.voice,
          text: carried.text,
        });
        write(deps, projectId, file, spoken.bytes);
        // The file is on disk before the row says so: a crash between the two leaves a
        // file the reconcile collects, where the other order would leave a `done` chunk
        // whose audio never existed and a concat that fails on every retry.
        setPiece(deps.db, piece.id, "done", JSON.stringify({ text: carried.text, file }));
        done += 1;
        report(deps, context, done, total);
        return { ok: true, file };
      } catch (error) {
        // A cancel is not this chunk failing: `logic/13` §Q112 counts an aborted call as
        // nothing, and the resume runs a `pending` chunk exactly as a failed one.
        setPiece(deps.db, piece.id, context.signal.aborted ? "pending" : "failed", piece.payload);
        return { ok: false, error };
      }
    }),
  );

  const files: string[] = [];
  for (const outcome of outcomes) {
    if (!outcome.ok) {
      throw outcome.error;
    }
    files.push(outcome.file);
  }
  return files;
}

type Outcome =
  | { readonly ok: true; readonly file: string }
  | { readonly ok: false; readonly error: unknown };

// Steps 4 and 6: one body file, in chunk order, with its measured duration on the row.
async function storeBody(
  deps: NarrationDeps,
  context: StageContext,
  choice: VoiceChoice,
  files: readonly string[],
  outputs: readonly Output[],
): Promise<void> {
  const { projectId } = context.stage;
  if (outputs.some((output) => output.role === "audio_body")) {
    // A retry that failed on a segment last time: the body is already joined and measured,
    // and joining it again would insert a second row for the same file.
    return;
  }
  const name = outputFileName("audio_body", 1, ".mp3", "audio");
  const durationMs = await joinNarration(
    { bin: deps.ffmpeg, log: deps.log },
    {
      files: files.map((file) => outputPath(deps.paths, projectId, file)),
      listPath: outputPath(deps.paths, projectId, `${chunkDir}/concat.txt`),
      output: outputPath(deps.paths, projectId, name),
      signal: context.signal,
    },
  );
  // `logic/13` §Q113 protects an output already stored, not one about to be: a cancel
  // landing between ffmpeg exiting and the row below leaves nothing recorded.
  context.signal.throwIfAborted();
  store(deps, projectId, "audio_body", name, durationMs, choice);
  counted(deps, "body", durationMs, choice);
}

// Step 5: "each picked segment's text is one TTS request with the same provider and
// voice, stored as its own audio file with its duration; body chunking does not apply to
// them" (§Q93). The text is whatever the article stage wrote onto the segment piece: an
// LLM-mode entry's answer, or a text-mode entry's rendered body, spoken verbatim.
async function speakSegments(
  deps: NarrationDeps,
  context: StageContext,
  providers: StageProviders,
  choice: VoiceChoice,
  outputs: readonly Output[],
): Promise<void> {
  const { projectId } = context.stage;
  for (const piece of segmentPieces(deps, projectId)) {
    const segment = segmentOf(piece);
    const role: OutputRole = segment.category === "intro" ? "audio_intro" : "audio_outro";
    if (outputs.some((output) => output.role === role)) {
      // Spoken by a previous run of this stage; §Q66's resume keeps it.
      continue;
    }
    const text = segment.text.trim();
    if (text === "") {
      // §Q67's rule, applied to a segment: there is nothing to say, and silently dropping
      // an intro the user picked would lose it without telling anyone.
      throw new Error(`the ${segment.category} segment has ${nothingToNarrate}`);
    }
    const spoken = await providers.forPiece(piece.id).tts({
      provider: choice.provider,
      voiceId: choice.voice,
      text,
    });
    const name = outputFileName(role, 1, ".mp3", "audio");
    write(deps, projectId, name, spoken.bytes);
    // Measured the same way the body is, because `logic/11` step 1 adds all three and the
    // gaps to get the length of the video (§Q68).
    const durationMs = await probeDurationMs(
      deps.ffmpeg,
      outputPath(deps.paths, projectId, name),
      context.signal,
      deps.log,
    );
    context.signal.throwIfAborted();
    store(deps, projectId, role, name, durationMs, choice);
    counted(deps, segment.category, durationMs, choice);
  }
}

// The segment pieces belong to the *article* stage, which is where `logic/07` step 5
// writes them, so they are read under its id and never under this stage's own. They stay
// there because `logic/12` is what depends on it: a Re-run audio (step 2) and the audio
// re-run an article edit cascades into (step 1) both clear the audio stage's pieces, and
// only the article stage ever writes an entry text - so an intro kept on this stage's row
// would be thrown away by the first re-narration and never written again.
function segmentPieces(deps: NarrationDeps, projectId: string): readonly StagePiece[] {
  const article = stagesOf(deps.db, projectId).find((stage) => stage.kind === "article");
  if (article === undefined) {
    // Admission writes all six stage rows with the project (`logic/04` step 6), so a
    // project without an article stage is a bug rather than a run the user configured.
    throw new Error(`project ${projectId} has no article stage`);
  }
  return piecesOf(deps.db, article.id, "segment");
}

// logic/16 step 3: "audio seconds from the measured duration per segment". The measured
// one, not the text's length: `logic/08` §Q68 puts the real duration on the row and
// `logic/11` builds the timeline from it. No model is named because the TTS port carries
// none - the same reason `store` above leaves it off the output row.
function counted(
  deps: NarrationDeps,
  segment: AudioSegment,
  durationMs: number,
  choice: VoiceChoice,
): void {
  deps.count("stage.completed", {
    stage: "audio",
    segment,
    provider: choice.provider,
    audioSeconds: durationMs / 1000,
  });
}

// Step 5: "k of N chunks narrated". Written as well as emitted, so a page opened mid-stage
// reads the count off the row rather than waiting for the next chunk.
function report(deps: NarrationDeps, context: StageContext, done: number, total: number): void {
  setStageProgress(deps.db, context.stage.id, done, total);
  context.emit({
    type: "stage.progress",
    projectId: context.stage.projectId,
    stage: "audio",
    current: done,
    total,
  });
}

// A chunk counts as finished only when its audio is still on disk: the row and the file
// are written one after the other, and the boot reconcile can remove a file whose row
// survived. Answering "done" for a missing file would fail the concat instead.
function finished(deps: NarrationDeps, projectId: string, piece: StagePiece): string | undefined {
  const file = chunkOf(piece).file;
  if (file === undefined) {
    return undefined;
  }
  return existsSync(outputPath(deps.paths, projectId, file)) ? file : undefined;
}

function write(deps: NarrationDeps, projectId: string, path: string, bytes: Uint8Array): void {
  const target = outputPath(deps.paths, projectId, path);
  mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
  writeFileSync(target, bytes, { mode: 0o600 });
}

// §Q68: the provider and the voice are stored with the audio they made. The model is not:
// the TTS port carries no model, so every request went to the adapter's own, and writing
// the run's dropdown value here would record something that was never sent.
function store(
  deps: NarrationDeps,
  projectId: string,
  role: OutputRole,
  path: string,
  durationMs: number,
  choice: VoiceChoice,
): void {
  insertOutput(deps.db, {
    id: deps.ids.next(),
    projectId,
    stageKind: "audio",
    role,
    path,
    originalFilename: null,
    bytes: statSync(outputPath(deps.paths, projectId, path)).size,
    durationMs,
    meta: { provider: choice.provider, voice: choice.voice },
    createdAt: deps.clock.now().toISOString(),
  });
}

function chunkOf(piece: StagePiece): z.infer<typeof chunkPayload> {
  if (piece.payload === null) {
    throw new Error(`chunk ${piece.id} has no payload`);
  }
  return chunkPayload.parse(JSON.parse(piece.payload));
}

function segmentOf(piece: StagePiece): z.infer<typeof segmentPayload> {
  if (piece.payload === null) {
    throw new Error(`segment ${piece.id} has no payload`);
  }
  return segmentPayload.parse(JSON.parse(piece.payload));
}
