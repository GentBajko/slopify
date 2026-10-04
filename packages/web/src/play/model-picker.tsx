import type { ModelInfo } from "@app/kernel/ports/model.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { useId, useState } from "react";
import { useApp } from "@/app-context";
import { Button } from "@/components/kit/button";
import { Input, Select } from "@/components/kit/field";
import { modelOptionLabel } from "@/lib/model-label";
import { customModelFallback, listProviderModels, modelsKey, modelsQuery } from "@/lib/models";
import { cn } from "@/lib/utils";
import { type FieldProps, LabelledField } from "./pickers";

// More models than this and a filter box shows above the list (OpenRouter's live list).
const filterFrom = 12;

export function ModelPicker(props: FieldProps & { readonly provider: string }) {
  return <ProviderModelPicker key={props.provider} {...props} />;
}

function ProviderModelPicker({
  label,
  field,
  provider,
  value,
  problem,
  tip,
  onPick,
}: FieldProps & { readonly provider: string }) {
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
  const all = catalogue.data?.models ?? [];
  // A live list can run to hundreds of models; past a short list a filter box narrows the
  // select to the names typed, keeping the picked model in it.
  const [filter, setFilter] = useState("");
  const words = filter.trim().toLowerCase();
  const matches = (model: ModelInfo): boolean =>
    `${model.name} ${model.id} ${model.group ?? ""}`.toLowerCase().includes(words);
  const listed = words === "" ? all : all.filter((model) => model.id === value || matches(model));
  const noMatch = words !== "" && !all.some(matches);
  const groups = [...new Set(listed.flatMap((model) => (model.group ? [model.group] : [])))];
  const allowsCustom = catalogue.data?.allowsCustom ?? customModelFallback(provider);
  const typing = custom && allowsCustom;
  const refreshing = catalogue.isFetching || refresh.isPending;
  const warning = refresh.error?.message ?? catalogue.error?.message ?? catalogue.data?.warning;
  const selectedMissing = value !== "" && !all.some((model) => model.id === value);

  return (
    <div className="min-w-0 max-w-full">
      <LabelledField field={field} label={label} problem={problem} tip={tip}>
        {({ id, describedBy }) => {
          const described =
            [
              describedBy,
              warning ? noteId : undefined,
              catalogue.data?.notice ? noticeId : undefined,
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
                  aria-invalid={problem !== undefined}
                  aria-describedby={described}
                  onChange={(event) => onPick(event.target.value)}
                >
                  <option value="">
                    {provider === ""
                      ? "Pick a provider first"
                      : catalogue.isPending
                        ? "Loading models…"
                        : "Pick a model"}
                  </option>
                  {selectedMissing ? <option value={value}>{value} (saved model)</option> : null}
                  {listed
                    .filter((model) => !model.group)
                    .map((model) => (
                      <option key={model.id} value={model.id}>
                        {modelOptionLabel(model)}
                      </option>
                    ))}
                  {groups.map((group) => (
                    <optgroup key={group} label={group}>
                      {listed
                        .filter((model) => model.group === group)
                        .map((model) => (
                          <option key={model.id} value={model.id}>
                            {modelOptionLabel(model)}
                          </option>
                        ))}
                    </optgroup>
                  ))}
                </Select>
              )}
              {!typing && noMatch ? (
                <p className="m-0 mt-1 text-small text-ink-2">{`No model name contains "${filter.trim()}".`}</p>
              ) : null}
            </div>
          );
        }}
      </LabelledField>
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
      {catalogue.data?.notice ? (
        <p id={noticeId} className="mt-1 max-w-[360px] text-label text-ink-3">
          {catalogue.data.notice}
        </p>
      ) : null}
      {warning ? (
        <p id={noteId} className="mt-1 max-w-[360px] text-label text-ink-3" role="status">
          {warning}
        </p>
      ) : null}
    </div>
  );
}
