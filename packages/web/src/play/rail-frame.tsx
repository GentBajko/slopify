import type { StageKind } from "@app/kernel/pipeline.js";
import type { StageSource } from "@app/slices/admission/model.js";
import type { Prompt } from "@app/slices/library/model.js";
import type { ProviderStatus, Voice } from "@app/slices/settings/model.js";
import type { ReactNode } from "react";
import type { UploadKind } from "@/api";
import { StageGlyph } from "@/components/glyph";
import { cn } from "@/lib/utils";
import type { PlayFormState } from "@/play/state";
import { sourceOptions } from "@/play/state";
import { InlineSwitch } from "@/play/switches";

export const railControls = "col-span-3 grid min-w-0 grid-cols-1 gap-4 min-[700px]:grid-cols-2";
export const railBeneath = "col-span-3 min-w-0";

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
  readonly onReattachFile?: (kind: UploadKind, key: string, file: File) => void;
  readonly onRemoveFile: (kind: UploadKind, key: string) => void;
  readonly subtitleSession?: {
    readonly previewText: string;
    readonly fontUploading: boolean;
    readonly fontUpload: { readonly name: string } | null;
    readonly selectFont: (id: string) => void;
    readonly uploadSubtitleFont: (file: File) => Promise<void>;
  };
  readonly onSubtitleUpload?: (pending: boolean) => void;
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
    <section
      data-tour={`play-${kind}`}
      className="grid grid-cols-[24px_1fr_auto] items-center gap-x-2 gap-y-4 border-b border-line py-4 [&>div:empty]:hidden"
    >
      <StageGlyph kind={kind} className={dim ? "text-ink3" : "text-ink2"} />
      <h3 className={cn("text-row font-semibold", dim ? "text-ink3" : undefined)}>{name}</h3>
      {children}
    </section>
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
      field={`sources.${kind}`}
      label={`${kind} source`}
      hideLabel
      className="max-[700px]:col-span-3 max-[700px]:justify-self-start [&_[data-slot=toggle-group]]:flex-wrap"
      value={form.sources[kind]}
      options={sourceOptions(kind).map((option) => ({
        ...option,
        disabled: kind === "video" && option.value === "generate" && form.sources.images === "off",
      }))}
      onPick={(source) => {
        update({
          sources: {
            ...form.sources,
            [kind]: source,
            ...(kind === "images" && source === "off" ? { video: "off" as const } : {}),
          },
        });
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
