import type { DatabaseSync } from "node:sqlite";
import { transact } from "../../kernel/db/tx.js";
import { machineOf } from "../telemetry/repo.js";
import { readSetting, writeSetting } from "./repo.js";

// "What's new" is a short tour shown once per major version, on the first launch after an
// update. The newest major this install has been shown (or has no need to be shown) lives in
// one settings key, so it is once per install rather than once per browser.
export const whatsNewSeenKey = "whats-new.seen-major";

export interface WhatsNewView {
  // Whether the tour for `major` should open now.
  readonly show: boolean;
  // The running version's major, or null when the version is not a release number.
  readonly major: number | null;
}

export function majorOf(version: string): number | undefined {
  const match = /^(\d+)\.\d+\.\d+/.exec(version);
  return match === null ? undefined : Number(match[1]);
}

// The newest major already shown; undefined when none was recorded, null when the stored
// value is damaged.
function seenMajor(db: DatabaseSync): number | undefined | null {
  const raw = readSetting(db, whatsNewSeenKey);
  if (raw === undefined) return undefined;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    return null;
  }
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

// Telling an update from a fresh install: the machine row is written once, when the
// first-run notice is dismissed, and keeps the version that was running then. A fresh 3.x
// install either has no machine yet (the notice is still up) or one stamped 3.x, so it is not
// shown a tour of what changed since 2.x. An install that has been running since 2.x has a
// machine stamped 2.x. Once the tour is shown and closed, the key above takes over, so a
// later 4.0 compares against 3 rather than against the machine's first version.
export function readWhatsNew(db: DatabaseSync, version: string): WhatsNewView {
  const major = majorOf(version);
  if (major === undefined) return { show: false, major: null };
  const seen = seenMajor(db);
  // A damaged value is not a reason to show the tour on every launch.
  if (seen === null) return { show: false, major };
  if (seen !== undefined) return { show: seen < major, major };
  const machine = machineOf(db);
  if (machine === undefined) return { show: false, major };
  const first = majorOf(machine.appVersion);
  return { show: first !== undefined && first < major, major };
}

// Closing the tour, finishing it or skipping it all record the running major. Idempotent, and
// never lowers the value, so running an older version for a while and updating again does not
// bring back a tour already closed.
export function dismissWhatsNew(db: DatabaseSync, version: string): WhatsNewView {
  const major = majorOf(version);
  if (major === undefined) return { show: false, major: null };
  transact(db, () => {
    const seen = seenMajor(db);
    if (seen === undefined || seen === null || seen < major)
      writeSetting(db, whatsNewSeenKey, JSON.stringify(major));
  });
  return { show: false, major };
}
