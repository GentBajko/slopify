import type { DatabaseSync } from "node:sqlite";
import type { Clock } from "../../kernel/clock.js";
import type { ModelAccessRecorder } from "../../kernel/runner/model-access.js";
import { type ProviderId, providerIds } from "../settings/model.js";
import { accountOf, writeVerdict } from "./repo.js";

function known(provider: string): provider is ProviderId {
  return (providerIds as readonly string[]).includes(provider);
}

// Learn from real runs: a model a run used works, and one the provider refused as not on the
// plan is marked so, with the provider's sentence, the moment it happens. A call made without
// a key on file (none to tie the row to) teaches nothing.
export function accessRecorder(deps: {
  readonly db: DatabaseSync;
  readonly clock: Clock;
}): ModelAccessRecorder {
  const write = (
    use:
      | Parameters<ModelAccessRecorder["denied"]>[0]
      | Parameters<ModelAccessRecorder["worked"]>[0],
    verdict: "works" | "no-access",
    sentence: string | null,
  ): void => {
    if (!known(use.provider)) return;
    const account = accountOf(deps.db, use.provider);
    if (account === undefined) return;
    writeVerdict(deps.db, {
      provider: use.provider,
      family: use.family,
      model: use.model,
      account,
      verdict,
      source: "run",
      sentence,
      at: deps.clock.now().toISOString(),
      cost: 0,
    });
  };
  return {
    worked: (use) => write(use, "works", null),
    denied: (use) => write(use, "no-access", use.sentence),
  };
}
