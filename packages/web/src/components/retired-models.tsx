import type { RetiredUsage, UsageKind } from "@app/slices/model-upkeep/model.js";
import { slotLabels } from "@app/slices/model-upkeep/model.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useApp } from "@/app-context";
import { Button } from "@/components/kit/button";
import { LinkedText } from "@/components/linked-text";
import { readRetired, switchRetired, upkeepKeys } from "@/components/provider-upkeep-api";
import { schedulesKey } from "@/schedules/api";
import { templatesKey } from "@/templates/api";

// The retired-model flag Settings → Models lists, shown on the row of the template or schedule
// that still picks the model, with the same one-click switch (`slices/model-upkeep/switch.ts`).
// A list row of its own under the item's row, so the item's actions stay as they are. Nothing
// shows while nothing it names is retired.
export function RetiredModelRow({
  kind,
  id,
  name,
}: {
  readonly kind: Extract<UsageKind, "template" | "schedule">;
  readonly id: string;
  readonly name: string;
}): ReactElement | null {
  const { api } = useApp();
  const cache = useQueryClient();
  const retired = useQuery({ queryKey: upkeepKeys.retired, queryFn: () => readRetired(api) });
  const one = useMutation({
    mutationFn: (usage: RetiredUsage) => switchRetired(api, usage),
    // A template's switch moves the schedules that run it, so both lists reload.
    onSuccess: () =>
      Promise.all([
        cache.invalidateQueries({ queryKey: upkeepKeys.retired }),
        cache.invalidateQueries({ queryKey: templatesKey }),
        cache.invalidateQueries({ queryKey: schedulesKey }),
      ]),
  });
  const usages = (retired.data ?? []).filter((usage) => usage.kind === kind && usage.id === id);
  if (usages.length === 0) return null;
  return (
    <li aria-label={`Retired models in ${name}`} className="flex flex-col gap-2 px-3 pb-3">
      {usages.map((usage) => (
        <div key={usage.key} className="flex flex-wrap items-center gap-2 text-small">
          <span className="text-waiting">
            {`${slotLabels[usage.slot]} ${usage.model} is ${usage.why === "retired" ? "retired" : "no longer listed"}.`}
            {usage.blocked === null ? "" : ` ${usage.blocked}`}
            {usage.replacement === null && usage.blocked === null ? (
              <LinkedText
                text={` No replacement is suggested: choose another model in Settings → Models, or edit the ${kind}.`}
              />
            ) : null}
          </span>
          {usage.replacement === null ? null : (
            <Button
              size="small"
              disabled={usage.blocked !== null || one.isPending}
              disabledReason={usage.blocked ?? "Switching…"}
              onClick={() => one.mutate(usage)}
            >
              {`Switch to ${usage.replacement.name}`}
            </Button>
          )}
        </div>
      ))}
      {one.error ? (
        <p role="alert" className="m-0 text-small text-danger">
          {`The model wasn't switched: ${one.error.message}`}
        </p>
      ) : null}
    </li>
  );
}
