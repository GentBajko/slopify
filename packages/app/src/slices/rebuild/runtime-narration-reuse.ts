import { z } from "zod";
import {
  insertManifestOutput,
  insertManifestPiece,
  selectOutputRecord,
  selectPieceRecord,
} from "../revisions/manifest-repo.js";
import type { RevisionDeps, RevisionView } from "../revisions/model.js";
import { retainedNarrationPieces } from "./narration-history.js";
import { matchingNarrationPiece } from "./narration-reuse.js";
import type { ResolvedWorkRecipe } from "./recipe-model.js";

export function bindNarrationReuse(
  deps: Pick<RevisionDeps, "db" | "ids" | "paths">,
  view: RevisionView,
  recipe: ResolvedWorkRecipe,
  ordinal: number,
): void {
  if (recipe.input.kind === "local" && recipe.input.operation === "concat-narration") {
    const completed = view.pieces.find(
      (one) =>
        one.available &&
        one.piece.state === "done" &&
        one.key === recipe.key &&
        one.fingerprint === recipe.fingerprint,
    );
    const output =
      completed === undefined
        ? undefined
        : view.outputs.find(
            (one) =>
              one.available && one.assetId === completed.assetId && one.workKey === recipe.key,
          );
    if (
      output !== undefined &&
      !(
        output.selected &&
        output.state === "ready" &&
        output.fingerprint === recipe.logicalFingerprint
      )
    ) {
      const id = deps.ids.next();
      insertManifestOutput(
        deps.db,
        view.revision,
        {
          slot: output.slot,
          workKey: output.workKey,
          assetId: output.assetId,
          output: output.output,
          fingerprint: recipe.logicalFingerprint,
          state: "ready",
        },
        id,
      );
      selectOutputRecord(deps.db, view.revision.id, output.slot, id);
    }
    return;
  }
  if (recipe.input.kind === "provided" && /^audio:(body:.+|intro|outro):[0-9]+$/.test(recipe.key)) {
    if (
      view.pieces.some(
        (one) =>
          one.selected &&
          one.available &&
          one.key === recipe.key &&
          one.fingerprint === recipe.fingerprint &&
          one.piece.state === "done" &&
          one.piece.idx === ordinal,
      )
    )
      return;
    const asset = deps.db
      .prepare("SELECT path FROM project_assets WHERE id=? AND project_id=?")
      .get(recipe.input.assetId, view.revision.projectId);
    if (asset === undefined) return;
    const semantic = z
      .tuple([z.string(), z.array(z.string().nullable())])
      .parse(recipe.input.semantic);
    const segment = recipe.key.startsWith("audio:body:")
      ? "body"
      : recipe.key.startsWith("audio:intro:")
        ? "intro"
        : "outro";
    const stage = deps.db
      .prepare("SELECT id FROM stages WHERE project_id=? AND kind='audio'")
      .get(view.revision.projectId);
    const id = deps.ids.next();
    insertManifestPiece(
      deps.db,
      view.revision,
      {
        key: recipe.key,
        stageKind: "audio",
        assetId: recipe.input.assetId,
        fingerprint: recipe.fingerprint,
        piece: {
          id: deps.ids.next(),
          stageId: z.string().parse(stage?.id),
          kind: segment === "body" ? "chunk" : "segment",
          idx: ordinal,
          state: "done",
          payload: JSON.stringify({
            provided: true,
            file: asset.path,
            logicalKey: recipe.key.slice(0, recipe.key.lastIndexOf(":")),
            logicalText: semantic[0],
            text: semantic[0],
            segment,
            provider: semantic[1][0],
            model: semantic[1][1],
            voice: semantic[1][2],
            requestFingerprint: recipe.requestFingerprint,
          }),
        },
      },
      id,
    );
    selectPieceRecord(deps.db, view.revision.id, recipe.key, id);
    return;
  }
  if (recipe.input.kind !== "tts") return;
  if (
    view.pieces.some(
      (one) =>
        one.selected &&
        one.available &&
        one.key === recipe.key &&
        one.fingerprint === recipe.fingerprint &&
        one.piece.state === "done" &&
        one.piece.idx === ordinal,
    )
  )
    return;
  const history = [...view.pieces, ...retainedNarrationPieces(deps, view.revision.projectId)];
  const available = new Set(
    history
      .filter((one) => one.available)
      .flatMap((one) => (one.assetId === null ? [] : [one.assetId])),
  );
  const old = matchingNarrationPiece(recipe, history, available);
  if (old === undefined) return;
  const input = recipe.input;
  const recordId = deps.ids.next();
  const payload: unknown = JSON.parse(old.piece.payload ?? "{}");
  insertManifestPiece(
    deps.db,
    view.revision,
    {
      key: recipe.key,
      stageKind: "audio",
      assetId: old.assetId,
      fingerprint: recipe.fingerprint,
      piece: {
        ...old.piece,
        id: deps.ids.next(),
        idx: ordinal,
        payload: JSON.stringify({
          ...(typeof payload === "object" && payload !== null ? payload : {}),
          text: input.text,
          logicalKey: input.logicalKey,
          logicalText: input.logicalText,
          segment: input.segment,
          requestFingerprint: recipe.requestFingerprint,
          provider: input.provider,
          model: input.model,
          voice: input.voice,
        }),
      },
    },
    recordId,
  );
  selectPieceRecord(deps.db, view.revision.id, recipe.key, recordId);
}

export function narrationOrdinal(recipes: readonly ResolvedWorkRecipe[], key: string): number {
  const entry = /^audio:(intro|outro):([0-9]+)$/.exec(key);
  if (entry !== null) return Number(entry[2]) * 2 - (entry[1] === "intro" ? 1 : 0);
  return (
    recipes
      .filter((row) => /^audio:body:.+:[0-9]+$/.test(row.key))
      .findIndex((row) => row.key === key) + 1
  );
}
