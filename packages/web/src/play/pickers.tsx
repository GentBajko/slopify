import type { ProviderFamily, ProviderStatus } from "@app/slices/settings/model.js";
import { type ReactNode, useId } from "react";
import { HelpLine, Select } from "@/components/kit/field";
import { helpScope, InfoTip } from "@/components/kit/info-tip";
import type { HelpId } from "@/help/catalog";
import { providerUnavailableLabel } from "@/lib/provider-status";

// The pickers Play draws over and over: a labelled control with its refusal underneath.
// Inside a stage rail the label sits before the control on one line, as the reference
// sheet draws it; on the cue sheet it sits above.

export interface FieldProps {
  readonly field?: string | undefined;
  readonly label: string;
  readonly value: string;
  readonly problem: string | undefined;
  // The info button beside the label, from the help catalogue.
  readonly tip?: HelpId | undefined;
  // One visible sentence under the control, where its label needs one, in place of the tip.
  readonly help?: ReactNode;
  // The id of the visible name of the group the control belongs to ("Read by"): the control
  // is named by both, "Read by Service", so two groups' Service selects are told apart.
  readonly group?: string | undefined;
  readonly onPick: (next: string) => void;
}

export function LabelledField({
  label,
  field,
  problem,
  tip,
  help,
  group,
  children,
}: {
  readonly field?: string | undefined;
  readonly label: string;
  readonly problem: string | undefined;
  readonly tip?: HelpId | undefined;
  // One visible sentence under the control, in place of an info button.
  readonly help?: ReactNode;
  readonly group?: string | undefined;
  readonly children: (props: {
    readonly id: string;
    readonly describedBy: string | undefined;
    readonly field: string | undefined;
    // "group-id label-id" when the field sits in a named group, else undefined.
    readonly labelledBy: string | undefined;
  }) => ReactNode;
}) {
  const fieldId = useId();
  const labelId = useId();
  const noteId = useId();

  const labelled = (
    <label id={labelId} htmlFor={fieldId} className="sl-field__label">
      {label}
    </label>
  );
  return (
    <div
      className="sl-field [&>span]:w-full [&>select]:w-full"
      {...(tip === undefined && help === undefined ? {} : helpScope)}
    >
      {/* The kit's field label and error, as Field draws them. */}
      {tip === undefined ? (
        labelled
      ) : (
        <span className="flex min-w-0 items-center gap-1">
          {labelled}
          <InfoTip id={tip} label={label} className="-my-1" />
        </span>
      )}
      {children({
        field,
        id: fieldId,
        describedBy: problem === undefined ? undefined : noteId,
        labelledBy: group === undefined ? undefined : `${group} ${labelId}`,
      })}
      {help === undefined ? null : <HelpLine>{help}</HelpLine>}
      {problem === undefined ? null : (
        <p id={noteId} className="sl-field__error m-0">
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
  field,
  value,
  problem,
  placeholder,
  options,
  disabled = false,
  tip,
  help,
  group,
  onPick,
}: FieldProps & {
  readonly placeholder: string;
  readonly options: readonly Option[];
  readonly disabled?: boolean | undefined;
}) {
  return (
    <LabelledField
      field={field}
      label={label}
      problem={problem}
      tip={tip}
      help={help}
      group={group}
    >
      {({ id, describedBy, labelledBy }) => (
        <Select
          id={id}
          data-play-field={field}
          value={value}
          disabled={disabled}
          aria-labelledby={labelledBy}
          aria-invalid={problem !== undefined}
          aria-describedby={describedBy}
          onChange={(event) => {
            onPick(event.target.value);
          }}
        >
          <option value="">{placeholder}</option>
          {value !== "" && !options.some((option) => option.value === value) ? (
            <option value={value}>{value} (saved choice)</option>
          ) : null}
          {options.map((option) => (
            <option key={option.value} value={option.value} disabled={option.disabled === true}>
              {option.label}
            </option>
          ))}
        </Select>
      )}
    </LabelledField>
  );
}

// Every supported provider is listed, and one that cannot be
// used is greyed with the reason beside its name rather than being hidden. The two
// reasons distinguish a stored-key problem, a missing executable, and an installed CLI that
// cannot satisfy the adapter contract.
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
  return providerUnavailableLabel(provider.readiness);
}

export function ProviderPicker({
  label,
  field,
  family,
  providers,
  value,
  problem,
  tip,
  group,
  onPick,
}: FieldProps & {
  readonly family: ProviderFamily;
  readonly providers: readonly ProviderStatus[];
}) {
  return (
    <OptionPicker
      field={field}
      label={label}
      value={value}
      problem={problem}
      tip={tip}
      group={group}
      placeholder="Pick a service"
      options={[
        ...(value !== "" && !providers.some((one) => one.id === value && one.family === family)
          ? [{ value, label: `${value} (saved service)`, disabled: true }]
          : []),
        ...providerOptions(providers, family),
      ]}
      onPick={onPick}
    />
  );
}

export { ModelPicker } from "./model-picker";
