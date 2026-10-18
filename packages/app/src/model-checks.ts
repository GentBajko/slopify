import type { DatabaseSync } from "node:sqlite";
import { keyProbes } from "./adapters/key-probes.js";
import type { Catalogue } from "./catalog/schema.js";
import type { Clock } from "./kernel/clock.js";
import type { Log } from "./kernel/log.js";
import { type ThinkingMode, thinkingModes } from "./kernel/ports/llm.js";
import { type ModelInfo, type ProviderFamily, readinessIsUsable } from "./kernel/ports/model.js";
import type { Registry } from "./kernel/ports/registry.js";
import { type CheckCall, type CheckDeps, checkModel } from "./kernel/runner/model-check.js";
import { modelSources } from "./model-catalog.js";
import { isVideoTarget, spentOn } from "./slices/model-checks/cost.js";
import { createListing, type Listing } from "./slices/model-checks/listing.js";
import type { ModelKey } from "./slices/model-checks/model.js";
import type { ModelChecker } from "./slices/model-checks/run.js";
import { createModelChecks, type ModelChecks } from "./slices/model-checks/service.js";
import {
  isLocalCliProvider,
  type ProviderId,
  type ProviderStatus,
  systemVoiceProvider,
  type Voice,
} from "./slices/settings/model.js";
import { listVoices } from "./slices/settings/repo.js";

// The composition layer's check recipes: what the smallest request is for each kind of model.
// A reply of one word at the lowest thinking setting, a voice saying "Hi", a one-to-one grey
// dot. Image-to-video models are listed only, never generated.

export const checkPrompt = "Reply with OK.";
export const checkSpeech = "Hi";
export const checkPicture = "a small grey dot";

// A voice every account of these providers has, for a check made before any voice is saved.
const defaultVoices: Readonly<Record<string, string>> = {
  "openai-tts": "alloy",
  "google-tts": "Kore",
  // ElevenLabs' premade "Rachel".
  elevenlabs: "21m00Tcm4TlvDq8ikWAM",
};

export interface RecipeDeps {
  readonly catalogue: () => Catalogue;
  readonly voices: () => readonly Voice[];
  // A CLI's own model list, for the thinking settings each model takes.
  readonly cliModels: (provider: string, family: ProviderFamily) => Promise<readonly ModelInfo[]>;
  readonly systemVoiceReady: () => Promise<boolean>;
}

export type Recipe =
  | { readonly kind: "call"; readonly call: CheckCall }
  | { readonly kind: "free-works" }
  | { readonly kind: "skip"; readonly reason: string };

function lowest(modes: readonly string[] | undefined): ThinkingMode | undefined {
  if (modes === undefined || modes.length === 0) return undefined;
  return thinkingModes.find((mode) => modes.includes(mode));
}

export async function recipeFor(deps: RecipeDeps, target: ModelKey): Promise<Recipe> {
  const catalogue = deps.catalogue();
  const { provider, model } = target;
  if (target.family === "llm") {
    let modes: readonly string[] | undefined;
    if (isLocalCliProvider(provider))
      modes = (await deps.cliModels(provider, "llm").catch(() => [])).find(
        (m) => m.id === model,
      )?.thinkingModes;
    else {
      const row = catalogue.llm.find((m) => m.provider === provider && m.id === model);
      modes = row?.llm.thinking === undefined ? undefined : Object.keys(row.llm.thinking);
    }
    const thinking = lowest(modes);
    return {
      kind: "call",
      call: {
        kind: "llm",
        provider,
        model,
        prompt: checkPrompt,
        ...(thinking === undefined ? {} : { thinking }),
      },
    };
  }
  if (target.family === "tts") {
    if (provider === systemVoiceProvider)
      return (await deps.systemVoiceReady())
        ? { kind: "free-works" }
        : { kind: "skip", reason: "No speech program was found on this computer." };
    const voiceId =
      deps.voices().find((voice) => voice.provider === provider)?.voiceId ??
      (Object.hasOwn(defaultVoices, provider) ? defaultVoices[provider] : undefined);
    if (voiceId === undefined)
      return {
        kind: "skip",
        reason: "Add a voice for this provider in Settings → Voices, then choose Check models.",
      };
    return { kind: "call", call: { kind: "tts", provider, model, voiceId, text: checkSpeech } };
  }
  if (isVideoTarget(catalogue, target))
    return { kind: "skip", reason: "Image-to-video models are listed, never checked." };
  const row = catalogue.image.find((m) => m.provider === provider && m.id === model);
  const ratios = row?.image.aspectRatios ?? ["1:1"];
  const aspect = ratios.includes("1:1") ? "1:1" : (ratios[0] ?? "1:1");
  let thinking: ThinkingMode | undefined;
  if (isLocalCliProvider(provider))
    thinking = lowest(
      (await deps.cliModels(provider, "image").catch(() => [])).find((m) => m.id === model)
        ?.thinkingModes,
    );
  return {
    kind: "call",
    call: {
      kind: "image",
      provider,
      model,
      prompt: checkPicture,
      aspect,
      ...(thinking === undefined ? {} : { thinking }),
    },
  };
}

