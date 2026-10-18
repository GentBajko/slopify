import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactElement, useState } from "react";
import { useApp } from "@/app-context";
import { Button } from "@/components/kit/button";
import { Field, Input } from "@/components/kit/field";
import { Switch } from "@/components/kit/switch";
import type { HelpId } from "@/help/catalog";
import { usd } from "@/lib/format";
import {
  about,
  forAllKey,
  makeSamplesForAll,
  quoteSamplesForAll,
  readStudioSettings,
  type StudioSettingsChange,
  studioSettingsKey,
  writeStudioSettings,
} from "./api";

// Settings → Template studio: the most the studio's samples, and designed pieces' template
// samples, may spend in one day, in dollars, and whether they may run on a CLI plan at all. A sample that would go over either waits,
// saying so, until the next day, a higher budget or plans allowed.
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
  const save = useMutation({
    mutationFn: (settings: StudioSettingsChange) => writeStudioSettings(api, settings),
    onSuccess: (next) => client.setQueryData(studioSettingsKey, next),
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
  const unpriced =
    data.today.unpriced > 0
      ? ` plus ${String(data.today.unpriced)} ${data.today.unpriced === 1 ? "call" : "calls"} with no known price`
      : "";
  const saved = save.variables;
  return (
    <>
      <DailyBudget
        label="Daily sample budget"
        tip="settings.template-studio.budget"
        saveLabel="Save"
        help={`The most the studio's samples may spend in one day, in US dollars; at $0.00 no sample spends money. Spent today: ${usd(data.today.spent)}${unpriced}; left: ${usd(data.today.left)}.`}
        stored={data.dailyBudget}
        pending={save.isPending}
        error={
          save.error && saved?.dailyBudget !== undefined
            ? `The budget wasn't saved: ${save.error.message}`
            : undefined
        }
        onSave={(dailyBudget, done) => save.mutate({ dailyBudget }, { onSuccess: done })}
      />
      <DailyBudget
        label="Designed pieces: daily sample budget"
        tip="settings.template-studio.design-budget"
        saveLabel="Save designed pieces' budget"
        help={`The most the samples of designed-piece templates (Library → Designs) may spend in one day, in US dollars; at $0.00 no sample spends money.${data.designToday === undefined ? "" : ` Spent today: ${usd(data.designToday.spent)}; left: ${usd(data.designToday.left)}.`}`}
        stored={data.designDailyBudget}
        pending={save.isPending}
        error={
          save.error && saved?.designDailyBudget !== undefined
            ? `The designed pieces' budget wasn't saved: ${save.error.message}`
            : undefined
        }
        onSave={(designDailyBudget, done) =>
          save.mutate({ designDailyBudget }, { onSuccess: done })
        }
      />
      <div className="flex flex-col gap-1">
        <Switch
          label="Samples may use my CLI plans"
          tip="settings.template-studio.plans"
          checked={data.samplesUsePlans}
          disabled={save.isPending}
          onChange={(samplesUsePlans) =>
            save.mutate({ dailyBudget: data.dailyBudget, samplesUsePlans })
          }
        />
        <p className="m-0 text-small text-ink-2">
          {data.samplesUsePlans
            ? "On: samples, designed pieces' too, may run steps on your Claude Code or Codex plan. That usage has no dollar price, so the budgets above don't limit it."
            : "Off: no sample, designed pieces' included, runs a step on your Claude Code or Codex plan; such a sample waits until you turn this on."}
        </p>
      </div>
    </>
  );
}

// A dollar amount from $0 to $1,000 with its own Save, kept as typed until saved.
function DailyBudget(props: {
  readonly label: string;
  readonly tip: HelpId;
  readonly saveLabel: string;
  readonly help: string;
  readonly stored: number;
  readonly pending: boolean;
  readonly error: string | undefined;
  readonly onSave: (amount: number, done: () => void) => void;
}): ReactElement {
  const [typed, setTyped] = useState<string | undefined>();
  const value = typed ?? props.stored.toFixed(2);
  const amount = Number(value.trim());
  const problem =
    value.trim() === "" || !Number.isFinite(amount) || amount < 0 || amount > 1000
      ? "Enter an amount between $0.00 and $1,000.00."
      : undefined;
  return (
    <Field label={props.label} tip={props.tip} help={props.help} error={problem ?? props.error}>
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
          disabled={problem !== undefined || props.pending || typed === undefined}
          disabledReason={
            props.pending ? "Saving" : typed === undefined ? "Nothing changed" : (problem ?? "")
          }
          onClick={() => props.onSave(amount, () => setTyped(undefined))}
        >
          {props.saveLabel}
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
          ? "No sample fits today's budget or plan setting: change them above, or press this tomorrow"
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
