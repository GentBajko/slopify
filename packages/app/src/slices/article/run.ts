import { readFileSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import type { Clock } from "../../kernel/clock.js";
import type { Ids } from "../../kernel/ids.js";
import type { Log } from "../../kernel/log.js";
import type { Paths } from "../../kernel/paths.js";
import type { Message } from "../../kernel/ports/llm.js";
import type { StageContext } from "../../kernel/runner/index.js";
import { insertPiece, piecesOf, setPiece } from "../../kernel/runner/piece-repo.js";
import type { LlmAnswer, StageProviders } from "../../kernel/runner/providers.js";
import type { EntryMode, ProviderChoice, RunConfig } from "../admission/model.js";
import { projectById } from "../admission/repo.js";
import type { EntryCategory } from "../library/model.js";
import { outputPath } from "../storage/layout.js";
import { outputsOf } from "../storage/repo.js";
import { storeText } from "../storage/staging.js";
import type { ArticleBrief, SentMessages } from "./continuation.js";
import { writeArticle } from "./continuation.js";
import { storeArticleText } from "./store.js";

// `logic/07`: one streamed call writes the article from the research notes and the
// rendered prompt, its end matter is cut into files of its own, and the picked intro and
// outro get their text last, since an LLM-mode entry is written from the article (§Q97).

export interface ArticleDeps {
  readonly db: DatabaseSync;
  readonly paths: Paths;
  readonly ids: Ids;
  readonly clock: Clock;
  readonly log: Log;
}

// What the article stage leaves for `logic/08` to narrate: one `segment` piece per picked
// entry, whether its text was written by the model or rendered from the entry body.
export interface SegmentText {
  readonly category: EntryCategory;
  readonly name: string;
  readonly mode: EntryMode;
  readonly text: string;
}

const categories: readonly EntryCategory[] = ["intro", "outro"];

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
    // Admission refuses a run whose article is Generate without both (`logic/04`), so
    // reaching here is a bug in admission rather than something the user did.
    throw new Error("the run has no LLM provider or no rendered article prompt");
  }
  const notes = researchNotes(deps, projectId);
  const brief: ArticleBrief = { articlePrompt, ...(notes === undefined ? {} : { notes }) };

  const written = await writeArticle(providers, choice, brief, (text: string): void => {
    // Step 2 and `logic/01` §Q6: the page shows the article as it is written. The idle
    // timeout is restarted by the wrapper on the same events, not here.
    // ceiling: §Q60 discards the partial text of a failed attempt, but the deltas already
    // sent cannot be unsent, so a retry mid-stream leaves the page appending the second
    // telling under the first. What the project keeps is still the successful attempt's
    // text alone; the upgrade is an event telling the page to start the article again.
    context.emit({ type: "article.delta", projectId, text });
  });

  // Step 4: the markdown exactly as the model produced it, and the plain-text narration
  // source. §Q63 keeps the end matter out of the narration and beside the article instead.
  const store = { projectId, stageKind: "article" } as const;
  storeText(deps, { ...store, role: "article_md", text: written.markdown });
  const narration = storeArticleText(deps, { projectId, markdown: written.markdown });

  const sent = [...written.sent];
  for (const [index, category] of categories.entries()) {
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
    }
  }

  // §Q57: the exact messages sent, the continuations and the entry calls among them.
  storeText(deps, { ...store, role: "instructions", text: instructionsText(sent) });
  deps.log.write("info", "article.done", {
    projectId,
    stage: "article",
    detail: `${String(written.sent.length - 1)} continuations, ${String(narration.length)} characters to narrate`,
  });
}

// Step 5: "for each picked entry in LLM mode, one call with the filled entry as
// instruction plus the title, keyword values, and the plain-text article ... Text-mode
// entries are stored as rendered per scenario 03 with no call" (§Q97, §Q98).
async function writeSegment(
  providers: StageProviders,
  choice: ProviderChoice,
  config: RunConfig,
  category: EntryCategory,
  article: string,
  sent: SentMessages[],
): Promise<SegmentText | undefined> {
  const picked = config[category];
  if (picked === undefined) {
    return undefined;
  }
  const body = config.rendered[category];
  if (body === undefined) {
    throw new Error(`the run has no rendered ${category} text`);
  }
  const common = { category, name: picked.name, mode: picked.mode };
  if (picked.mode === "text") {
    return { ...common, text: body };
  }
  const messages = segmentMessages(body, config, article);
  sent.push({ label: label(category), messages });
  const answer = await providers.llm({
    provider: choice.provider,
    model: choice.model,
    messages,
    // §Q96 and §Q61: an entry that answers with nothing is a failed attempt like any
    // other, and the wrapper is what retries it.
    check: (given: LlmAnswer): string | undefined =>
      given.text.trim() === "" ? `the ${category} answered with nothing` : undefined,
  });
  return { ...common, text: answer.text.trim() };
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

// The segment rows are keyed by `idx` within the stage, so a stage that runs again after
// a failure replaces what it wrote rather than colliding with it.
function keepSegment(
  deps: ArticleDeps,
  context: StageContext,
  segment: SegmentText,
  idx: number,
): void {
  const payload = JSON.stringify(segment);
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
    return;
  }
  setPiece(deps.db, existing.id, "done", payload);
}

// Research writes its notes as an output of its own (`logic/06` step 4), and a provided
// research stage stores the pasted text the same way, so one lookup covers both. No row
// means research was Off or skipped, and the article is written from the prompt alone.
function researchNotes(deps: ArticleDeps, projectId: string): string | undefined {
  const notes = outputsOf(deps.db, projectId).find((output) => output.role === "notes");
  if (notes === undefined) {
    return undefined;
  }
  return readFileSync(outputPath(deps.paths, projectId, notes.path), "utf8");
}

function instructionsText(sent: readonly SentMessages[]): string {
  const parts = sent.map(
    (one) =>
      `=== ${one.label} ===\n\n${one.messages.map((message) => message.content).join("\n\n")}`,
  );
  return `${parts.join("\n\n")}\n`;
}

function label(category: EntryCategory): string {
  return category === "intro" ? "Intro" : "Outro";
}
