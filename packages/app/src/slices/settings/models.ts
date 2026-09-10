import type { ModelInfo, ProviderFamily } from "../../kernel/ports/model.js";

export interface ModelCatalog {
  readonly models: readonly ModelInfo[];
  readonly allowsCustom: boolean;
  readonly warning?: string;
  readonly notice?: string;
}

interface CatalogDeps {
  readonly load: (provider: string, family: ProviderFamily) => Promise<readonly ModelInfo[]>;
  readonly fallback: (provider: string) => readonly ModelInfo[];
  readonly now: () => number;
  readonly report: (provider: string) => void;
}

// These marketplaces host models with different input schemas. Discovery alone cannot
// make an arbitrary endpoint compatible with our image request.
export function allowsCustomModel(provider: string): boolean {
  return provider !== "fal" && provider !== "replicate";
}

const ttlMs = 5 * 60_000;
const retryMs = 30_000;

export function createModelCatalog(deps: CatalogDeps): {
  readonly get: (
    provider: string,
    family: ProviderFamily,
    refresh?: boolean,
  ) => Promise<ModelCatalog>;
  readonly invalidate: (provider: string) => void;
} {
  const cache = new Map<string, { readonly value: ModelCatalog; readonly expires: number }>();
  const pending = new Map<string, Promise<ModelCatalog>>();
  const generations = new Map<string, number>();
  async function get(
    provider: string,
    family: ProviderFamily,
    refresh = false,
  ): Promise<ModelCatalog> {
    const active = pending.get(provider);
    if (active !== undefined) return active;
    const previous = cache.get(provider);
    if (!refresh && previous !== undefined && previous.expires > deps.now()) return previous.value;
    const generation = generations.get(provider) ?? 0;
    const task = Promise.resolve()
      .then(async (): Promise<ModelCatalog> => {
        let value: ModelCatalog;
        let lifetime = ttlMs;
        try {
          const models = await deps.load(provider, family);
          value = {
            models: uniqueModels(models),
            allowsCustom: allowsCustomModel(provider),
            ...catalogNotice(provider),
          };
        } catch {
          // A catalogue is metadata, not generation. Never expose an upstream response
          // here: it can quote credentials that belong only inside its adapter.
          deps.report(provider);
          const saved = previous?.value.models;
          value = {
            models: saved ?? deps.fallback(provider),
            ...catalogNotice(provider),
            allowsCustom: allowsCustomModel(provider),
            warning:
              saved === undefined
                ? "Could not load the model list. Showing bundled choices; refresh to try again."
                : "Could not refresh the model list. Showing the last loaded choices.",
          };
          lifetime = retryMs;
        }
        if ((generations.get(provider) ?? 0) === generation) {
          cache.set(provider, { value, expires: deps.now() + lifetime });
        }
        return value;
      })
      .finally(() => {
        if (pending.get(provider) === task) pending.delete(provider);
      });
    pending.set(provider, task);
    return task;
  }
  return {
    get,
    invalidate: (provider) => {
      generations.set(provider, (generations.get(provider) ?? 0) + 1);
      cache.delete(provider);
      pending.delete(provider);
    },
  };
}

function uniqueModels(models: readonly ModelInfo[]): readonly ModelInfo[] {
  const seen = new Set<string>();
  return models.filter((model) => {
    if (model.id.trim() === "" || seen.has(model.id)) return false;
    seen.add(model.id);
    return true;
  });
}

function catalogNotice(provider: string): { readonly notice?: string } {
  const notices: Readonly<Record<string, string>> = {
    codex:
      "Models come from Codex's local catalogue. Open Codex to refresh that catalogue, then refresh this list.",
    gemini:
      "Models and aliases come from the installed Gemini CLI. Update that CLI to discover newer models.",
    "claude-code":
      "These aliases follow Claude Code's model families. You can also enter an exact model ID.",
    cartesia:
      "Cartesia has no model-list API. These are bundled compatible choices; you can enter a newer model ID.",
    fal: "These models have input formats supported by Slopify's fal adapter.",
    replicate: "These models have input formats supported by Slopify's Replicate adapter.",
  };
  const notice = Object.hasOwn(notices, provider) ? notices[provider] : undefined;
  return notice === undefined ? {} : { notice };
}
