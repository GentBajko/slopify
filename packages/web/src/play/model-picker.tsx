import type { ModelInfo } from "@app/kernel/ports/model.js";
import type { ModelStandingView } from "@app/slices/model-checks/model.js";
import { badgeOf, pickerEntries } from "@app/slices/model-checks/rules.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { useId, useState } from "react";
import { useApp } from "@/app-context";
import { Button } from "@/components/kit/button";
import { HelpLine, Input, Select } from "@/components/kit/field";
import { TextLink } from "@/components/kit/link";
import { estimateChecks } from "@/lib/model-checks";
import { modelOptionLabel } from "@/lib/model-label";
import { customModelFallback, listProviderModels, modelsKey, modelsQuery } from "@/lib/models";
import { useCheckModels } from "@/lib/use-check-models";
import { cn } from "@/lib/utils";
import { type FieldProps, LabelledField } from "./pickers";

// The line under the select: the chosen model's badge once something is known about it, or
// "Not checked yet." while nothing works for the key yet.
function statusOf(view: ModelStandingView | undefined, fallback: boolean, now: Date): string {
  const known =
    view !== undefined &&
    (view.standing === "works" || view.standing === "no-access" || view.retiring !== undefined);
  if (known) return badgeOf(view, now);
  if (fallback) return "Not checked yet.";
  return view === undefined ? "" : badgeOf(view, now);
}

// The same, said as a plain phrase for the quiet picker's one line: "Works · checked 18 min
// ago", "Not on your plan", "Not checked yet".
export function modelStatusWords(
  view: ModelStandingView | undefined,
  fallback: boolean,
  now: Date,
): string {
  const badge = statusOf(view, fallback, now)
    .replace(/^[✓?✕⚠]\s*/u, "")
    .replace(/\.$/, "")
    .replace(/^not checked$/, "not checked yet");
  return badge === "" ? "" : `${badge.charAt(0).toUpperCase()}${badge.slice(1)}`;
}

// More models than this and a filter box shows above the list (OpenRouter's live list).
const filterFrom = 12;

// The two entries a quiet picker's list ends with, standing in for the buttons the full one
// draws: they change the list, they are never a model.
const showMore = "::show-all";
const typeId = "::type-id";

export function ModelPicker(
  props: FieldProps & {
    readonly provider: string;
    // Create's one-line form: the select, then one line with the chosen model's state and a
    // link to Settings → Models, where Refresh and Check live. Show all and typing a model id
    // are the list's last two entries. Without it every upkeep button sits under the select.
    readonly quiet?: boolean | undefined;
  },
) {
  return <ProviderModelPicker key={props.provider} {...props} />;
}

