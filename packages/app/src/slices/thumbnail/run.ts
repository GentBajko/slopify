import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import type { Clock } from "../../kernel/clock.js";
import type { Ids } from "../../kernel/ids.js";
import type { Log } from "../../kernel/log.js";
import type { Paths } from "../../kernel/paths.js";
import type { GeneratedImage } from "../../kernel/ports/image.js";
import type { Message } from "../../kernel/ports/llm.js";
import type { StageContext } from "../../kernel/runner/index.js";
import type { StagePiece } from "../../kernel/runner/piece-repo.js";
import { insertPiece, piecesOf, setPiece } from "../../kernel/runner/piece-repo.js";
import type { LlmAnswer, StageProviders } from "../../kernel/runner/providers.js";
import type { Project, ProviderChoice } from "../admission/model.js";
import { projectById } from "../admission/repo.js";
import { outputFileName, outputPath } from "../storage/layout.js";
import type { Output } from "../storage/model.js";
import { insertOutput, outputsOf } from "../storage/repo.js";
import { storeText } from "../storage/staging.js";
import type { RecordEvent, Tokens } from "../telemetry/model.js";
import { noTokens, plusUsage } from "../telemetry/model.js";
import type { ThumbnailBrief } from "./by-llm.js";
import { thumbnailMessages, writtenPrompt } from "./by-llm.js";

// The thumbnail is one image, sized to the run's aspect and stored apart from the slideshow.
// Its prompt comes either straight from the picked thumbnail template or from one LLM call that
// writes it, and that written prompt is kept, so a retry redoes the image call alone and never
// rewrites the wording.

export interface ThumbnailDeps {
  readonly db: DatabaseSync;
  readonly paths: Paths;
  readonly ids: Ids;
  readonly clock: Clock;
  readonly log: Log;
  // One event when the thumbnail is made.
  readonly count: RecordEvent;
}

// What `byLlm` spent, beside the prompt it came back with. A prompt kept from a previous
// run cost this one nothing, which is what keeps the resume from counting twice.
interface WrittenThumbnailPrompt {
  readonly prompt: string;
  // Absent only on the resume path of a run whose LLM row has gone; the event then names
  // the image model that drew the thumbnail instead.
  readonly provider?: string | undefined;
  readonly model?: string | undefined;
  readonly tokens: Tokens;
}

// The `prompt_written` sub-step, persisted for resume: the prompt the LLM wrote and the
// messages that asked for it, so a resumed run reproduces the record without asking
// again.
const writtenPayload = z.object({ prompt: z.string(), sent: z.string() });

export async function runThumbnail(
  deps: ThumbnailDeps,
  context: StageContext,
  providers: StageProviders,
): Promise<void> {
  const { projectId } = context.stage;
  const project = projectById(deps.db, projectId);
  if (project === undefined) {
    throw new Error(`project ${projectId} has no row`);
  }
  const source = project.config.sources.thumbnail;
  if (source !== "from_prompt" && source !== "prompt_by_llm") {
    // Off is `skipped` and Provide is `provided` at project creation,
    // so the runner never starts this stage for either.
    throw new Error(`the thumbnail stage cannot run with its source set to ${source}`);
  }
  const choice = project.config.images;
  if (choice === undefined) {
    // Admission requires the image provider whenever the thumbnail is generated, so reaching
    // here is a bug in admission rather than the user's.
    throw new Error("the run has no image provider or model");
  }

  const written =
    source === "from_prompt" ? undefined : await byLlm(deps, context, providers, project);
  const prompt = written?.prompt ?? fromTemplate(project);

  await make(deps, context, providers, project, choice, prompt);
  // Tokens are counted with a provider and model name per stage, and a payload names one
  // provider. This stage can use two - the LLM that writes the prompt and the image model
  // that draws it - so the event names whichever one's usage it reports, because both are
  // shown beside the token columns on the Usage page. A thumbnail from a picked template
  // makes no LLM call, so it names the image model and reports zero tokens.
  deps.count("stage.completed", {
    stage: "thumbnail",
    provider: written?.provider ?? choice.provider,
    model: written?.model ?? choice.model,
    ...(written?.tokens ?? noTokens),
    thumbnails: 1,
  });
  deps.log.write("info", "thumbnail.done", {
    projectId,
    stage: "thumbnail",
    detail: source === "from_prompt" ? "from the picked prompt" : "from the prompt the LLM wrote",
  });
}

// The rendered thumbnail template goes to the image provider as it is.
function fromTemplate(project: Project): string {
  const rendered = project.config.rendered.thumbnailPrompt;
  if (rendered === undefined) {
    throw new Error("the run has no rendered thumbnail prompt");
  }
  return rendered;
}

