import type { StageKind } from "@app/kernel/pipeline.js";
import type { RunConfig } from "@app/slices/admission/model.js";
import type { ProviderStatus } from "@app/slices/settings/model.js";

// `logic/02` §Q13 and §Q135 through `uiux/screens/08-project.md`: a stage whose provider
// has no key, or whose agent CLI is not on PATH, cannot be retried or re-run, and the
// control says which of the two it is with a link to Settings. Pure: the row only has to
// draw what this decides.

export interface Unready {
  // What the disabled control reads instead of its verb.
  readonly label: string;
  readonly provider: string;
}

// Which provider a stage's work goes to. The video stage renders locally with ffmpeg, so
// it has none (04-data-flow, Side-effect boundaries).
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
  if (status.readiness.kind === "keyed") {
    return status.readiness.hasKey ? undefined : { label: "Key missing", provider: id };
  }
  return status.readiness.installed ? undefined : { label: "CLI missing", provider: id };
}
