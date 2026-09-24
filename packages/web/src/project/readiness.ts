import type { StageKind } from "@app/kernel/pipeline.js";
import type { RunConfig } from "@app/slices/admission/model.js";
import { usesNarrationPreparation } from "@app/slices/admission/rules.js";
import type { ProviderStatus } from "@app/slices/settings/model.js";
import { providerUnavailableLabel } from "@/lib/provider-status";

// A stage whose provider has no key or usable agent CLI cannot be retried or re-run. The control
// distinguishes a missing executable from one that needs an upgrade and links to Settings.

export interface Unready {
  // What the disabled control reads instead of its verb.
  readonly label: string;
  readonly provider: string;
}

// Which provider a stage's work goes to. The video stage renders locally with ffmpeg, so
// it has none.
export function providerFor(kind: StageKind, config: RunConfig): string | undefined {
  switch (kind) {
    case "research":
    case "article":
      return config.llm?.provider;
    case "audio":
      return config.audio?.provider;
    case "images":
    case "thumbnail":
      return config.images?.provider;
    case "video":
      return undefined;
  }
}

export function unreadyFor(
  kind: StageKind,
  config: RunConfig,
  providers: readonly ProviderStatus[],
): Unready | undefined {
  if (kind === "audio" && config.narrationPrompt && usesNarrationPreparation(config)) {
    const preparation = unreadyFor("article", config, providers);
    if (preparation !== undefined) return preparation;
  }
  const id = providerFor(kind, config);
  if (id === undefined || id === "") {
    return undefined;
  }
  const status = providers.find((provider) => provider.id === id);
  if (status === undefined) {
    // A run made against a provider this build no longer lists. Nothing can be said about
    // its key, so nothing is: the server answers for the retry.
    return undefined;
  }
  const label = providerUnavailableLabel(status.readiness);
  return label === undefined ? undefined : { label, provider: id };
}