export function modelChecker(deps: RecipeDeps & CheckDeps): ModelChecker {
  return async (target, signal) => {
    const recipe = await recipeFor(deps, target);
    if (recipe.kind === "skip") return { kind: "skipped", reason: recipe.reason };
    if (recipe.kind === "free-works")
      return { kind: "checked", verdict: "works", sentence: null, stopProvider: false, spent: 0 };
    const answer = await checkModel(deps, recipe.call, signal);
    return {
      kind: "checked",
      verdict: answer.verdict,
      sentence: answer.sentence,
      stopProvider: answer.stopProvider,
      spent: answer.verdict === "works" ? spentOn(deps.catalogue(), target, answer.use) : 0,
    };
  };
}

export interface ChecksWiring {
  readonly db: DatabaseSync;
  readonly clock: Clock;
  readonly log: Log;
  readonly registry: Registry;
  readonly catalogue: () => Catalogue;
  readonly fetch: typeof globalThis.fetch;
  readonly statuses: () => Promise<readonly ProviderStatus[]>;
}

// The model-checks service as main.ts runs it: free listings from the providers' own model
// endpoints, and checks made through the recipes above.
export function wireModelChecks(deps: ChecksWiring): {
  readonly checks: ModelChecks;
  readonly listing: Listing;
} {
  const { modelsFor } = modelSources(deps.registry);
  const listing = createListing({
    db: deps.db,
    clock: deps.clock,
    fetch: deps.fetch,
    probes: keyProbes,
    known: (provider, family) =>
      deps
        .catalogue()
        [family].filter((row) => row.provider === provider && row.enabled && !row.deprecated)
        .map((row) => row.id),
    cliModels: async (provider, family) => (await modelsFor(provider, family)).map((m) => m.id),
  });
  const checks = createModelChecks({
    db: deps.db,
    clock: deps.clock,
    log: deps.log,
    catalogue: deps.catalogue,
    listing,
    providerModels: modelsFor,
    check: modelChecker({
      registry: deps.registry,
      clock: deps.clock,
      log: deps.log,
      catalogue: deps.catalogue,
      voices: () => listVoices(deps.db),
      cliModels: modelsFor,
      systemVoiceReady: async () =>
        (await deps.statuses()).some(
          (status) => status.id === systemVoiceProvider && readinessIsUsable(status.readiness),
        ),
    }),
  });
  return { checks, listing };
}

// A CLI that has become usable - installed and signed in - since the last look, or one that is
// usable and was never listed, is checked as if it had just been added.
export function cliWatcher(
  checks: Pick<ModelChecks, "automatic">,
  statuses: () => Promise<readonly ProviderStatus[]>,
  known: (provider: ProviderId) => boolean,
): () => Promise<void> {
  const usable = new Map<ProviderId, boolean>();
  return async () => {
    for (const status of await statuses()) {
      if (status.readiness.kind !== "cli") continue;
      const now = readinessIsUsable(status.readiness);
      const before = usable.get(status.id);
      usable.set(status.id, now);
      if (now && (before === false || (before === undefined && !known(status.id))))
        await checks.automatic("cli-added", status.id);
    }
  };
}
