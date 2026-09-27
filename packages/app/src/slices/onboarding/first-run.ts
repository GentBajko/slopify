import type { DatabaseSync } from "node:sqlite";
import { readinessIsUsable } from "../../kernel/ports/model.js";
import type { ProviderStatus } from "../settings/model.js";
import type { FirstRunView } from "./model.js";
import { starterPacks } from "./packs.js";
import { sampleProjectIds } from "./sample.js";
import { firstRunDismissed, readPackRecords } from "./state.js";

// The first-run screen shows on a fresh install and never again once it is skipped or a real
// project (anything but the samples) exists. Reading it writes nothing: a real project that
// exists before the screen was recorded as done is reported as `settle`, and the client
// records it with POST /dismiss, so deleting every project later does not bring it back.
export function firstRunView(db: DatabaseSync, statuses: readonly ProviderStatus[]): FirstRunView {
  const samples = sampleProjectIds(db);
  const real =
    db
      .prepare("SELECT 1 FROM projects WHERE id IS NOT ? AND id IS NOT ? AND id IS NOT ? LIMIT 1")
      .get(samples.library, samples.audiobook, samples.podcast) !== undefined;
  const dismissed = firstRunDismissed(db);
  const packs = readPackRecords(db);
  return {
    show: !real && !dismissed,
    settle: real && !dismissed,
    voice: firstVoice(statuses),
    sampleProjectId: samples.library,
    samples,
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

// Who would narrate a first short: a keyed voice provider when one has a key, else the
// computer's own voice when a speech program was found.
export function firstVoice(statuses: readonly ProviderStatus[]): FirstRunView["voice"] {
  const keyed = statuses.find(
    (row) =>
      row.family === "tts" && row.readiness.kind === "keyed" && readinessIsUsable(row.readiness),
  );
  const system = statuses.find((row) => row.readiness.kind === "local")?.readiness;
  const local = system?.kind === "local" ? system : undefined;
  return {
    keyed: keyed?.displayName ?? null,
    system: {
      available: local?.available === true,
      engine: local?.engine ?? null,
      issue: local?.issue ?? null,
    },
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
