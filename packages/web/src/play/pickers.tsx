import type { ProviderFamily, ProviderStatus } from "@app/slices/settings/model.js";
import { type ReactNode, useId } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Picker } from "@/components/ui/picker";
import { modelsOf } from "@/lib/models";
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
    <div className={cn(inline ? "flex items-center gap-[10px]" : "min-w-0")}>
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

// The provider's own list is what should fill this, but the app exposes none, so the models
// the registry ships are offered and anything else is typed: OpenRouter's catalogue is
// fetched per call and runs to thousands of entries, so it has no list to draw. See
// lib/models.ts for the ceiling and its upgrade.
export function ModelPicker({
  label,
  provider,
  value,
  problem,
  inline,
  onPick,
}: FieldProps & { readonly provider: string }) {
  const listed = modelsOf(provider);

  if (provider !== "" && listed.length === 0) {
    return (
      <LabelledField label={label} problem={problem} inline={inline}>
        {({ id, describedBy }) => (
          <Input
            id={id}
            value={value}
            spellCheck={false}
            placeholder="Type the model id"
            aria-invalid={problem !== undefined}
            aria-describedby={describedBy}
            className={inline === true ? "w-[180px]" : undefined}
            onChange={(event) => {
              onPick(event.target.value);
            }}
          />
        )}
      </LabelledField>
    );
  }

  return (
    <OptionPicker
      label={label}
      value={value}
      problem={problem}
      inline={inline}
      placeholder={provider === "" ? "Pick a provider first" : "Pick a model"}
      options={listed.map((model) => ({ value: model.id, label: model.name }))}
      disabled={provider === ""}
      onPick={onPick}
    />
  );
}
