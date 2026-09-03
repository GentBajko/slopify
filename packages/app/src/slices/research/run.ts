import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import type { Clock } from "../../kernel/clock.js";
import { transact } from "../../kernel/db/tx.js";
import type { Ids } from "../../kernel/ids.js";
import type { Log } from "../../kernel/log.js";
import type { Paths } from "../../kernel/paths.js";
import type { Message } from "../../kernel/ports/llm.js";
import { isProviderError } from "../../kernel/ports/model.js";
import type { StageContext } from "../../kernel/runner/index.js";
import type { StagePiece } from "../../kernel/runner/piece-repo.js";
import { insertPiece, piecesOf, setPiece } from "../../kernel/runner/piece-repo.js";
import type { LlmAnswer, StageProviders } from "../../kernel/runner/providers.js";
import type { ProviderChoice } from "../admission/model.js";
import { projectById, setStageProgress } from "../admission/repo.js";
import { storeText } from "../storage/staging.js";
import type { ResearchBrief } from "./planner.js";
import { chaptersFrom, plannerMessages, subAgentMessages } from "./planner.js";
import type { Finding } from "./synthesis.js";
import { sourcedAnswer, synthesisMessages } from "./synthesis.js";

// `logic/06`: the planner call names the chapters, one sub-agent researches each of them
// on the web in parallel, and an editorial call writes the notes from what they found.
// Every call goes through the wrapped `providers.llm`, so the retry policy of `logic/01`
// step 6 covers all three and nothing here waits or counts attempts.

export interface ResearchDeps {
  readonly db: DatabaseSync;
  readonly paths: Paths;
  readonly ids: Ids;
  readonly clock: Clock;
  readonly log: Log;
}

// §Q47, verbatim: "the stage fails immediately with 'web research unsupported by this
// model'; no fallback to model knowledge".
export const webResearchUnsupported = "web research unsupported by this model";

// What a chapter piece carries between runs: its title, and its notes once a sub-agent
// has answered. That is the whole of the resume of §Q54.
const chapterPayload = z.object({ title: z.string(), notes: z.string().optional() });

export async function runResearch(
  deps: ResearchDeps,
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
    // Admission refuses a run whose research is Generate without both (`logic/04`), so
    // reaching here is a bug in admission rather than something the user did.
    throw new Error("the run has no LLM provider or no rendered article prompt");
  }
  const brief: ResearchBrief = { articlePrompt, values: project.config.values };

  try {
    await research(deps, context, providers, choice, brief);
  } catch (error) {
    // The adapter says the model cannot ground on the web and the wrapper has already
    // made that terminal; this is where it becomes the sentence the user reads (§Q47).
    if (isProviderError(error) && error.fault.kind === "unsupported") {
      throw new Error(webResearchUnsupported);
    }
    throw error;
  }
}

async function research(
  deps: ResearchDeps,
  context: StageContext,
  providers: StageProviders,
  choice: ProviderChoice,
  brief: ResearchBrief,
): Promise<void> {
  const chapters = await plan(deps, context, providers, choice, brief);
  const findings = await researchChapters(deps, context, providers, choice, brief, chapters);

  const answer = await providers.llm({
    provider: choice.provider,
    model: choice.model,
    messages: synthesisMessages(brief, findings),
    check: (given: LlmAnswer): string | undefined => sourcedAnswer("the synthesis", given.text),
  });

  const { projectId } = context.stage;
  // Step 4: the notes and every instruction sent are stored on the project. Each
  // sub-agent's own output stays on its chapter row, which is where the resume reads it.
  storeText(deps, { projectId, stageKind: "research", role: "notes", text: answer.text.trim() });
  storeText(deps, {
    projectId,
    stageKind: "research",
    role: "instructions",
    text: instructionsText(brief, findings),
  });
  deps.log.write("info", "research.done", {
    projectId,
    stage: "research",
    detail: `${String(findings.length)} chapters researched`,
  });
}

