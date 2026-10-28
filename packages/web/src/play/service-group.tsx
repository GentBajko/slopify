import type { ProviderFamily, ProviderStatus } from "@app/slices/settings/model.js";
import { type ReactElement, type ReactNode, useId } from "react";
import { Button } from "@/components/kit/button";
import { HelpLine } from "@/components/kit/field";
import { helpScope } from "@/components/kit/info-tip";
import { providerUnavailableLabel } from "@/lib/provider-status";
import { cn } from "@/lib/utils";
import { SettingsLink } from "@/routes/settings-back";
import { ModelPicker, ProviderPicker, providerOptions } from "./pickers";

// Who does a stage, asked the same way on every row: a group named for the stage ("Written
// by", "Read by", "Images by") over two selects, Service and Model, then whatever else that
// stage picks (the voice, the thinking level). One quiet line under Model says whether the
// model works and links to Settings → Models; the upkeep buttons live there. When no service of
// the family can be used, one line under the group says so, with the way to fix it and, where
// the stage can be left out, the way to leave it out.

const words: Readonly<
  Record<ProviderFamily, { readonly group: string; readonly key: string; readonly none: string }>
> = {
  llm: { group: "Written by", key: "Set up an AI writer", none: "None of these is set up yet" },
  tts: { group: "Read by", key: "Add a voice key", none: "None of these has a key yet" },
  image: { group: "Images by", key: "Add an image key", none: "None of these has a key yet" },
};

export function ServiceGroup({
  family,
  label = words[family].group,
  meta,
  providers,
  provider,
  model,
  serviceField,
  modelField,
  serviceProblem,
  modelProblem,
  leaveOut,
  fillModel = false,
  className,
  onService,
  onModel,
  children,
}: {
  readonly family: ProviderFamily;
  // The group's name; the family's ("Read by") unless this one is for something else.
  readonly label?: string;
  // What the group is used for here, after its name: "for writing the article".
  readonly meta?: ReactNode;
  readonly providers: readonly ProviderStatus[];
  readonly provider: string;
  readonly model: string;
  readonly serviceField: string;
  readonly modelField: string;
  readonly serviceProblem: string | undefined;
  readonly modelProblem: string | undefined;
  // The stage's own way out when no service can be used: "Set Narration to Off".
  readonly leaveOut?: { readonly label: string; readonly onLeave: () => void } | undefined;
  // A service picked here takes its model by itself (see ModelPicker's fillEmpty).
  readonly fillModel?: boolean | undefined;
  readonly className?: string | undefined;
  readonly onService: (provider: string) => void;
  readonly onModel: (model: string) => void;
  // The stage's other choices, after Model: the voice, the thinking level.
  readonly children?: ReactNode;
}): ReactElement {
  const id = useId();
  const options = providerOptions(providers, family);
  const blocked = options.length > 0 && options.every((option) => option.disabled === true);
  // A saved or template's service that can't be used now ("OpenAI · No key") says so under the
  // group too, with the same way to fix it.
  const picked = providers.find((one) => one.id === provider && one.family === family);
  const refusal = picked === undefined ? undefined : providerUnavailableLabel(picked.readiness);
  const pickedProblem =
    picked === undefined || refusal === undefined
      ? undefined
      : refusal === "No key"
        ? `${picked.displayName} has no key yet`
        : `${picked.displayName}: ${refusal}`;
  return (
    // biome-ignore lint/a11y/useSemanticElements: a fieldset's legend would leave the field grid; the group is named by its visible label.
    <div
      role="group"
      aria-labelledby={id}
      className={cn("sl-fields__wide col-span-full sl-fields", className)}
      {...helpScope}
    >
      <span className="sl-fields__wide -mb-2 flex min-w-0 flex-wrap items-baseline gap-x-2">
        <span id={id} className="text-body font-semibold text-ink">
          {label}
        </span>
        {meta === undefined ? null : <span className="text-small text-ink-2">{meta}</span>}
      </span>
      <ProviderPicker
        field={serviceField}
        label="Service"
        group={id}
        family={family}
        providers={providers}
        value={provider}
        problem={serviceProblem}
        onPick={onService}
      />
      <ModelPicker
        field={modelField}
        label="Model"
        group={id}
        quiet
        fillEmpty={fillModel}
        provider={provider}
        value={model}
        problem={modelProblem}
        onPick={onModel}
      />
      {children}
      {blocked || pickedProblem !== undefined ? (
        <div className="sl-fields__wide flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <HelpLine>
            {blocked ? words[family].none : pickedProblem} ·{" "}
            <SettingsLink search={{ section: "providers", family }}>
              {words[family].key} ↗
            </SettingsLink>
            {leaveOut === undefined || !blocked ? null : " · or"}
          </HelpLine>
          {leaveOut === undefined || !blocked ? null : (
            <Button variant="quiet" size="small" onClick={leaveOut.onLeave}>
              {leaveOut.label}
            </Button>
          )}
        </div>
      ) : null}
    </div>
  );
}
