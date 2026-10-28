import type { ModelInfo } from "@app/kernel/ports/model.js";
import type { ModelStandingView } from "@app/slices/model-checks/model.js";
import { pickerEntries } from "@app/slices/model-checks/rules.js";
import { isPreferredModel } from "@app/slices/onboarding/preferred-model.js";

// The model Create picks for a service nobody picked a model for: the one a first short picks
// (`preferredModel`) when the service lists it and the account can use it, checked yet or not,
// so it does not change while the background checks run; else the first the picker offers.
export function suggestedModel(
  provider: string,
  models: readonly ModelInfo[],
  standings: Readonly<Record<string, ModelStandingView>> | undefined,
): string | undefined {
  const liked = models.find(
    (model) =>
      isPreferredModel(provider, model.id) && standings?.[model.id]?.standing !== "no-access",
  );
  return (
    liked?.id ?? pickerEntries(models, standings, "", standings === undefined).entries[0]?.model.id
  );
}
