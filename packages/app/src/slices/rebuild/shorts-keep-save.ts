import type {
  KeptShort,
  ManifestOutput,
  ManifestPiece,
  RevisionContent,
  RevisionEdit,
  RevisionManifest,
  RevisionView,
} from "../revisions/model.js";
import { effectiveClips, pickedShortsOf } from "../shorts/clips.js";
import { keptOf } from "../shorts/keep.js";

// What a save does for the shorts it keeps (`shorts/keep.ts`): which shorts are finished, the
// keep list a save falls back to, and kept shorts moved to their new numbers, with the work
// that made their prompts and images, so only their render runs again.

const pickKey = "shorts:pick";

// The shorts of a version that are finished (their render ready and in use), in number order.
export function finishedShorts(base: RevisionView): readonly KeptShort[] {
  const piece = base.pieces.find(
    (row) => row.key === pickKey && row.selected && row.piece.state === "done",
  );
  const picked = pickedShortsOf(piece?.piece.payload);
  const limits = base.revision.config.shorts;
  if (piece === undefined || picked?.sentences === undefined || limits === undefined) return [];
  const sentences = picked.sentences;
  const clips = effectiveClips(
    picked,
    base.revision.content.shortsRanges,
    piece.fingerprint,
    limits,
  );
  return clips
    .filter((clip) => base.outputs.some((row) => rendersClip(row, clip)))
    .toSorted((left, right) => left.number - right.number)
    .flatMap((clip) => {
      const kept = keptOf(clip, sentences);
      return kept === undefined ? [] : [kept];
    });
}

// Whether the edit set its own keep list (rather than carrying the version's along).
export function keepChosen(base: RevisionView, edit: RevisionEdit): boolean {
  return (
    JSON.stringify(edit.content.shortsKeep ?? null) !==
    JSON.stringify(base.revision.content.shortsKeep ?? null)
  );
}

// The content with a keep list in place: at most the count, each numbered by its place, the
// hand-set ranges (folded into the kept sentences) dropped, and every "Make this short again"
// token moved with its short. `moves` says which shorts change number.
export function withKeep(
  content: RevisionContent,
  keep: readonly KeptShort[],
  count: number,
): { readonly content: RevisionContent; readonly moves: ReadonlyMap<number, number> } {
  const kept = keep.slice(0, count);
  const moves = new Map<number, number>();
  for (const [at, short] of kept.entries())
    if (short.from !== at + 1) moves.set(short.from, at + 1);
  const tokens: Record<string, string> = {};
  for (const [key, value] of Object.entries(content.regenerationTokens)) {
    const number = /^shorts:(\d+)$/.exec(key)?.[1];
    if (number === undefined) tokens[key] = value;
  }
  for (const [at, short] of kept.entries()) {
    const own = content.regenerationTokens[`shorts:${String(short.from)}`];
    if (own !== undefined) tokens[`shorts:${String(at + 1)}`] = own;
  }
  const { shortsRanges: _folded, ...rest } = content;
  return {
    content: {
      ...rest,
      regenerationTokens: tokens,
      shortsKeep: kept.map((short, at) => ({ ...short, from: at + 1 })),
    },
    moves,
  };
}

// The manifest with each moved short's rows under its new number, and the rows of the
// numbers they take over dropped, so the kept short's prompts and images are found again.
export function movedShorts(
  manifest: RevisionManifest,
  moves: ReadonlyMap<number, number>,
): RevisionManifest {
  if (moves.size === 0) return manifest;
  const targets = new Set(moves.values());
  const numberOf = (key: string) => Number(/^shorts:(\d+):/.exec(key)?.[1] ?? Number.NaN);
  const moved = (key: string): string | null => {
    const number = numberOf(key);
    if (Number.isNaN(number)) return key;
    const to = moves.get(number);
    if (to !== undefined) return key.replace(/^shorts:\d+:/, `shorts:${String(to)}:`);
    // A number another kept short moves into: its own work is no longer the short there.
    return targets.has(number) ? null : key;
  };
  const outputs = manifest.outputs.flatMap((row): ManifestOutput[] => {
    const workKey = moved(row.workKey);
    if (workKey === null) return [];
    const slot = moved(row.slot) ?? row.slot;
    return [workKey === row.workKey ? row : { ...row, workKey, slot }];
  });
  const pieces = manifest.pieces.flatMap((row): ManifestPiece[] => {
    const key = moved(row.key);
    if (key === null) return [];
    return [key === row.key ? row : { ...row, key }];
  });
  return { outputs, pieces };
}

// A render in use, cut from exactly this clip's sentences: a render left from an earlier pick
// under the same number is another short.
export function rendersClip(
  row: Pick<ManifestOutput, "workKey" | "state" | "output"> & { readonly selected: boolean },
  clip: { readonly number: number; readonly first: number; readonly last: number },
): boolean {
  const sentences = row.output.meta.sentences;
  return (
    row.workKey === `shorts:${String(clip.number)}:render` &&
    row.selected &&
    row.state === "ready" &&
    sentences?.[0] === clip.first &&
    sentences?.[1] === clip.last
  );
}
