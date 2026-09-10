import { z } from "zod";
import type { ModelInfo } from "../../kernel/ports/model.js";
import { providerError } from "../../kernel/ports/model.js";

interface DiscoveryDeps {
  readonly fetch: typeof globalThis.fetch;
  readonly key: () => string | undefined;
}
const openAiModels = z.object({ data: z.array(z.object({ id: z.string() })) });
const googleModels = z.object({
  models: z
    .array(
      z.object({
        name: z.string(),
        displayName: z.string().optional(),
        supportedGenerationMethods: z.array(z.string()).optional(),
      }),
    )
    .default([]),
  nextPageToken: z.string().optional(),
});

export async function discoverOpenAiImages(deps: DiscoveryDeps): Promise<readonly ModelInfo[]> {
  const response = await deps.fetch("https://api.openai.com/v1/models", {
    headers: { Authorization: `Bearer ${requireKey(deps)}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw unavailable();
  const parsed = openAiModels.safeParse(await response.json());
  if (!parsed.success) throw unavailable();
  return parsed.data.data
    .filter(({ id }) => id.startsWith("gpt-image-"))
    .map(({ id }) => ({ id, name: id }));
}

export async function discoverGoogleImages(deps: DiscoveryDeps): Promise<readonly ModelInfo[]> {
  const headers = { "x-goog-api-key": requireKey(deps) };
  const signal = AbortSignal.timeout(10_000);
  const result: ModelInfo[] = [];
  const tokens = new Set<string>();
  let page = "";
  // Bound a malformed provider's pagination while allowing 20,000 model records.
  for (let count = 0; count < 20; count++) {
    const url = new URL("https://generativelanguage.googleapis.com/v1beta/models");
    url.searchParams.set("pageSize", "1000");
    if (page !== "") url.searchParams.set("pageToken", page);
    const response = await deps.fetch(url, { headers, signal });
    if (!response.ok) throw unavailable();
    const parsed = googleModels.safeParse(await response.json());
    if (!parsed.success) throw unavailable();
    for (const model of parsed.data.models) {
      const id = model.name.replace(/^models\//, "");
      // Imagen uses a different generation API. Only Gemini image models share this adapter.
      if (
        id.startsWith("gemini-") &&
        /-image(?:-|$)/.test(id) &&
        model.supportedGenerationMethods?.includes("generateContent") === true
      ) {
        result.push({ id, name: model.displayName ?? id });
      }
    }
    page = parsed.data.nextPageToken ?? "";
    if (page === "") return result;
    if (tokens.has(page)) throw unavailable();
    tokens.add(page);
  }
  throw unavailable();
}

function requireKey(deps: DiscoveryDeps): string {
  const key = deps.key();
  if (key === undefined || key === "")
    throw providerError({ kind: "missing_key", message: "Save an API key to load models." });
  return key;
}
function unavailable(): Error {
  return providerError({ kind: "other", message: "The provider model list could not be loaded." });
}
