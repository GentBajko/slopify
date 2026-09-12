import { z } from "zod";
import { fingerprint } from "../../kernel/runner/work.js";
import type { ManifestPiece } from "../revisions/model.js";
import type { ResolvedWorkRecipe } from "./recipe-model.js";

export function matchingNarrationPiece(
  recipe: ResolvedWorkRecipe,
  pieces: readonly ManifestPiece[],
  available: ReadonlySet<string>,
): ManifestPiece | undefined {
  if (recipe.input.kind !== "tts") return undefined;
  const noRegeneration = recipe.fingerprint === fingerprint([recipe.requestFingerprint, null]);
  return pieces.find((piece) => {
    if (
      piece.stageKind !== "audio" ||
      piece.piece.state !== "done" ||
      piece.assetId === null ||
      !available.has(piece.assetId)
    )
      return false;
    const parsed = z
      .object({ requestFingerprint: z.string() })
      .safeParse(JSON.parse(piece.piece.payload ?? "null"));
    return (
      parsed.success &&
      parsed.data.requestFingerprint === recipe.requestFingerprint &&
      (noRegeneration || piece.fingerprint === recipe.fingerprint)
    );
  });
}