function ProviderModelPicker({
  label,
  field,
  provider,
  value,
  problem,
  tip,
  group,
  quiet = false,
  onPick,
}: FieldProps & { readonly provider: string; readonly quiet?: boolean | undefined }) {
  const { api } = useApp();
  const client = useQueryClient();
  const catalogue = useQuery(modelsQuery(api, provider));
  const [custom, setCustom] = useState(false);
  const noteId = useId();
  const noticeId = useId();
  const refresh = useMutation({
    mutationFn: () => listProviderModels(api, provider, true),
    onSuccess: (next) => client.setQueryData(modelsKey(provider), next),
  });
  const every = catalogue.data?.models ?? [];
  const standings = catalogue.data?.standings;
  // By default only the models that work for the person's key or CLI, plus the one chosen;
  // before anything works, the listed then the known ones. Show all brings back the rest.
  const [showAll, setShowAll] = useState(false);
  const shown = pickerEntries(every, standings, value, showAll || standings === undefined);
  const all = shown.entries.map((entry) => entry.model);
  const now = new Date();
  const labelOf = (model: ModelInfo): string => {
    const label = modelOptionLabel(model);
    return standings === undefined || quiet
      ? label
      : `${label} · ${badgeOf(standings[model.id], now)}`;
  };
  const checks = useCheckModels(provider, "");
  const checkOne = standings !== undefined && value !== "" && !shown.fallback;
  // What checking the chosen model costs, said on its Check button before it is pressed.
  const estimate = useQuery({
    queryKey: ["model-check-estimate", provider, value],
    queryFn: ({ signal }) => estimateChecks(api, provider, [value], signal),
    enabled: checkOne && !quiet,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  // A live list can run to hundreds of models; past a short list a filter box narrows the
  // select to the names typed, keeping the picked model in it.
  const [filter, setFilter] = useState("");
  const words = filter.trim().toLowerCase();
  const matches = (model: ModelInfo): boolean =>
    `${model.name} ${model.id} ${model.group ?? ""}`.toLowerCase().includes(words);
  const listed = words === "" ? all : all.filter((model) => model.id === value || matches(model));
  const noMatch = words !== "" && !all.some(matches);
  const chosenView: ModelStandingView | undefined =
    standings !== undefined && value !== "" && Object.hasOwn(standings, value)
      ? standings[value]
      : undefined;
  const groups = [...new Set(listed.flatMap((model) => (model.group ? [model.group] : [])))];
  const allowsCustom = catalogue.data?.allowsCustom ?? customModelFallback(provider);
  const typing = custom && allowsCustom;
  const refreshing = catalogue.isFetching || refresh.isPending;
  const warning = refresh.error?.message ?? catalogue.error?.message ?? catalogue.data?.warning;
  const selectedMissing = value !== "" && !every.some((model) => model.id === value);
  const status =
    standings === undefined || value === ""
      ? ""
      : [
          modelStatusWords(chosenView, shown.fallback, now),
          chosenView?.standing === "no-access" ? (chosenView.sentence ?? undefined) : undefined,
        ]
          .filter((part) => part !== undefined && part !== "")
          .join(". ");

  return (
    <div className="min-w-0 max-w-full">
      <LabelledField field={field} label={label} problem={problem} tip={tip} group={group}>
        {({ id, describedBy, labelledBy }) => {
          const described =
            [
              describedBy,
              warning ? noteId : undefined,
              catalogue.data?.notice && !quiet ? noticeId : undefined,
            ]
              .filter(Boolean)
              .join(" ") || undefined;
          return (
            <div className={cn("min-w-0 [&>span]:w-full [&>select]:w-full", "w-full")}>
              {!typing && all.length > filterFrom ? (
                <Input
                  type="search"
                  aria-label={`Filter ${label} list`}
                  placeholder={`Filter ${String(all.length)} models by name`}
                  value={filter}
                  onChange={(event) => setFilter(event.target.value)}
                  className="mb-2 text-small"
                />
              ) : null}
              {typing ? (
                <Input
                  id={id}
                  data-play-field={field}
                  value={value}
                  spellCheck={false}
                  placeholder="Type the model id"
                  aria-labelledby={labelledBy}
                  aria-invalid={problem !== undefined}
                  aria-describedby={described}
                  onChange={(event) => onPick(event.target.value)}
                />
              ) : (
                <Select
                  id={id}
                  data-play-field={field}
                  value={value}
                  disabled={provider === ""}
                  aria-labelledby={labelledBy}
                  aria-invalid={problem !== undefined}
                  aria-describedby={described}
                  onChange={(event) => {
                    const next = event.target.value;
                    if (next === showMore) setShowAll(true);
                    else if (next === typeId) setCustom(true);
                    else onPick(next);
                  }}
                >
                  <option value="">
                    {provider === ""
                      ? quiet
                        ? "Pick a service first"
                        : "Pick a provider first"
                      : catalogue.isPending
                        ? "Loading models…"
                        : "Pick a model"}
                  </option>
                  {selectedMissing ? <option value={value}>{value} (saved model)</option> : null}
                  {listed
                    .filter((model) => !model.group)
                    .map((model) => (
                      <option key={model.id} value={model.id}>
                        {labelOf(model)}
                      </option>
                    ))}
                  {groups.map((group) => (
                    <optgroup key={group} label={group}>
                      {listed
                        .filter((model) => model.group === group)
                        .map((model) => (
                          <option key={model.id} value={model.id}>
                            {labelOf(model)}
                          </option>
                        ))}
                    </optgroup>
                  ))}
                  {quiet && !showAll && shown.hidden > 0 ? (
                    <option value={showMore}>{`Show ${String(shown.hidden)} more models…`}</option>
                  ) : null}
                  {quiet && allowsCustom && provider !== "" ? (
                    <option value={typeId}>Type a model ID…</option>
                  ) : null}
                </Select>
              )}
              {!typing && noMatch ? (
                <p className="m-0 mt-1 text-small text-ink-2">{`No model name contains "${filter.trim()}".`}</p>
              ) : null}
            </div>
          );
        }}
      </LabelledField>
      {quiet ? (
        <>
          {typing ? (
            <Button
              type="button"
              variant="quiet"
              size="small"
              className="mt-1"
              onClick={() => setCustom(false)}
            >
              Pick from the list
            </Button>
          ) : null}
          {provider === "" ? null : (
            <HelpLine className="mt-1">
              {status === "" ? null : <>{status} · </>}
              <TextLink to="/settings" search={{ section: "models" }}>
                Manage models ↗
              </TextLink>
            </HelpLine>
          )}
        </>
      ) : (
        <>
          {provider !== "" ? (
            <div className="mt-1 flex flex-wrap items-center gap-1">
              <Button
                type="button"
                variant="quiet"
                className="px-2 text-label"
                aria-label={`Refresh ${label} list`}
                title="Refresh models"
                disabled={refreshing}
                onClick={() => refresh.mutate()}
              >
                <RefreshCw
                  aria-hidden="true"
                  className={cn("size-3", refreshing && "animate-spin motion-reduce:animate-none")}
                />
                Refresh
              </Button>
              {standings !== undefined ? (
                <Button
                  type="button"
                  variant="quiet"
                  className="px-2 text-label"
                  aria-label={
                    showAll
                      ? `Show only working models for ${label}`
                      : `Show all models for ${label}`
                  }
                  aria-pressed={showAll}
                  disabled={!showAll && shown.hidden === 0}
                  onClick={() => setShowAll(!showAll)}
                >
                  {showAll
                    ? "Show fewer"
                    : shown.hidden === 0
                      ? "Show all"
                      : `Show all (${String(shown.hidden)} more)`}
                </Button>
              ) : null}
              {allowsCustom ? (
                <Button
                  type="button"
                  variant="quiet"
                  className="px-2 text-label"
                  aria-label={typing ? `Choose ${label} from list` : `Enter ${label} ID`}
                  onClick={() => setCustom(!typing)}
                >
                  {typing ? "Use list" : "Custom ID"}
                </Button>
              ) : null}
            </div>
          ) : null}
          {standings !== undefined ? (
            <p
              className="m-0 mt-1 flex min-h-6 max-w-[360px] flex-wrap items-center gap-1 text-label text-ink-3"
              role="status"
            >
              <span>{statusOf(chosenView, shown.fallback, now)}</span>
              {chosenView?.standing === "no-access" && chosenView.sentence !== null ? (
                <span>{chosenView.sentence}</span>
              ) : null}
              <Button
                type="button"
                variant="quiet"
                className="px-2 text-label"
                disabled={checks.pending || (value === "" && every.length === 0)}
                onClick={() => checks.check(checkOne ? [value] : undefined)}
              >
                {!checkOne
                  ? "Check models"
                  : estimate.data === undefined
                    ? "Check"
                    : `Check · ${estimate.data.text}`}
              </Button>
              {checks.message === undefined ? null : <span>{checks.message}</span>}
            </p>
          ) : null}
          {checks.dialog}
          {catalogue.data?.notice ? (
            <p id={noticeId} className="mt-1 max-w-[360px] text-label text-ink-3">
              {catalogue.data.notice}
            </p>
          ) : null}
        </>
      )}
      {warning ? (
        <p id={noteId} className="mt-1 max-w-[360px] text-label text-ink-3" role="status">
          {warning}
        </p>
      ) : null}
    </div>
  );
}
