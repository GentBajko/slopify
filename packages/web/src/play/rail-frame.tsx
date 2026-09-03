import type { StageKind } from "@app/kernel/pipeline.js";
import type { StageSource } from "@app/slices/admission/model.js";
import type { Prompt } from "@app/slices/library/model.js";
import type { ProviderStatus, Voice } from "@app/slices/settings/model.js";
import type { ReactNode } from "react";
import type { UploadKind } from "@/api";
import { StageGlyph } from "@/components/glyph";
import { Lamp } from "@/components/lamp";
import { Rail } from "@/components/rail";
import { cn } from "@/lib/utils";
import type { PlayFormState } from "@/play/state";
import { sourceOptions } from "@/play/state";
import { InlineSwitch } from "@/play/switches";

// One rail's furniture, shared by the six stages: the reference sheet's five-column grid
// - lamp, glyph, name, source switch, controls - the second row a Provide opens beneath
// it, and the switch itself. It lives apart from the rails that use it so neither the
// plain stages nor the two that carry a provider and a list grow past a screenful.

export const railGrid = "grid grid-cols-[14px_24px_110px_auto_minmax(0,1fr)]";
export const railControls = "col-start-5 flex flex-wrap items-center justify-end gap-[10px]";
export const railBeneath = "col-span-4 col-start-2 mt-[10px]";

export interface RailProps {
  readonly form: PlayFormState;
  readonly providers: readonly ProviderStatus[];
  readonly prompts: readonly Prompt[];
  readonly voices: readonly Voice[];
  readonly silenceGapSeconds: number;
  // The sentence to put under a control, when the shared admission rule or the server's
  // own refusal named it.
  readonly problem: (field: string) => string | undefined;
  readonly update: (patch: Partial<PlayFormState>) => void;
  readonly onPickFiles: (kind: UploadKind, files: readonly File[]) => void;
  readonly onRemoveFile: (kind: UploadKind, key: string) => void;
}

export function StageRail({
  kind,
  name,
  dim,
  children,
}: {
  readonly kind: StageKind;
  readonly name: string;
  readonly dim: boolean;
  readonly children: ReactNode;
}) {
  return (
    <Rail className={railGrid}>
      {/* Unlit: no stage has run yet, and the lamp is here so the rail reads the same
          before and after Play. */}
      <Lamp state="pending" />
      <StageGlyph kind={kind} className={dim ? "text-ink3" : "text-ink2"} />
      <span className={cn("font-semibold", dim ? "text-ink3" : undefined)}>{name}</span>
      {children}
    </Rail>
  );
}

// The switch offers exactly what `slices/admission/rules.ts` allows for that stage, so a
// source the server would refuse cannot be pressed here.
export function SourceSwitch({
  kind,
  form,
  update,
}: {
  readonly kind: StageKind;
  readonly form: PlayFormState;
  readonly update: (patch: Partial<PlayFormState>) => void;
}) {
  return (
    <InlineSwitch<StageSource>
      label={`${kind} source`}
      hideLabel
      value={form.sources[kind]}
      options={sourceOptions(kind)}
      onPick={(source) => {
        update({ sources: { ...form.sources, [kind]: source } });
      }}
    />
  );
}

export function promptNames(
  prompts: readonly Prompt[],
  kind: Prompt["kind"],
): readonly { readonly value: string; readonly label: string }[] {
  return prompts
    .filter((prompt) => prompt.kind === kind)
    .map((prompt) => ({ value: prompt.name, label: prompt.name }));
}