// The chapter list, planned once and kept. A retry after a failure finds the rows the
// first run wrote and does not ask again (§Q54).
async function plan(
  deps: ResearchDeps,
  context: StageContext,
  providers: StageProviders,
  choice: ProviderChoice,
  brief: ResearchBrief,
): Promise<readonly StagePiece[]> {
  const existing = piecesOf(deps.db, context.stage.id, "chapter");
  if (existing.length > 0) {
    return existing;
  }
  const answer = await providers.llm({
    provider: choice.provider,
    model: choice.model,
    messages: plannerMessages(brief),
    // §Q50: an empty answer, or one with no chapter in it, is a failed attempt.
    check: (given: LlmAnswer): string | undefined =>
      chaptersFrom(given.text).length === 0 ? "the planner named no chapters" : undefined,
  });
  // §Q53: no cap on the count. The list is the prompt's own section guide as often as
  // not, and capping it would silently drop a section the article asks for.
  const planned: StagePiece[] = chaptersFrom(answer.text).map((title, index) => ({
    id: deps.ids.next(),
    stageId: context.stage.id,
    kind: "chapter",
    idx: index + 1,
    state: "pending",
    payload: JSON.stringify({ title }),
  }));
  transact(deps.db, () => {
    for (const piece of planned) {
      insertPiece(deps.db, piece);
    }
  });
  return planned;
}

// §Q53: "one per chapter, all in parallel". §Q54: a chapter a previous run finished is
// not researched again, and one that fails fails the whole stage while its siblings
// finish and keep their output for the next resume.
async function researchChapters(
  deps: ResearchDeps,
  context: StageContext,
  providers: StageProviders,
  choice: ProviderChoice,
  brief: ResearchBrief,
  chapters: readonly StagePiece[],
): Promise<readonly Finding[]> {
  const outline = chapters.map((piece) => payloadOf(piece).title);
  const total = chapters.length;
  let done = chapters.filter((piece) => payloadOf(piece).notes !== undefined).length;
  report(deps, context, done, total);

  const outcomes = await Promise.all(
    chapters.map(async (piece): Promise<Outcome> => {
      const kept = payloadOf(piece);
      if (kept.notes !== undefined) {
        return { ok: true, finding: { title: kept.title, notes: kept.notes } };
      }
      setPiece(deps.db, piece.id, "running", piece.payload);
      try {
        const answer = await providers.forPiece(piece.id).llm({
          provider: choice.provider,
          model: choice.model,
          messages: subAgentMessages(brief, kept.title, outline),
          // §Q47: grounding is asked for explicitly, so a model without it says so
          // instead of answering from what it already knows.
          webSearch: true,
          check: (given: LlmAnswer): string | undefined =>
            sourcedAnswer(`the researcher on "${kept.title}"`, given.text),
        });
        const notes = answer.text.trim();
        setPiece(deps.db, piece.id, "done", JSON.stringify({ title: kept.title, notes }));
        done += 1;
        report(deps, context, done, total);
        return { ok: true, finding: { title: kept.title, notes } };
      } catch (error) {
        // A cancel is not this chapter failing: `logic/13` §Q112 counts an aborted call
        // as nothing, and the resume runs a `pending` chapter exactly as a failed one.
        setPiece(deps.db, piece.id, context.signal.aborted ? "pending" : "failed", piece.payload);
        return { ok: false, error };
      }
    }),
  );

  const findings: Finding[] = [];
  for (const outcome of outcomes) {
    if (!outcome.ok) {
      throw outcome.error;
    }
    findings.push(outcome.finding);
  }
  return findings;
}

type Outcome =
  | { readonly ok: true; readonly finding: Finding }
  | { readonly ok: false; readonly error: unknown };

// Step 5: "k of N chapters researched". Written as well as emitted, so a page opened
// mid-stage reads the count off the row rather than waiting for the next chapter.
function report(deps: ResearchDeps, context: StageContext, done: number, total: number): void {
  setStageProgress(deps.db, context.stage.id, done, total);
  context.emit({
    type: "stage.progress",
    projectId: context.stage.projectId,
    stage: "research",
    current: done,
    total,
  });
}

// §Q51: every instruction sent is stored on the project. All three are pure functions of
// the brief and the findings, so a resumed run reproduces the ones it did not send.
function instructionsText(brief: ResearchBrief, findings: readonly Finding[]): string {
  const outline = findings.map((finding) => finding.title);
  const parts = [section("Planner", plannerMessages(brief))];
  for (const title of outline) {
    parts.push(section(`Sub-agent: ${title}`, subAgentMessages(brief, title, outline)));
  }
  parts.push(section("Synthesis", synthesisMessages(brief, findings)));
  return `${parts.join("\n\n")}\n`;
}

function section(label: string, messages: readonly Message[]): string {
  return `=== ${label} ===\n\n${messages.map((message) => message.content).join("\n\n")}`;
}

function payloadOf(piece: StagePiece): z.infer<typeof chapterPayload> {
  if (piece.payload === null) {
    throw new Error(`chapter ${piece.id} has no payload`);
  }
  return chapterPayload.parse(JSON.parse(piece.payload));
}
