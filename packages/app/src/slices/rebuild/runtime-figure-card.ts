import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import type { StageContext } from "../../kernel/runner/index.js";
import type { StageRunResult } from "../../kernel/runner/work.js";
import { captionFont, captionFontDeps } from "../fonts/coverage.js";
import { describedKinds } from "../narration/blocks.js";
import type { PreparedOutput } from "../revisions/publication-model.js";
import { allocateAsset, discardPreparedAssets, sealAsset } from "../storage/assets.js";
import { projectDir } from "../storage/layout.js";
import { defaultCardStyle, renderCard } from "../video/figure-card.js";
import type { LocalExecutionDeps } from "./runtime-local.js";
import { articlePicture } from "./runtime-pictures.js";
import { executionView } from "./runtime-plan.js";
import { preparedResult, publishResult } from "./runtime-publication.js";
import type { WorkPiece } from "./work-records.js";

// A `figure:card:<n>` step: the block drawn as a card in each frame the project needs (the
// video's, and upright for the Shorts of a 16:9 video), with the ffmpeg Slopify ships.

const values = z.object({
  kind: z.enum(describedKinds),
  index: z.number().int().positive(),
  source: z.string(),
  section: z.string().nullable(),
  image: z.string().nullable(),
  formats: z.array(z.enum(["16:9", "9:16"])).min(1),
  fontId: z.string(),
  color: z.string().nullable(),
  language: z.string(),
});

const frames = { "16:9": [1920, 1080], "9:16": [1080, 1920] } as const;

export async function executeFigureCard(
  deps: LocalExecutionDeps,
  context: StageContext,
  piece: WorkPiece,
): Promise<StageRunResult> {
  if (piece.input.kind !== "local")
    throw new Error(
      "Slopify hit an internal error (a figure card step was set up wrongly). Try again; if it happens again, use Download diagnostics in Settings and report it.",
    );
  const card = values.parse(piece.input.values);
  const view = executionView(deps, context.work.projectId, context.work.revisionId);
  // The article's own picture for a figure, when the project has it as an upload.
  const picture =
    card.kind === "figure" && view !== undefined
      ? articlePicture(deps, view, card.image ?? undefined)
      : undefined;
  const font = await captionFont(
    captionFontDeps(deps.paths),
    card.fontId,
    card.language === "en" ? undefined : card.language,
  );
  const workspace = mkdtempSync(join(projectDir(deps.paths, context.work.projectId), "card-"));
  const pending = card.formats.map(() =>
    allocateAsset(deps, context.work.projectId, `card-${String(card.index)}.png`),
  );
  const prepared: PreparedOutput[] = [];
  try {
    mkdirSync(join(workspace, "fonts"), { mode: 0o700 });
    copyFileSync(font.path, join(workspace, "fonts", `card${font.extension}`));
    for (const [at, format] of card.formats.entries()) {
      const target = pending[at];
      if (target === undefined) continue;
      const [width, height] = frames[format];
      await renderCard(
        {
          bin: deps.ffmpeg,
          input: {
            kind: card.kind,
            source: card.source,
            section: card.section,
            width,
            height,
            style: {
              ...defaultCardStyle,
              font: font.assName,
              ...(card.color === null ? {} : { accent: card.color }),
            },
            picture: picture !== undefined,
          },
          cwd: workspace,
          output: target.absolutePath,
          picture,
          signal: context.signal,
          log: deps.log,
        },
        (ass) => writeFileSync(join(workspace, "card.ass"), ass, { mode: 0o600 }),
      );
      context.signal.throwIfAborted();
      const asset = sealAsset(deps, target);
      const output = preparedResult(deps, context, piece, "figure_card", asset, null, {
        index: card.index,
        format,
      });
      prepared.push({ ...output, slot: `${piece.key}:${format}` });
    }
    await publishResult(deps, context, piece, prepared, {
      index: card.index,
      kind: card.kind,
      picture: picture !== undefined,
    });
    return "done";
  } finally {
    rmSync(workspace, { recursive: true, force: true });
    discardPreparedAssets(deps, [...pending, ...prepared.map((one) => one.asset)]);
  }
}
