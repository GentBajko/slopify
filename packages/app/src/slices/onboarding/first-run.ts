import type { DatabaseSync } from "node:sqlite";
import type { ProviderStatus } from "../settings/model.js";
import type { FirstRunView } from "./model.js";
import { starterPacks } from "./packs.js";
import { sampleProjectId } from "./sample.js";
import { dismissFirstRun, firstRunDismissed, readPackRecords } from "./state.js";

// The first-run screen shows on a fresh install and never again once it is skipped or a real
// project (anything but the sample) exists. A real project also dismisses it for good, so
// deleting every project later does not bring it back.
export function firstRunView(
  db: DatabaseSync,
  statuses: readonly ProviderStatus[],
  at: string,
): FirstRunView {
  const sample = sampleProjectId(db) ?? null;
  const real =
    db.prepare("SELECT 1 FROM projects WHERE id IS NOT ? LIMIT 1").get(sample) !== undefined;
  if (real) dismissFirstRun(db, at);
  const packs = readPackRecords(db);
  return {
    show: !real && !firstRunDismissed(db),
    sampleProjectId: sample,
    clis: detectedClis(statuses),
    packs: starterPacks.map((pack) => ({
      id: pack.id,
      name: pack.name,
      summary: pack.summary,
      installed: packs[pack.id] !== undefined,
      templateId: packs[pack.id]?.template ?? null,
    })),
  };
}

// What this machine can make without a key: each agent CLI Slopify found, and whether it
// answers (installed, a supported version, signed in as far as the probe can tell).
export function detectedClis(statuses: readonly ProviderStatus[]): FirstRunView["clis"] {
  return (["claude-code", "codex", "gemini"] as const).map((id) => {
    const status = statuses.find((row) => row.id === id);
    const readiness = status?.readiness;
    const cli = readiness?.kind === "cli" ? readiness : undefined;
    return {
      id,
      name: status?.displayName ?? id,
      installed: cli?.installed === true,
      ready: cli?.installed === true && cli.issue === undefined,
      version: cli?.version ?? null,
      issue: cli?.issue ?? null,
      draws: id === "codex",
    };
  });
}
