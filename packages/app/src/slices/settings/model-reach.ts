import type { KeyTestDeps } from "./key-test.js";
import type { ProviderId } from "./model.js";
import { keyOf } from "./repo.js";

// Health check → "Model reachable": whether each model chosen for a keyed provider answers for
// the saved key, by the provider's own model read (`adapters/key-probes.ts`). Nothing is
// generated or billed. A provider with no such read, or one that didn't answer, is "unknown",
// never a pass.

export type ModelReach = "found" | "missing" | "unknown";

// ceiling: a provider chosen in many templates still costs a handful of reads, not one per
// model anywhere in the library.
const modelsChecked = 5;

export async function modelReach(
  deps: KeyTestDeps,
  provider: ProviderId,
  models: readonly string[],
): Promise<ReadonlyMap<string, ModelReach> | undefined> {
  const probe = Object.hasOwn(deps.probes, provider) ? deps.probes[provider] : undefined;
  const key = keyOf(deps.db, provider);
  if (probe?.model === undefined || key === undefined) return undefined;
  const reads = new Map<string, Promise<{ status: number; body: string } | undefined>>();
  const read = (url: string) => {
    const known = reads.get(url);
    if (known !== undefined) return known;
    const started = (async () => {
      try {
        const response = await deps.fetch(url, {
          headers: probe.headers(key),
          signal: AbortSignal.timeout(15_000),
          redirect: "error",
        });
        // A list is read whole; a single model's page only for its status.
        const body = probe.model?.lists === undefined ? "" : await response.text();
        if (probe.model?.lists === undefined) await response.body?.cancel().catch(() => {});
        return { status: response.status, body };
      } catch {
        return undefined;
      }
    })();
    reads.set(url, started);
    return started;
  };
  const found = new Map<string, ModelReach>();
  for (const model of [...new Set(models)].slice(0, modelsChecked)) {
    const answer = await read(probe.model.url(model));
    found.set(model, verdict(answer, model, probe.model.lists));
  }
  return found;
}

function verdict(
  answer: { status: number; body: string } | undefined,
  model: string,
  lists: ((body: string, model: string) => boolean | undefined) | undefined,
): ModelReach {
  if (answer === undefined) return "unknown";
  if (answer.status >= 200 && answer.status < 300) {
    if (lists === undefined) return "found";
    const listed = lists(answer.body, model);
    return listed === undefined ? "unknown" : listed ? "found" : "missing";
  }
  return answer.status === 404 && lists === undefined ? "missing" : "unknown";
}
