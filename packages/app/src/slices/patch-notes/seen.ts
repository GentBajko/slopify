import type { DatabaseSync } from "node:sqlite";
import { transact } from "../../kernel/db/tx.js";
import { readSetting, writeSetting } from "../settings/repo.js";
import { machineOf } from "../telemetry/repo.js";
import { listPatchNotes, type PatchNoteSummary } from "./library.js";

// The patch notes open by themselves once, on the first start of a version that has notes of
// its own, after an update. The newest version whose notes this install has closed (or read
// from the What's new tour) lives in one settings key, so it is once per install rather than
// once per browser. Backups leave it out, like the tour's key.
export const patchNotesSeenKey = "patchNotes.seenVersion";

export interface PatchNotesView {
  // The running version.
  readonly version: string;
  // What "What's new in this version" opens: the running version's note, or the newest.
  readonly current: string | null;
  // The note to open by itself now; null when nothing is due.
  readonly due: string | null;
  // Newest first.
  readonly notes: readonly PatchNoteSummary[];
}

function releaseOf(version: string): readonly [number, number, number] | undefined {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version);
  return match === null ? undefined : [Number(match[1]), Number(match[2]), Number(match[3])];
}

// Whether `a` is a later release than `b`; false when either is not a release number.
export function isNewerRelease(a: string, b: string): boolean {
  const left = releaseOf(a);
  const right = releaseOf(b);
  if (left === undefined || right === undefined) return false;
  for (const at of [0, 1, 2] as const) if (left[at] !== right[at]) return left[at] > right[at];
  return false;
}

// The newest version whose notes were seen; undefined when none was recorded, null when the
// stored value is damaged.
function seenVersion(db: DatabaseSync): string | undefined | null {
  const raw = readSetting(db, patchNotesSeenKey);
  if (raw === undefined) return undefined;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    return null;
  }
  return typeof value === "string" && releaseOf(value) !== undefined ? value : null;
}

// Telling an update from a fresh install works as for the What's new tour
// (slices/settings/whats-new.ts): before the first close, the machine row, written once when
// the first-run notice is dismissed, keeps the version that was running then. A fresh install
// has no machine yet or one stamped with the running version, so its notes do not open.
export function duePatchNote(
  db: DatabaseSync,
  version: string,
  notes: readonly PatchNoteSummary[],
): string | null {
  const note = notes.find((item) => item.version === version);
  if (note === undefined) return null;
  const seen = seenVersion(db);
  // A damaged value is not a reason to open the notes on every launch.
  if (seen === null) return null;
  if (seen !== undefined) return isNewerRelease(version, seen) ? note.id : null;
  const machine = machineOf(db);
  if (machine === undefined) return null;
  return isNewerRelease(version, machine.appVersion) ? note.id : null;
}

export async function readPatchNotes(
  db: DatabaseSync,
  dir: string,
  version: string,
): Promise<PatchNotesView> {
  const notes = await listPatchNotes(dir);
  const current = notes.find((note) => note.version === version) ?? notes[0];
  return { version, current: current?.id ?? null, due: duePatchNote(db, version, notes), notes };
}

// Closing the notes, or the What's new tour that stands in for them on a major update,
// records the running version. Idempotent, and never lowers the value, so running an older
// version for a while and updating again does not bring back notes already closed.
export function markPatchNotesSeen(db: DatabaseSync, version: string): void {
  if (releaseOf(version) === undefined) return;
  transact(db, () => {
    const seen = seenVersion(db);
    if (seen === undefined || seen === null || isNewerRelease(version, seen))
      writeSetting(db, patchNotesSeenKey, JSON.stringify(version));
  });
}
