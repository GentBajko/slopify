import type { ModelInfo } from "@app/kernel/ports/model.js";
import { queryOptions } from "@tanstack/react-query";
import type { Api } from "@/api";
import { read } from "@/http";

export interface ProviderModels {
  readonly models: readonly ModelInfo[];
  readonly allowsCustom: boolean;
  readonly warning?: string;
  readonly notice?: string;
}

export const modelsKey = (provider: string): readonly ["provider-models", string] => [
  "provider-models",
  provider,
];

export async function listProviderModels(
  api: Api,
  provider: string,
  refresh = false,
  signal?: AbortSignal,
): Promise<ProviderModels> {
  const url = `${api.origin}/api/providers/${encodeURIComponent(provider)}/models${refresh ? "?refresh=1" : ""}`;
  return read<ProviderModels>(await api.fetch(url, signal ? { signal } : undefined));
}

export function modelsQuery(api: Api, provider: string) {
  return queryOptions({
    queryKey: modelsKey(provider),
    queryFn: ({ signal }) => listProviderModels(api, provider, false, signal),
    enabled: provider !== "",
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

// These image adapters require one of the server's supported input schemas. A
// failed discovery request must not turn their IDs into an unrestricted text field.
export function customModelFallback(provider: string): boolean {
  return provider !== "" && provider !== "fal" && provider !== "replicate";
}
