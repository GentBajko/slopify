import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactElement, useState } from "react";
import { useApp } from "@/app-context";
import { Button } from "@/components/kit/button";
import { Field, Input } from "@/components/kit/field";
import { readStudioSettings, studioSettingsKey, writeStudioSettings } from "./api";

// Settings → Template studio: the most the studio's samples may spend in one day. A sample that
// would go over it waits, saying so, until the next day or a higher budget.
export function TemplateStudioSettings(): ReactElement {
  const { api } = useApp();
  const client = useQueryClient();
  const settings = useQuery({
    queryKey: studioSettingsKey,
    queryFn: () => readStudioSettings(api),
  });
  const [typed, setTyped] = useState<string | undefined>();
  const save = useMutation({
    mutationFn: (budget: number) => writeStudioSettings(api, budget),
    onSuccess: (next) => {
      client.setQueryData(studioSettingsKey, next);
      setTyped(undefined);
    },
  });
  if (settings.error)
    return (
      <p role="alert" className="m-0 text-body text-danger">
        {`The template studio's settings didn't load: ${settings.error.message} Reload the page to try again.`}
      </p>
    );
  const data = settings.data;
  if (data === undefined)
    return <div role="status" aria-busy="true" className="h-20 rounded-control bg-raised" />;
  const value = typed ?? data.dailyBudget.toFixed(2);
  const amount = Number(value.trim());
  const problem =
    value.trim() === "" || !Number.isFinite(amount) || amount < 0 || amount > 1000
      ? "Enter an amount between $0.00 and $1,000.00."
      : undefined;
  return (
    <Field
      label="Daily sample budget"
      tip="settings.template-studio.budget"
      help={`The most the studio's paid samples may spend in one day, in US dollars. Spent today: $${data.today.spent.toFixed(2)}; left: $${data.today.left.toFixed(2)}. A CLI plan's calls count as $0.`}
      error={problem ?? (save.error ? `The budget wasn't saved: ${save.error.message}` : undefined)}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-small text-ink-2">$</span>
        <Input
          type="number"
          inputMode="decimal"
          min={0}
          max={1000}
          step={0.5}
          className="w-[112px] tabular-nums"
          value={value}
          aria-invalid={problem !== undefined}
          onChange={(event) => setTyped(event.target.value)}
        />
        <Button
          variant="primary"
          disabled={problem !== undefined || save.isPending || typed === undefined}
          disabledReason={
            save.isPending ? "Saving" : typed === undefined ? "Nothing changed" : (problem ?? "")
          }
          onClick={() => save.mutate(amount)}
        >
          Save
        </Button>
      </div>
    </Field>
  );
}
