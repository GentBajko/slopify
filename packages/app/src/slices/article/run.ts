import { existsSync, readFileSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import type { Clock } from "../../kernel/clock.js";
import type { Ids } from "../../kernel/ids.js";
import type { Log } from "../../kernel/log.js";
import type { Paths } from "../../kernel/paths.js";
import { messageRoles } from "../../kernel/ports/llm.js";
import type { StageContext } from "../../kernel/runner/index.js";
import { insertPiece, piecesOf, setPiece } from "../../kernel/runner/piece-repo.js";
import type { StageProviders } from "../../kernel/runner/providers.js";
import type { ProviderChoice } from "../admission/model.js";
import { projectById } from "../admission/repo.js";
import { outputPath } from "../storage/layout.js";
import { outputsOf } from "../storage/repo.js";
import { storeText } from "../storage/staging.js";
import type { RecordEvent } from "../telemetry/model.js";
import type { ArticleBrief, SentMessages } from "./continuation.js";
import { writeArticle } from "./continuation.js";
import { categories, instructionsText, keepSegment, writeSegment } from "./segments.js";
import { storeArticleText } from "./store.js";

export type { SegmentText } from "./segments.js";

// One streamed call writes the article from the research notes and the rendered prompt, its end
// matter is cut into files of its own, and the picked intro and outro get their text last,
// since an LLM-mode entry is written from the article.

export interface ArticleDeps {
  readonly db: DatabaseSync;
  readonly paths: Paths;
  readonly ids: Ids;
  readonly clock: Clock;
  readonly log: Log;
  // One event for the article, one for each intro or outro text.
  readonly count: RecordEvent;
}

export async function runArticle(
  deps: ArticleDeps,
  context: StageContext,
  providers: StageProviders,
): Promise<void> {
  const { projectId } = context.stage;
  const project = projectById(deps.db, projectId);
  if (project === undefined) {
    throw new Error(`project ${projectId} has no row`);
  }
  const choice = project.config.llm;
  const articlePrompt = project.config.rendered.article;
  if (choice === undefined || articlePrompt === undefined) {
    // Admission refuses a run whose article is Generate without both, so
    // reaching here is a bug in admission rather than something the user did.
    throw new Error("the run has no LLM provider or no rendered article prompt");
  }
  const notes = researchNotes(deps, projectId);
  const brief: ArticleBrief = { articlePrompt, ...(notes === undefined ? {} : { notes }) };

  const completed = await articleBody(deps, context, providers, choice, brief);
  const { narration } = completed;
  const sent = [...completed.sent];
  for (const [index, category] of categories.entries()) {
    if (project.config.sources.audio !== "generate") break;
    if (
      completed.resumed &&
      piecesOf(deps.db, context.stage.id, "segment").some(
        (piece) => piece.idx === index + 1 && piece.state === "done",
      )
    )
      continue;
    const segment = await writeSegment(
      providers,
      choice,
      project.config,
      category,
      narration,
      sent,
    );
    if (segment !== undefined) {
      keepSegment(deps, context, segment, index + 1);
      checkpointArticle(deps, context, sent);
      // One event per intro/outro text, named by its segment. A text-mode entry is
      // rendered rather than written, so it made no call, names no provider and reports
      // zero tokens rather than an estimate.
      deps.count("stage.completed", {
        stage: "article",
        segment: category,
        ...(segment.mode === "llm" ? { provider: choice.provider, model: choice.model } : {}),
        ...segment.tokens,
      });
    }
  }

  // The exact messages sent, the continuations and the entry calls among them.
  storeText(deps, {
    projectId,
    stageKind: "article",
    role: "instructions",
    text: instructionsText(sent),
  });
  deps.log.write("info", "article.done", {
    projectId,
    stage: "article",
    detail: `${String(narration.length)} characters to narrate`,
  });
}

// Once the article is stored, a pause during end matter resumes that end matter
// instead of buying and replacing the article again. Re-run clears this checkpoint.
const articleCheckpoint = z.object({
  sent: z.array(
    z.object({
      label: z.string(),
      messages: z.array(z.object({ role: z.enum(messageRoles), content: z.string() })),
    }),
  ),
});

async function articleBody(
  deps: ArticleDeps,
  context: StageContext,
  providers: StageProviders,
  choice: ProviderChoice,
  brief: ArticleBrief,
): Promise<{
  readonly narration: string;
  readonly sent: readonly SentMessages[];
  readonly resumed: boolean;
}> {
  const { projectId } = context.stage;
  const saved = piecesOf(deps.db, context.stage.id, "article_written")[0];
  const outputs = outputsOf(deps.db, projectId);
  const plain = outputs.find((output) => output.role === "article_txt");
  const markdown = outputs.find((output) => output.role === "article_md");
  if (
    saved?.payload !== null &&
    saved?.payload !== undefined &&
    plain &&
    markdown &&
    existsSync(outputPath(deps.paths, projectId, plain.path)) &&
    existsSync(outputPath(deps.paths, projectId, markdown.path))
  ) {
    return {
      narration: readFileSync(outputPath(deps.paths, projectId, plain.path), "utf8"),
      sent: articleCheckpoint.parse(JSON.parse(saved.payload)).sent,
      resumed: true,
    };
  }
  const written = await writeArticle(providers, choice, brief, (text) => {
    context.emit({ type: "article.delta", projectId, text });
  });
  storeText(deps, { projectId, stageKind: "article", role: "article_md", text: written.markdown });
  const narration = storeArticleText(deps, { projectId, markdown: written.markdown });
  checkpointArticle(deps, context, written.sent);
  deps.count("stage.completed", {
    stage: "article",
    provider: choice.provider,
    model: choice.model,
    ...written.tokens,
  });
  return { narration, sent: written.sent, resumed: false };
}

function checkpointArticle(
  deps: ArticleDeps,
  context: StageContext,
  sent: readonly SentMessages[],
): void {
  const existing = piecesOf(deps.db, context.stage.id, "article_written")[0];
  const payload = JSON.stringify({ sent });
  if (existing) setPiece(deps.db, existing.id, "done", payload);
  else
    insertPiece(deps.db, {
      id: deps.ids.next(),
      stageId: context.stage.id,
      kind: "article_written",
      idx: 1,
      state: "done",
      payload,
    });
}

// Research writes its notes as an output of its own, and a provided research stage stores the
// pasted text the same way, so one lookup covers both. No row means research was Off or
// skipped, and the article is written from the prompt alone.
function researchNotes(deps: ArticleDeps, projectId: string): string | undefined {
  const notes = outputsOf(deps.db, projectId).find((output) => output.role === "notes");
  if (notes === undefined) {
    return undefined;
  }
  return readFileSync(outputPath(deps.paths, projectId, notes.path), "utf8");
}
