import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { transact } from "../../kernel/db/tx.js";
import type { Ids } from "../../kernel/ids.js";
import { splitText } from "../../kernel/ports/text.js";
import { insertPiece, piecesOf, type StagePiece } from "../../kernel/runner/piece-repo.js";

const payload = z.object({ text: z.string(), file: z.string().optional() });
// Old whole-text plans can exceed a newly known account limit. Preserve finished
// pieces and their paths, and split only unfinished work before any request starts.
export function planNarration(
  deps: { readonly db: DatabaseSync; readonly ids: Ids },
  stageId: string,
  texts: readonly string[],
  maxCharacters: number,
  finished: (piece: StagePiece) => boolean,
): readonly StagePiece[] {
  const old = piecesOf(deps.db, stageId, "chunk");
  const source = old.length
    ? old
    : texts.map((text, idx) => ({
        id: deps.ids.next(),
        stageId,
        kind: "chunk" as const,
        idx: idx + 1,
        state: "pending" as const,
        payload: JSON.stringify({ text }),
      }));
  const planned: StagePiece[] = [];
  for (const piece of source) {
    const data = payload.parse(JSON.parse(piece.payload ?? "null"));
    if (finished(piece)) {
      planned.push({ ...piece, idx: planned.length + 1 });
      continue;
    }
    for (const [part, text] of splitText(data.text, maxCharacters).entries())
      planned.push({
        ...piece,
        id: part === 0 ? piece.id : deps.ids.next(),
        idx: planned.length + 1,
        state: "pending",
        payload: JSON.stringify({ text }),
      });
  }
  if (
    old.length &&
    planned.length === old.length &&
    planned.every(
      (p, i) =>
        p.id === old[i]?.id &&
        payload.parse(JSON.parse(p.payload ?? "null")).text ===
          payload.parse(JSON.parse(old[i]?.payload ?? "null")).text,
    )
  )
    return old;
  transact(deps.db, () => {
    // Negative temporary indices avoid colliding with a retained completed piece.
    deps.db
      .prepare("UPDATE stage_pieces SET idx=-idx WHERE stage_id=? AND kind='chunk'")
      .run(stageId);
    const known = new Set(old.map((p) => p.id));
    for (const piece of planned) {
      if (known.has(piece.id))
        deps.db
          .prepare("UPDATE stage_pieces SET idx=?,state=?,payload=? WHERE id=?")
          .run(piece.idx, piece.state, piece.payload, piece.id);
      else insertPiece(deps.db, piece);
    }
  });
  return planned;
}
