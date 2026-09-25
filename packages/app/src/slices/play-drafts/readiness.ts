import { checkRuntimeModel } from "../../catalog/runtime-models.js";
import { modelFields } from "../../catalog/validate.js";
import { readinessIsUsable } from "../../kernel/ports/model.js";
import {
  type FieldError,
  usesNarrationPreparation,
  usesYoutubeDescription,
} from "../admission/rules.js";
import { cliPathChanged } from "../settings/cli-paths.js";
import type { ProviderStatus } from "../settings/model.js";
import { hasKey, listVoices } from "../settings/repo.js";
import type { DraftStartDeps, ResolvedPlayRun } from "./model.js";

export function choices(runs: readonly ResolvedPlayRun[]) {
  const selected = runs
    .flatMap(
      ({ draft: d }) =>
        [
          {
            field: "llm",
            family: "llm",
            choice: d.llm,
            needed:
              d.sources.research === "generate" ||
              d.sources.article === "generate" ||
              d.sources.thumbnail === "prompt_by_llm" ||
              d.intro?.mode === "llm" ||
              d.outro?.mode === "llm" ||
              usesNarrationPreparation(d) ||
              usesYoutubeDescription(d),
          },
          {
            field: "audio",
            family: "tts",
            choice: d.audio,
            needed: d.sources.audio === "generate",
          },
          {
            field: "images",
            family: "image",
            choice: d.images,
            needed:
              d.sources.images === "generate" ||
              ["from_prompt", "prompt_by_llm"].includes(d.sources.thumbnail),
          },
        ] as const,
    )
    .flatMap((c) => (c.needed && c.choice ? [{ ...c, ...c.choice }] : []));
  return [...new Map(selected.map((c) => [`${c.family}:${c.provider}:${c.model}`, c])).values()];
}
export async function checkDraftReadiness(
  deps: DraftStartDeps,
  runs: readonly ResolvedPlayRun[],
): Promise<{
  readonly fields: readonly FieldError[];
  readonly providers: readonly ProviderStatus[];
}> {
  const selected = choices(runs);
  if (selected.length === 0) return { fields: [], providers: [] };
  const providers = await deps.providers();
  const fields: FieldError[] = [];
  for (const c of selected) {
    const provider = providers.find((p) => p.id === c.provider && p.family === c.family);
    if (!provider || !readinessIsUsable(provider.readiness)) {
      fields.push({
        field: c.field,
        message:
          provider?.readiness.kind === "cli" && provider.readiness.issue
            ? provider.readiness.issue
            : "Set up this provider in Settings → Providers before starting.",
      });
      continue;
    }
    const result = await checkRuntimeModel(
      deps.modelsFor,
      c.provider,
      c.family,
      c.model,
      c.thinking,
    );
    if (result === "missing")
      fields.push({
        field: `${c.field}.model`,
        message: "This model is no longer available. Choose another model.",
      });
    else if (result === "thinking")
      fields.push({
        field: `${c.field}.thinking`,
        message: "This model does not support that thinking setting. Choose another.",
      });
  }
  return { fields: [...fields, ...localDraftReadiness(deps, runs, providers)], providers };
}
export function localDraftReadiness(
  deps: DraftStartDeps,
  runs: readonly ResolvedPlayRun[],
  providers: readonly ProviderStatus[],
): readonly FieldError[] {
  const fields: FieldError[] = runs.flatMap((run) => modelFields(run.draft, deps.catalogue));
  for (const c of choices(runs)) {
    const provider = providers.find((p) => p.id === c.provider && p.family === c.family);
    if (cliPathChanged(deps.db, provider))
      fields.push({
        field: `${c.field}.cliPath`,
        message:
          "This provider's command-line tool changed in Settings → Providers. Choose Review and start again.",
      });
    if (provider?.readiness.kind === "keyed" && !hasKey(deps.db, provider.id))
      fields.push({
        field: c.field,
        message: "Add this provider's API key in Settings → Providers before starting.",
      });
  }
  for (const { draft } of runs)
    if (
      draft.sources.audio === "generate" &&
      draft.audio &&
      !listVoices(deps.db).some(
        (v) => v.provider === draft.audio?.provider && v.voiceId === draft.audio.voice,
      )
    )
      fields.push({
        field: "audio.voice",
        message: "Choose one of your saved voices. Add voices in Settings → Voices.",
      });
  return fields;
}
