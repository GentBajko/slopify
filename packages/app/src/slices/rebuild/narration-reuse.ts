import { z } from "zod";
import { fingerprint } from "../../kernel/runner/work.js";
import type { ManifestPiece } from "../revisions/model.js";
import type { ResolvedWorkRecipe } from "./recipe-model.js";

// The request a narration piece was voiced for, read from its payload once per piece: the plan
// asks it of every retained piece for every narration step it derives.
const requests = new WeakMap<ManifestPiece["piece"], string | null>();
const requestPayload = z.object({ requestFingerprint: z.string() });
function requestOf(piece: ManifestPiece["piece"]): string | null {
  const known = requests.get(piece);
  if (known !== undefined) return known;
  const parsed = requestPayload.safeParse(JSON.parse(piece.payload ?? "null"));
  const request = parsed.success ? parsed.data.requestFingerprint : null;
  requests.set(piece, request);
  return request;
}

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
    const request = requestOf(piece.piece);
    return (
      request !== null &&
      request === recipe.requestFingerprint &&
      (noRegeneration || piece.fingerprint === recipe.fingerprint)
    );
  });
}
