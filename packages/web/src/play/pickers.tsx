import type { ProviderFamily, ProviderStatus } from "@app/slices/settings/model.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { type ReactNode, useId, useState } from "react";
import { useApp } from "@/app-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Picker } from "@/components/ui/picker";
import { customModelFallback, listProviderModels, modelsKey, modelsQuery } from "@/lib/models";
import { cn } from "@/lib/utils";

// The pickers Play draws over and over: a labelled control with its refusal underneath.
// Inside a stage rail the label sits before the control on one line, as the reference
// sheet draws it; on the cue sheet it sits above.

export interface FieldProps {
  readonly label: string;
  readonly value: string;
  readonly problem: string | undefined;
  readonly inline?: boolean | undefined;
  readonly onPick: (next: string) => void;
}

export function LabelledField({
  label,
  problem,
  inline = false,
  children,
}: {
  readonly label: string;
  readonly problem: string | undefined;
  readonly inline?: boolean | undefined;
  readonly children: (props: {
    readonly id: string;
    readonly describedBy: string | undefined;
  }) => ReactNode;
}) {
  const fieldId = useId();
  const noteId = useId();

  return (
    <div className={cn(inline ? "flex min-w-0 max-w-full items-center gap-[10px]" : "min-w-0")}>
      <Label htmlFor={fieldId} className={inline ? "shrink-0" : "mb-[5px]"}>
        {label}
      </Label>
      {children({ id: fieldId, describedBy: problem === undefined ? undefined : noteId })}
      {problem === undefined ? null : (
        <p id={noteId} className={cn("text-label text-red", inline ? "" : "mt-1")}>
          {problem}
        </p>
      )}
    </div>
  );
}

export interface Option {
  readonly value: string;
  readonly label: string;
  readonly disabled?: boolean | undefined;
}

export function OptionPicker({
  label,
  value,
  problem,
  inline,
  placeholder,
  options,
  disabled = false,
  onPick,
}: FieldProps & {
  readonly placeholder: string;
  readonly options: readonly Option[];
  readonly disabled?: boolean | undefined;
}) {
  return (
    <LabelledField label={label} problem={problem} inline={inline}>
      {({ id, describedBy }) => (
        <Picker
          id={id}
          value={value}
          disabled={disabled}
          aria-invalid={problem !== undefined}
          aria-describedby={describedBy}
          className={inline === true ? "w-auto min-w-[120px]" : undefined}
          onChange={(event) => {
            onPick(event.target.value);
          }}
        >
          <option value="">{placeholder}</option>
          {options.map((option) => (
            <option key={option.value} value={option.value} disabled={option.disabled === true}>
              {option.label}
            </option>
          ))}
        </Picker>
      )}
    </LabelledField>
  );
}

// Every supported provider is listed, and one that cannot be
// used is greyed with the reason beside its name rather than being hidden. The two
// reasons are the two ways a provider is authorised - a stored key, or the CLI's own
// login - so they read "Key missing" and "CLI missing".
export function providerOptions(
  providers: readonly ProviderStatus[],
  family: ProviderFamily,
): readonly Option[] {
  return providers
    .filter((provider) => provider.family === family)
    .map((provider) => {
      const refusal = refusalOf(provider);
      return {
        value: provider.id,
        label:
          refusal === undefined ? provider.displayName : `${provider.displayName} · ${refusal}`,
        disabled: refusal !== undefined,
      };
    });
}

function refusalOf(provider: ProviderStatus): string | undefined {
  const { readiness } = provider;
  if (readiness.kind === "cli") {
    return readiness.installed ? undefined : "CLI missing";
  }
  return readiness.hasKey ? undefined : "Key missing";
}

export function ProviderPicker({
  label,
  family,
  providers,
  value,
  problem,
  inline,
  onPick,
}: FieldProps & {
  readonly family: ProviderFamily;
  readonly providers: readonly ProviderStatus[];
}) {
  return (
    <OptionPicker
      label={label}
      value={value}
      problem={problem}
      inline={inline}
      placeholder="Pick a provider"
      options={providerOptions(providers, family)}
      onPick={onPick}
    />
  );
}

export function ModelPicker(props: FieldProps & { readonly provider: string }) {
  return <ProviderModelPicker key={props.provider} {...props} />;
}

function ProviderModelPicker({
  label,
  provider,
  value,
  problem,
  inline,
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
  const listed = catalogue.data?.models ?? [];
  const allowsCustom = catalogue.data?.allowsCustom ?? customModelFallback(provider);
  const typing = custom && allowsCustom;
  const refreshing = catalogue.isFetching || refresh.isPending;
  const warning = refresh.error?.message ?? catalogue.error?.message ?? catalogue.data?.warning;
  const selectedMissing = value !== "" && !listed.some((model) => model.id === value);

  return (
    <div className="min-w-0 max-w-full">
      <LabelledField label={label} problem={problem} inline={inline}>
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
            <div className={cn("min-w-0 [&>span]:w-full", inline ? "max-w-[260px]" : "w-full")}>
              {typing ? (
                <Input
                  id={id}
                  value={value}
                  spellCheck={false}
                  placeholder="Type the model id"
                  aria-invalid={problem !== undefined}
                  aria-describedby={described}
                  className={inline ? "w-[180px] max-w-full" : undefined}
                  onChange={(event) => onPick(event.target.value)}
                />
              ) : (
                <Picker
                  id={id}
                  value={value}
                  disabled={provider === ""}
                  aria-invalid={problem !== undefined}
                  aria-describedby={described}
                  className={inline ? "w-full min-w-[120px] max-w-[260px]" : undefined}
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
                  {listed.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.name}
                    </option>
                  ))}
                </Picker>
              )}
            </div>
          );
        }}
      </LabelledField>
      {provider !== "" ? (
        <div className="mt-1 flex flex-wrap items-center gap-1">
          <Button
            type="button"
            variant="ghost"
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
              variant="ghost"
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
        <p id={noticeId} className="mt-1 max-w-[360px] text-label text-ink3">
          {catalogue.data.notice}
        </p>
      ) : null}
      {warning ? (
        <p id={noteId} className="mt-1 max-w-[360px] text-label text-ink3" role="status">
          {warning}
        </p>
      ) : null}
    </div>
  );
}
