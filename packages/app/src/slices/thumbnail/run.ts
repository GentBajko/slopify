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
import type { ThumbnailBrief } from "./by-llm.js";
import { thumbnailMessages, writtenPrompt } from "./by-llm.js";

// `logic/09` step 4 and `logic/10`: the thumbnail is one image, sized to the run's aspect
// and stored apart from the slideshow. Its prompt comes either straight from the picked
// thumbnail template or from one LLM call that writes it - and §Q82 keeps that written
// prompt, so a retry redoes the image call alone and never rewrites the wording.

export interface ThumbnailDeps {
  readonly db: DatabaseSync;
  readonly paths: Paths;
  readonly ids: Ids;
  readonly clock: Clock;
  readonly log: Log;
}

// The `prompt_written` sub-step of §Q82, persisted for resume: the prompt the LLM wrote
// and the messages that asked for it, so a resumed run reproduces the record without
// asking again.
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
    // Off is `skipped` and Provide is `provided` at project creation (`logic/01` step 1),
    // so the runner never starts this stage for either.
    throw new Error(`the thumbnail stage cannot run with its source set to ${source}`);
  }
  const choice = project.config.images;
  if (choice === undefined) {
    // Admission requires the image provider whenever the thumbnail is generated
    // (`logic/04` step 2), so reaching here is a bug in admission rather than the user's.
    throw new Error("the run has no image provider or model");
  }

  const prompt =
    source === "from_prompt"
      ? fromTemplate(project)
      : await byLlm(deps, context, providers, project);

  await make(deps, context, providers, project, choice, prompt);
  deps.log.write("info", "thumbnail.done", {
    projectId,
    stage: "thumbnail",
    detail: source === "from_prompt" ? "from the picked prompt" : "from the prompt the LLM wrote",
  });
}

// `logic/09` step 4: the rendered thumbnail template goes to the image provider as it is.
function fromTemplate(project: Project): string {
  const rendered = project.config.rendered.thumbnailPrompt;
  if (rendered === undefined) {
    throw new Error("the run has no rendered thumbnail prompt");
  }
  return rendered;
}

// `logic/10` steps 1 to 3. §Q82: a written prompt already on the project is reused, so a
// manual retry redoes only the image call and the wording the user is looking at does not
// change under them.
async function byLlm(
  deps: ThumbnailDeps,
  context: StageContext,
  providers: StageProviders,
  project: Project,
): Promise<string> {
  const kept = piecesOf(deps.db, context.stage.id, "prompt_written")[0];
  if (kept !== undefined && kept.state === "done") {
    return payloadOf(kept).prompt;
  }
  const llm = project.config.llm;
  if (llm === undefined) {
    // §Q81 makes the LLM row required when the thumbnail source is Prompt by LLM.
    throw new Error("the run has no LLM provider or model");
  }
  const messages = thumbnailMessages(brief(deps, project));
  const answer = await providers.llm({
    provider: llm.provider,
    model: llm.model,
    messages,
    // §Q82: an empty answer is a failed attempt, and the wrapper is what retries it.
    check: (given: LlmAnswer): string | undefined => writtenPrompt(given.text),
  });
  // Step 3 and §Q83: the image prompt is exactly the LLM's output, never edited by the app.
  const prompt = answer.text.trim();
  keepWritten(deps, context, kept?.id, prompt, messages);
  // The messages sent are stored beside the article stage's, per stage (`logic/14` step 2).
  storeText(deps, {
    projectId: context.stage.projectId,
    stageKind: "thumbnail",
    role: "instructions",
    text: instructionsText(messages),
  });
  return prompt;
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

// §Q79's invariant: the stage never starts without an article on the project. The runner's
// graph holds the other half - the thumbnail waits on the article stage - so a project
// with no article row here is a stage that started against a run that never wrote one.
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

// `logic/09` step 4: one call, the same aspect rule as the slideshow, stored apart from it
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
    // §Q82's `image-done` sub-step: a retry that failed after the image landed keeps it.
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
  // `logic/13` §Q113 protects an output already stored, not one about to be: a cancel
  // landing between the write and the row leaves a file the boot reconcile collects.
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
    // §Q76 and §Q80. There is no `index`: §Q72 keeps the thumbnail out of the slideshow,
    // and the render reads that list by role.
    meta: {
      promptName: project.config.thumbnailPrompt ?? "",
      prompt,
      provider: choice.provider,
      model: choice.model,
    },
    createdAt: deps.clock.now().toISOString(),
  };
  // No `image.landed`: §Q72 keeps the thumbnail out of the slideshow, and that event's
  // `index` is a place in it. The stage reaching `done` is what tells the page.
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