// A written prompt already on the project is reused, so a manual retry redoes only the
// image call and the wording the user is looking at does not change under them.
async function byLlm(
  deps: ThumbnailDeps,
  context: StageContext,
  providers: StageProviders,
  project: Project,
): Promise<WrittenThumbnailPrompt> {
  const kept = piecesOf(deps.db, context.stage.id, "prompt_written")[0];
  const llm = project.config.llm;
  if (kept !== undefined && kept.state === "done") {
    // The wording the user is looking at does not change under them. No call was
    // made, so this run counts none - the run that wrote the prompt already did.
    return {
      prompt: payloadOf(kept).prompt,
      ...(llm === undefined ? {} : named(llm)),
      tokens: noTokens,
    };
  }
  if (llm === undefined) {
    // Admission requires the LLM row when the thumbnail source is Prompt by LLM.
    throw new Error("the run has no LLM provider or model");
  }
  const messages = thumbnailMessages(brief(deps, project));
  const answer = await providers.llm({
    provider: llm.provider,
    model: llm.model,
    messages,
    // An empty answer is a failed attempt, and the wrapper is what retries it.
    check: (given: LlmAnswer): string | undefined => writtenPrompt(given.text),
  });
  // The image prompt is exactly the LLM's output, never edited by the app.
  const prompt = answer.text.trim();
  keepWritten(deps, context, kept?.id, prompt, messages);
  // The messages sent are stored beside the article stage's, per stage.
  storeText(deps, {
    projectId: context.stage.projectId,
    stageKind: "thumbnail",
    role: "instructions",
    text: instructionsText(messages),
  });
  return { prompt, ...named(llm), tokens: plusUsage(noTokens, answer.usage) };
}

function named(choice: ProviderChoice): { provider: string; model: string } {
  return { provider: choice.provider, model: choice.model };
}

function brief(deps: ThumbnailDeps, project: Project): ThumbnailBrief {
  const instruction = project.config.rendered.thumbnailPrompt;
  if (instruction === undefined) {
    throw new Error("the run has no rendered thumbnail prompt");
  }
  return {
    instruction,
    title: project.title,
    values: project.config.values,
    format: project.format,
    article: articleText(deps, project.id),
  };
}

// The stage never starts without an article on the project. The runner's graph holds the other
// half - the thumbnail waits on the article stage - so a project with no article row here is a
// stage that started against a run that never wrote one.
function articleText(deps: ThumbnailDeps, projectId: string): string {
  const article = outputsOf(deps.db, projectId).find((output) => output.role === "article_txt");
  if (article === undefined) {
    throw new Error("the project has no article for the thumbnail prompt to be written from");
  }
  return readFileSync(outputPath(deps.paths, projectId, article.path), "utf8");
}

// The one row is keyed by `idx` within the stage, so a stage that runs again replaces what
// it wrote rather than colliding with it.
function keepWritten(
  deps: ThumbnailDeps,
  context: StageContext,
  existing: string | undefined,
  prompt: string,
  messages: readonly Message[],
): void {
  const payload = JSON.stringify({ prompt, sent: instructionsText(messages) });
  if (existing === undefined) {
    insertPiece(deps.db, {
      id: deps.ids.next(),
      stageId: context.stage.id,
      kind: "prompt_written",
      idx: 1,
      state: "done",
      payload,
    });
    return;
  }
  setPiece(deps.db, existing, "done", payload);
}

// One call, the same aspect rule as the slideshow, stored apart from it
// with the prompt text, the provider and the model.
async function make(
  deps: ThumbnailDeps,
  context: StageContext,
  providers: StageProviders,
  project: Project,
  choice: ProviderChoice,
  prompt: string,
): Promise<void> {
  const { projectId } = context.stage;
  if (outputsOf(deps.db, projectId).some((output) => output.role === "thumbnail")) {
    // The `image-done` sub-step: a retry that failed after the image landed keeps it.
    return;
  }
  const made = await providers.image({
    provider: choice.provider,
    model: choice.model,
    prompt,
    aspect: project.format,
  });
  const name = outputFileName(
    "thumbnail",
    1,
    made.mime === "image/png" ? ".png" : ".jpg",
    "thumbnail",
  );
  write(deps, projectId, name, made);
  // A cancel protects an output already stored, not one about to be: one landing between
  // the write and the row leaves a file the boot reconcile collects.
  context.signal.throwIfAborted();
  const output: Output = {
    id: deps.ids.next(),
    projectId,
    stageKind: "thumbnail",
    role: "thumbnail",
    path: name,
    originalFilename: null,
    bytes: made.bytes.byteLength,
    durationMs: null,
    // There is no `index`: the thumbnail stays out of the slideshow, and the render reads
    // that list by role.
    meta: {
      promptName: project.config.thumbnailPrompt ?? "",
      prompt,
      provider: choice.provider,
      model: choice.model,
    },
    createdAt: deps.clock.now().toISOString(),
  };
  // No `image.landed`: the thumbnail stays out of the slideshow, and that event's `index`
  // is a place in it. The stage reaching `done` is what tells the page.
  insertOutput(deps.db, output);
}

function write(deps: ThumbnailDeps, projectId: string, name: string, made: GeneratedImage): void {
  const target = outputPath(deps.paths, projectId, name);
  mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
  writeFileSync(target, made.bytes, { mode: 0o600 });
}

function instructionsText(messages: readonly Message[]): string {
  return `=== Thumbnail prompt ===\n\n${messages.map((message) => message.content).join("\n\n")}\n`;
}

function payloadOf(piece: StagePiece): z.infer<typeof writtenPayload> {
  if (piece.payload === null) {
    throw new Error(`the written thumbnail prompt ${piece.id} has no payload`);
  }
  return writtenPayload.parse(JSON.parse(piece.payload));
}
