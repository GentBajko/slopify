import { z } from "zod";
import { transact } from "../../kernel/db/tx.js";
import type { StageContext } from "../../kernel/runner/index.js";
import type { LlmAnswer, StageProviders } from "../../kernel/runner/providers.js";
import type { AttemptResult } from "../../kernel/runner/work.js";
import { continuationLimit, continuationMessages } from "../article/continuation.js";
import type { RevisionDeps } from "../revisions/model.js";
import { currentRevisionId, revisionById } from "../revisions/repo.js";
import { recipe } from "./recipe-model.js";
import { retainPartialArticle } from "./runtime-publication.js";
import { insertWorkPiece, type WorkPiece, workPieces } from "./work-records.js";

const answerSchema = z.object({
  text: z.string(),
  finishReason: z.string().nullable(),
  usage: z.object({ inputTokens: z.number(), outputTokens: z.number() }).nullable(),
});

export async function executeArticleRequests(
  deps: RevisionDeps,
  context: StageContext,
  providers: StageProviders,
  initial: WorkPiece,
): Promise<AttemptResult<LlmAnswer>> {
  if (initial.input.kind !== "llm")
    throw new Error("Article generation needs a pinned LLM request.");
  let piece = initial;
  let text = "";
  let inputTokens = 0;
  let outputTokens = 0;
  for (let part = 0; part <= continuationLimit; part += 1) {
    if (piece.input.kind !== "llm")
      throw new Error("An article continuation must contain an exact LLM request.");
    const saved = deps.db
      .prepare("SELECT result_json FROM revision_work_pieces WHERE id=? AND work_id=?")
      .get(piece.id, context.work.workId);
    let answer: LlmAnswer;
    if (typeof saved?.result_json === "string")
      answer = answerSchema.parse(JSON.parse(saved.result_json));
    else {
      const input = piece.input;
      const result = await providers.forPiece(piece.id).llm(
        {
          provider: input.provider,
          model: input.model,
          messages: input.messages,
          documents: input.documents,
          thinkingConfig: input.thinkingConfig,
          ...(input.thinking === null ? {} : { thinking: input.thinking }),
          webSearch: input.webSearch,
          previewLabel: part === 0 ? "Article" : `Continuation ${part}`,
          check: (value) =>
            value.text.trim() === ""
              ? "The article answered with nothing."
              : part === continuationLimit && value.finishReason === "length"
                ? `The article was still unfinished after ${continuationLimit} continuations.`
                : undefined,
        },
        (event) => {
          if (event.type === "delta")
            context.emit({
              type: "article.delta",
              projectId: context.work.projectId,
              workPieceId: piece.id,
              text: event.text,
            });
        },
      );
      if (!result.ok) return result;
      answer = result.value;
      deps.db
        .prepare(
          "UPDATE revision_work_pieces SET result_json=? WHERE id=? AND work_id=? AND result_json IS NULL",
        )
        .run(JSON.stringify(answer), piece.id, context.work.workId);
    }
    text += answer.text;
    inputTokens += answer.usage?.inputTokens ?? 0;
    outputTokens += answer.usage?.outputTokens ?? 0;
    if (answer.finishReason !== "length")
      return {
        ok: true,
        value: { text, finishReason: answer.finishReason, usage: { inputTokens, outputTokens } },
      };
    retainPartialArticle(deps, context, piece, text);
    const next = continuationPiece(deps, context, initial, part + 1, text);
    if (next === undefined) return { ok: false, reason: "held" };
    piece = next;
  }
  throw new Error("The article exceeded its continuation limit.");
}

function continuationPiece(
  deps: RevisionDeps,
  context: StageContext,
  initial: WorkPiece,
  part: number,
  text: string,
): WorkPiece | undefined {
  return transact(deps.db, () => {
    const key = `article:continuation:${part}`;
    const existing = workPieces(deps.db, context.work.workId).find((piece) => piece.key === key);
    if (existing !== undefined) return existing;
    if (!context.maySubmit(initial.id) || initial.input.kind !== "llm") return undefined;
    const revision = revisionById(deps.db, context.work.projectId, context.work.revisionId);
    const head = currentRevisionId(deps.db, context.work.projectId);
    if (revision === undefined || head === undefined) return undefined;
    const anchor = deps.db
      .prepare(
        "SELECT logical_key,desired_fingerprint,work_key,fingerprint FROM revision_work_reservations WHERE revision_id=? AND work_id=? AND piece_id=?",
      )
      .get(head, context.work.workId, initial.id);
    if (anchor === undefined) return undefined;
    const value = recipe(
      { content: revision.content },
      key,
      "article",
      {
        ...initial.input,
        messages: continuationMessages(initial.input.messages, text),
      },
      [initial.key],
      { tokenKey: initial.key },
    );
    const piece: WorkPiece = {
      id: deps.ids.next(),
      workId: context.work.workId,
      key,
      fingerprint: value.fingerprint,
      requestFingerprint: value.requestFingerprint,
      logicalFingerprint: value.logicalFingerprint,
      input: value.input,
      continuation: null,
      generationToken: initial.generationToken,
      state: "pending",
      dispatchState: "allowed",
      submittedAt: null,
    };
    insertWorkPiece(deps.db, piece);
    deps.db
      .prepare(
        "INSERT INTO revision_work_reservations(project_id,revision_id,work_key,work_id,piece_id,fingerprint,logical_key,desired_fingerprint) VALUES (?,?,?,?,?,?,?,?)",
      )
      .run(
        context.work.projectId,
        head,
        key,
        context.work.workId,
        piece.id,
        piece.fingerprint,
        z.string().parse(anchor.logical_key ?? anchor.work_key),
        z.string().parse(anchor.desired_fingerprint ?? anchor.fingerprint),
      );
    return piece;
  });
}
