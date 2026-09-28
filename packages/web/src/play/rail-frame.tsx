import type { StageKind } from "@app/kernel/pipeline.js";
import type { StageSource } from "@app/slices/admission/model.js";
import type { Prompt } from "@app/slices/library/model.js";
import type { ProviderStatus, Voice } from "@app/slices/settings/model.js";
import type { ReactNode } from "react";
import { StageGlyph } from "@/components/glyph";
import type { HelpId } from "@/help/catalog";
import { cn } from "@/lib/utils";
import type { PlayFormState, UploadSlot } from "@/play/state";
import { sourceOptions } from "@/play/state";
import { InlineSwitch } from "@/play/switches";

// A section's fields: the kit's field grid (`.sl-fields`, labels above, equal columns).
export const railControls = "col-span-3 min-w-0 sl-fields";
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
  readonly onPickFiles: (kind: UploadSlot, files: readonly File[]) => void;
  readonly onReattachFile?: (kind: UploadSlot, key: string, file: File) => void;
  readonly onRemoveFile: (kind: UploadSlot, key: string) => void;
  readonly subtitleSession?: {
    readonly previewText: string;
    readonly fontUploading: boolean;
    readonly fontUpload: { readonly name: string } | null;
    readonly selectFont: (id: string) => void;
    readonly uploadSubtitleFont: (file: File) => Promise<void>;
  };
  readonly onSubtitleUpload?: (pending: boolean) => void;
  // False when the rail is the setup row itself, which already names the stage.
  readonly titled?: boolean | undefined;
}

// One stage inside a setup row's editor. A stage that is the row itself (Article under
// Article, Audio under Narration) is untitled: the row already names it, so the source switch
// sits under a plain Source label instead of a second heading.
export function StageRail({
  kind,
  name,
  dim,
  titled = true,
  children,
}: {
  readonly kind: StageKind;
  readonly name: string;
  readonly dim: boolean;
  readonly titled?: boolean | undefined;
  readonly children: ReactNode;
}) {
  return (
    <section
      data-tour={`play-${kind}`}
      className="grid grid-cols-[24px_1fr_auto] items-center gap-x-2 gap-y-4 border-b border-line py-4 [&>div:empty]:hidden"
    >
      {titled ? (
        <>
          <StageGlyph kind={kind} className={dim ? "text-ink-3" : "text-ink-2"} />
          <h3 className={cn("m-0 text-title-3", dim ? "text-ink-3" : undefined)}>{name}</h3>
        </>
      ) : (
        <span className="sl-field__label col-span-2">Source</span>
      )}
      {children}
    </section>
  );
}

const sourceTips = {
  research: "play.source.research",
  article: "play.source.article",
  audio: "play.source.audio",
  images: "play.source.images",
  thumbnail: "play.source.thumbnail",
  video: "play.source.video",
  document: "play.source.document",
} as const satisfies Readonly<Record<StageKind, HelpId>>;

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
      tip={sourceTips[kind]}
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
