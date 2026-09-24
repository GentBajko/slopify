import { checkRuntimeModel } from "../../catalog/runtime-models.js";
import type { Catalogue } from "../../catalog/schema.js";
import { readinessIsUsable } from "../../kernel/ports/model.js";
import type { FieldError } from "../admission/rules.js";
import type { RevisionView } from "../revisions/model.js";
import { cliPathStatus } from "../settings/cli-paths.js";
import type { ProviderStatus } from "../settings/model.js";
import { isLocalCliProvider } from "../settings/model.js";
import { hasKey, listVoices } from "../settings/repo.js";
import type { ExecutionSnapshot } from "./preview-plan.js";
import { requiresNewSubmission } from "./preview-retained.js";
import { type RecipeProviderChoice, recipeProviderChoice } from "./recipe-provider-choice.js";
import type { RebuildDeps } from "./service.js";

export function paidChoices(
  snapshot: ExecutionSnapshot,
  view: RevisionView,
  deps: RebuildDeps,
): readonly RecipeProviderChoice[] {
  const choices: RecipeProviderChoice[] = [];
  for (const recipe of snapshot.recipes) {
    if (
      recipe.kind !== "provider" ||
      snapshot.dispositions.find((row) => row.key === recipe.key)?.disposition === "reuse"
    )
      continue;
    if (!requiresNewSubmission(deps, view.revision.id, recipe.key, recipe.fingerprint)) continue;
    const choice = recipeProviderChoice(recipe, view.revision.config);
    if (choice !== undefined) choices.push(choice);
  }
  return [
    ...new Map(
      choices.map((choice) => [`${choice.family}:${choice.provider}:${choice.model}`, choice]),
    ).values(),
  ];
}
export async function checkReadiness(
  deps: RebuildDeps,
  snapshot: ExecutionSnapshot,
  view: RevisionView,
): Promise<{
  readonly fields: readonly FieldError[];
  readonly providers: readonly ProviderStatus[];
}> {
  const choices = paidChoices(snapshot, view, deps);
  if (choices.length === 0) return { fields: [], providers: [] };
  const providers = await deps.providers();
  const fields: FieldError[] = [];
  for (const choice of choices) {
    const provider = providers.find(
      (row) => row.id === choice.provider && row.family === choice.family,
    );
    if (provider === undefined || !readinessIsUsable(provider.readiness)) {
      fields.push({
        field: choice.family,
        message:
          provider?.readiness.kind === "cli" && provider.readiness.issue
            ? provider.readiness.issue
            : "Configure this provider before rebuilding.",
      });
      continue;
    }
    const result = await checkRuntimeModel(
      deps.modelsFor,
      choice.provider,
      choice.family,
      choice.model,
      choice.family === "llm" ? (choice.thinking ?? undefined) : undefined,
    );
    if (result === "missing")
      fields.push({
        field: `${choice.family}.model`,
        message: "Choose an available model before rebuilding.",
      });
    else if (result === "thinking")
      fields.push({
        field: `${choice.family}.thinking`,
        message: "Choose a supported thinking setting.",
      });
  }
  return { fields, providers };
}
export function localReadiness(
  deps: RebuildDeps,
  snapshot: ExecutionSnapshot,
  view: RevisionView,
  providers: readonly ProviderStatus[],
  catalogue: Catalogue,
): readonly FieldError[] {
  const fields: FieldError[] = [];
  for (const choice of paidChoices(snapshot, view, deps)) {
    const model = catalogue[choice.family].find(
      (row) =>
        row.provider === choice.provider &&
        row.id === choice.model &&
        row.enabled &&
        !row.deprecated,
    );
    if (model === undefined && !isLocalCliProvider(choice.provider))
      fields.push({
        field: `${choice.family}.model`,
        message: "The selected model is no longer available.",
      });
    const provider = providers.find(
      (row) => row.id === choice.provider && row.family === choice.family,
    );
    if (
      provider?.cliPath !== undefined &&
      cliPathStatus(deps.db, provider.id).command !== provider.cliPath.command
    )
      fields.push({
        field: `${choice.family}.cliPath`,
        message: "The configured CLI command changed. Check readiness again before rebuilding.",
      });
    if (provider?.readiness.kind === "keyed" && !hasKey(deps.db, provider.id))
      fields.push({ field: choice.family, message: "Save the provider key before rebuilding." });
    if (
      choice.voice !== undefined &&
      !listVoices(deps.db).some(
        (row) => row.provider === choice.provider && row.voiceId === choice.voice,
      )
    )
      fields.push({ field: "audio.voice", message: "Choose a saved voice before rebuilding." });
  }
  for (const recipe of snapshot.recipes) {
    if (
      snapshot.dispositions.find((row) => row.key === recipe.key)?.disposition === "reuse" ||
      !requiresNewSubmission(deps, view.revision.id, recipe.key, recipe.fingerprint)
    )
      continue;
    const input = recipe.input;
    if (input.kind === "tts") {
      const model = catalogue.tts.find(
        (row) => row.provider === input.provider && row.id === input.model,
      );
      const maximum = model?.tts.maxCharacters;
      if (maximum !== undefined && input.text.length > maximum)
        fields.push({
          field: `work.${recipe.key}.text`,
          message:
            "This saved physical request exceeds the current model limit. Regenerate this narration group to plan new parts.",
        });
    } else if (input.kind === "llm") {
      if (isLocalCliProvider(input.provider)) continue;
      const model = catalogue.llm.find(
        (row) => row.provider === input.provider && row.id === input.model,
      );
      if (input.thinking !== null && model?.llm.thinking?.[input.thinking] === undefined)
        fields.push({
          field: `work.${recipe.key}.thinking`,
          message: "The selected thinking setting is no longer supported.",
        });
      if (input.webSearch && model?.llm.webSearch !== true)
        fields.push({
          field: `work.${recipe.key}.webSearch`,
          message: "This model no longer supports the required web search.",
        });
    } else if (input.kind === "image") {
      const model = catalogue.image.find(
        (row) => row.provider === input.provider && row.id === input.model,
      );
      if (model !== undefined && !model.image.aspectRatios.includes(input.aspect))
        fields.push({
          field: `work.${recipe.key}.aspect`,
          message: "The model does not support this output shape.",
        });
    }
  }
  return fields;
}
