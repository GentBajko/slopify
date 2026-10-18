import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactElement, useState } from "react";
import { useApp } from "@/app-context";
import { Button } from "@/components/kit/button";
import { Field, Input } from "@/components/kit/field";
import {
  about,
  forAllKey,
  makeSamplesForAll,
  quoteSamplesForAll,
  readStudioSettings,
  studioSettingsKey,
  writeStudioSettings,
} from "./api";

// Settings → Template studio: the most the studio's samples may spend in one day. A sample that
// would go over it waits, saying so, until the next day or a higher budget.
export function TemplateStudioSettings(): ReactElement {
  return (
    <div className="flex flex-col gap-6">
      <BudgetField />
      <SamplesForAll />
    </div>
  );
}

function BudgetField(): ReactElement {
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

// Make samples for all: the total first, priced when the section opens (it costs nothing),
// then one press queues every sample that fits today's budget; the rest wait, saying so.
function SamplesForAll(): ReactElement {
  const { api } = useApp();
  const client = useQueryClient();
  const quote = useQuery({
    queryKey: forAllKey,
    queryFn: () => quoteSamplesForAll(api),
    staleTime: 60_000,
  });
  const [acceptUnknown, setAcceptUnknown] = useState(false);
  const [note, setNote] = useState<{ readonly error: boolean; readonly text: string }>();
  const make = useMutation({
    mutationFn: (total: number) =>
      makeSamplesForAll(api, { acknowledgedTotal: total, acknowledgedUnknown: acceptUnknown }),
    onSuccess: async (reply) => {
      if (reply.ok)
        setNote({
          error: false,
          text: `Queued ${String(reply.queued)} ${reply.queued === 1 ? "sample" : "samples"}${reply.held > 0 ? `; ${String(reply.held)} wait, as each template's studio says` : ""}. They are made one at a time in the background.`,
        });
      else {
        setNote({ error: true, text: reply.message });
        if (reply.quote !== null) client.setQueryData(forAllKey, reply.quote);
      }
      if (reply.ok) await client.invalidateQueries({ queryKey: ["template-studio"] });
    },
    onError: (error) =>
      setNote({
        error: true,
        text: `The samples weren't asked for: ${error.message} Press Make samples for all again.`,
      }),
  });
  if (quote.error)
    return (
      <p role="alert" className="m-0 text-body text-danger">
        {`The samples for all couldn't be priced: ${quote.error.message} Reload the page to try again.`}
      </p>
    );
  const data = quote.data;
  const unknown = data?.items.some((item) => item.unknown > 0 && item.fits) ?? false;
  const reason =
    data === undefined
      ? "Pricing every template's sample"
      : data.items.length === 0
        ? "Every template's sample is made for its newest version"
        : data.fitting === 0
          ? "Today's sample budget is used up: raise it above, or press this tomorrow"
          : make.isPending
            ? "Asking for the samples"
            : undefined;
  return (
    <section aria-label="Samples for all templates" className="flex flex-col gap-2">
      <h3 className="m-0 text-body font-medium text-ink">Samples for all templates</h3>
      <p className="m-0 text-small text-ink-2">
        {data === undefined ? "Pricing the sample of every template…" : data.sentence}
      </p>
      {unknown ? (
        <label className="flex items-center gap-2 text-small text-ink-2">
          <input
            type="checkbox"
            checked={acceptUnknown}
            onChange={(event) => setAcceptUnknown(event.target.checked)}
          />
          Accept steps with no known price
        </label>
      ) : null}
      <div>
        <Button
          variant="secondary"
          disabled={reason !== undefined}
          disabledReason={reason}
          focusableWhenDisabled
          onClick={() => data !== undefined && make.mutate(data.total)}
        >
          {data === undefined || data.items.length === 0
            ? "Make samples for all"
            : `Make samples for all · ${about(data.total)}`}
        </Button>
      </div>
      {note === undefined ? null : (
        <p
          role={note.error ? "alert" : "status"}
          className={note.error ? "m-0 text-small text-danger" : "m-0 text-small text-ink-2"}
        >
          {note.text}
        </p>
      )}
    </section>
  );
}
