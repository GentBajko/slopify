import { readFileSync } from "node:fs";
import { z } from "zod";
import { thinkingModes } from "../../kernel/ports/llm.js";
import type { StageContext } from "../../kernel/runner/index.js";
import type { StageProviders } from "../../kernel/runner/providers.js";
import type { StageRunResult } from "../../kernel/runner/work.js";
import { plainText } from "../article/plain.js";
import {
  defaultReviewPrompts,
  narrationItemKey,
  type ReviewStage,
  reviewStages,
} from "../reviews/model.js";
import { nextAttempt, reviewOutcome } from "../reviews/outcome.js";
import { latestVerdict, saveVerdict } from "../reviews/repo.js";
import { parseVerdict, type ReviewMaterial, reviewMessages } from "../reviews/verdict.js";
import type { RevisionOutputView } from "../revisions/model.js";
import { pickedShortsOf } from "../shorts/clips.js";
import { outputPath } from "../storage/layout.js";
import type { ExportExecutionDeps } from "./runtime-export.js";
import {
  type ExportSnapshot,
  exportSnapshot,
  revisionTranscript,
} from "./runtime-export-inputs.js";
import { savedCatalogue } from "./runtime-plan.js";
import { publishResult } from "./runtime-publication.js";
import { wordsSchema } from "./runtime-subtitles.js";
import type { WorkPiece } from "./work-records.js";

// What `recipe-reviews.ts` saves in the step's values, by position.
const valuesSchema = z.tuple([
  z.enum(reviewStages),
  z.string(),
  z.array(z.tuple([z.string(), z.unknown()])),
  z.string(),
  z.string(),
  z.string().nullable(),
  z.string(),
  z.enum(["flag", "redo"]),
  z.number().int().nonnegative(),
]);
// ceiling: enough of a long article or research for a reviewer to judge it, and well inside
// every supported model's context.
const textMax = 60_000;

// Asks the reviewer about one finished item and saves its verdict. A malformed answer is a
// failed attempt the provider wrapper asks again; a verdict that sends the item back is
// saved as a pending redo, which `review-redo.ts` starts once this step has finished, and
// until then the item's dependents are held (`reviewHold`).
export async function executeReviewRecipe(
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
  const values =
    input.kind === "local" && input.operation === "review-v1"
      ? valuesSchema.safeParse(input.values)
      : undefined;
  if (values === undefined || !values.success)
    throw new Error(
      "Slopify hit an internal error (a review step was set up wrongly). Try again; if it happens again, use Download diagnostics in Settings and report it.",
    );
  const [stage, itemKey, , provider, model, thinking, prompt, mode, retries] = values.data;
  const snapshot = exportSnapshot(deps, context, piece);
  const material = reviewMaterial(deps, context, snapshot, stage, itemKey, prompt);
  const previous = latestVerdict(deps.db, context.work.projectId, itemKey);
  const attempt = nextAttempt(previous, material.itemFingerprint);
  const row = deps.db
    .prepare("SELECT recipe_context FROM revision_work WHERE id=?")
    .get(context.work.workId);
  const catalogued = savedCatalogue(row?.recipe_context).llm.find(
    (one) => one.provider === provider && one.id === model,
  );
  const level = thinking === null ? undefined : z.enum(thinkingModes).parse(thinking);
  if (!context.maySubmit(piece.id)) return "held";
  const answer = await providers.forPiece(piece.id).llm({
    provider,
    model,
    ...(level === undefined ? {} : { thinking: level }),
    thinkingConfig: level === undefined ? null : (catalogued?.llm.thinking?.[level] ?? null),
    messages: reviewMessages(material.request),
    webSearch: false,
    ...(material.images.length === 0 ? {} : { images: material.images }),
    previewLabel: piece.key,
    check: (value) => {
      const parsed = parseVerdict(value.text);
      return parsed.ok ? undefined : parsed.reason;
    },
  });
  if (!answer.ok) return "held";
  const verdict = parseVerdict(answer.value.text);
  if (!verdict.ok) throw new Error(verdict.reason);
  const outcome = reviewOutcome({ passed: verdict.value.passed, mode, attempt, retries });
  const saved = saveVerdict(deps.db, {
    id: deps.ids.next(),
    projectId: context.work.projectId,
    revisionId: context.work.revisionId,
    itemKey,
    stage,
    itemFingerprint: material.itemFingerprint,
    reviewFingerprint: piece.fingerprint,
    passed: verdict.value.passed,
    reasons: verdict.value.reasons,
    outcome,
    attempt,
    action: null,
    actionAt: null,
    redoState: outcome === "redo" ? "pending" : null,
    redoError: null,
    createdAt: deps.clock.now().toISOString(),
  });
  await publishResult(deps, context, piece, [], {
    verdictId: saved.id,
    passed: saved.passed,
    reasons: saved.reasons,
    outcome: saved.outcome,
    attempt: saved.attempt,
  });
  // Kept and flagged: nothing more happens to the item until someone decides.
  if (saved.outcome === "flagged")
    context.emit({
      type: "review.flagged",
      projectId: context.work.projectId,
      verdictId: saved.id,
      stage: saved.stage,
      itemKey: saved.itemKey,
      ...(saved.reasons[0] === undefined ? {} : { reason: saved.reasons[0] }),
    });
  deps.count?.("stage.completed", {
    provider,
    model,
    tokensIn: answer.value.usage?.inputTokens ?? 0,
    tokensOut: answer.value.usage?.outputTokens ?? 0,
  });
  return "done";
}

// What the voice was asked to say, segment by segment, as the word timing matched it: the intro
// and outro, and the prepared or hand-edited spoken text rather than the article as written.
// Falls back to the article when those texts can't be read.
function spokenText(deps: ExportExecutionDeps, snapshot: ExportSnapshot): string {
  const present = (["intro", "body", "outro"] as const).filter((kind) =>
    snapshot.view.outputs.some(
      (one) =>
        one.selected &&
        one.available &&
        one.state === "ready" &&
        one.output.role === `audio_${kind}`,
    ),
  );
  try {
    const text = present.map((kind) => revisionTranscript(deps, snapshot, kind)).join("\n\n");
    if (text.trim() !== "") return text;
  } catch {
    // The article below is still a fair reference.
  }
  return plainText(snapshot.view.articleMarkdown ?? "");
}

interface Material {
  readonly request: ReviewMaterial;
  readonly images: readonly { readonly path: string; readonly name: string }[];
  readonly itemFingerprint: string;
}

function reviewMaterial(
  deps: ExportExecutionDeps,
  context: StageContext,
  snapshot: ExportSnapshot,
  stage: ReviewStage,
  itemKey: string,
  prompt: string,
): Material {
  const { view } = snapshot;
  const recipes = snapshot.plan.recipes;
  const config = view.revision.config;
  const output = (workKey: string, role?: string): RevisionOutputView | undefined =>
    view.outputs.find(
      (row) =>
        row.workKey === workKey &&
        row.selected &&
        row.available &&
        row.state === "ready" &&
        (role === undefined || row.output.role === role),
    );
  const path = (row: RevisionOutputView) =>
    outputPath(deps.paths, context.work.projectId, row.output.path);
  const text = (row: RevisionOutputView) => clip(readFileSync(path(row), "utf8"));
  const missing = (what: string, fix: string) =>
    new Error(
      `The ${what} this review looks at is missing, so it could not be reviewed. ${fix}, then use Try again.`,
    );
  const request = (
    sections: ReviewMaterial["sections"],
    images: readonly string[] = [],
  ): ReviewMaterial => ({
    stage,
    instruction: prompt.trim() === "" ? defaultReviewPrompts[stage] : prompt,
    sections,
    images,
  });
  switch (stage) {
    case "article": {
      const article = output(itemKey, "article_md");
      if (article === undefined)
        throw missing("article", "Use More → Write the article again in the Article section");
      const notes = output("research:notes", "notes");
      const research =
        notes !== undefined ? text(notes) : clip(config.provided.research?.trim() ?? "");
      return {
        request: request([
          {
            label: "Article prompt the article was written from",
            text: clip(config.rendered.article ?? ""),
          },
          ...(research === "" ? [] : [{ label: "Research notes", text: research }]),
          { label: "Article", text: text(article) },
        ]),
        images: [],
        itemFingerprint: article.fingerprint,
      };
    }
    case "images":
    case "thumbnail": {
      const image = output(itemKey);
      if (image === undefined)
        throw missing(
          stage === "images" ? "image" : "thumbnail",
          stage === "images"
            ? "Use More → make it again in its section on Images"
            : "Use More → make it again in its section on Thumbnail",
        );
      const recipe = recipes.find((one) => one.key === itemKey);
      const brief = recipe?.input.kind === "image" ? recipe.input.prompt : "";
      const reference = stage === "images" ? output("reference:image") : undefined;
      return {
        request: request(
          [
            ...(stage === "thumbnail" ? [{ label: "Video title", text: config.title }] : []),
            ...(brief === "" ? [] : [{ label: "Brief the image was drawn from", text: brief }]),
          ],
          [
            stage === "images" ? "the image to review" : "the thumbnail to review",
            ...(reference === undefined ? [] : ["the establishing image it must match"]),
          ],
        ),
        images: [
          {
            path: path(image),
            name: stage === "images" ? "the image to review" : "the thumbnail to review",
          },
          ...(reference === undefined
            ? []
            : [{ path: path(reference), name: "the establishing image it must match" }]),
        ],
        itemFingerprint: image.fingerprint,
      };
    }
    case "narration": {
      const timing = output("subtitles:timing", "subtitle_words");
      if (timing === undefined || itemKey !== narrationItemKey)
        throw missing(
          "narration's word timing",
          "Use More → Render the video again in the Video section",
        );
      const { words, omissions } = wordsSchema.parse(
        JSON.parse(readFileSync(path(timing), "utf8")),
      );
      const unsure = words.filter((word) => (word.confidence ?? 1) < 0.3).length;
      return {
        request: request([
          {
            label: "Text the narration was read from",
            text: clip(spokenText(deps, snapshot)),
          },
          { label: "What the timing heard", text: clip(words.map((word) => word.text).join(" ")) },
          {
            label: "Stretches of text the timing could not hear",
            text:
              omissions.length === 0
                ? "None."
                : omissions.map((gap) => `At ${gap.start.toFixed(1)} s: ${gap.text}`).join("\n"),
          },
          {
            label: "Words heard with low confidence",
            text: `${String(unsure)} of ${String(words.length)}.`,
          },
        ]),
        images: [],
        itemFingerprint: timing.fingerprint,
      };
    }
    case "shorts": {
      const render = output(`${itemKey}:render`);
      if (render === undefined)
        throw missing("short", "Use Make this short again in Edit project → Shorts");
      const number = Number(itemKey.slice("shorts:".length));
      const pick = view.pieces.find(
        (row) => row.key === "shorts:pick" && row.selected && row.piece.state === "done",
      );
      const title =
        pickedShortsOf(pick?.piece.payload)?.shorts.find((clip) => clip.number === number)?.title ??
        "";
      const stills = view.outputs
        .filter(
          (row) =>
            row.workKey.startsWith(`${itemKey}:image:`) &&
            row.selected &&
            row.available &&
            row.state === "ready",
        )
        .slice(0, 6);
      if (stills.length === 0)
        throw missing("short's images", "Use Make this short again in Edit project → Shorts");
      const names = stills.map((_, index) => `image ${String(index + 1)} of the short`);
      return {
        request: request([{ label: "Title of the short", text: title }], names),
        images: stills.map((row, index) => ({
          path: path(row),
          name: names[index] ?? "an image of the short",
        })),
        itemFingerprint: render.fingerprint,
      };
    }
  }
}

function clip(value: string): string {
  return value.length <= textMax ? value : `${value.slice(0, textMax)}\n[... cut for length]`;
}
