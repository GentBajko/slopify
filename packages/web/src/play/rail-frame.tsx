import type { StageKind } from "@app/kernel/pipeline.js";
import type { StageSource } from "@app/slices/admission/model.js";
import type { Prompt } from "@app/slices/library/model.js";
import type { ProviderStatus, Voice } from "@app/slices/settings/model.js";
import { createContext, type ReactNode, useContext, useId } from "react";
import { StageGlyph } from "@/components/glyph";
import { HelpLine } from "@/components/kit/field";
import { helpScope } from "@/components/kit/info-tip";
import { stageWords } from "@/lib/stage-words";
import type { PlayFormState, UploadSlot } from "@/play/state";
import { sourceOptions } from "@/play/state";
import { InlineSwitch } from "@/play/switches";

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

// The id of the visible name a stage's switch is labelled by: its rail's name, or the tick of
// the output it belongs to.
export const RailName = createContext<string | undefined>(undefined);

// One stage inside a setup row's editor: its name, then its switch on the same line, saying in
// the stage's own words what each choice makes and what it costs, then one sentence where the
// switch needs one, then the stage's settings. A stage that is the row itself (Article under
// Article, Narration under Narration) names itself as a field label rather than a heading.
export function StageRail({
  kind,
  name,
  dim,
  titled = true,
  bare = false,
  source,
  note,
  children,
}: {
  readonly kind: StageKind;
  readonly name: string;
  readonly dim: boolean;
  readonly titled?: boolean | undefined;
  // No name and no switch: only the stage's settings (RailProps `bare`).
  readonly bare?: boolean | undefined;
  // The stage's switch: SourceSwitch, or the article's own.
  readonly source: ReactNode;
  // One short sentence under the switch, saying what the picked choice does where its label
  // cannot.
  readonly note?: ReactNode;
  readonly children?: ReactNode;
}) {
  const nameId = useId();
  return (
    <section
      data-tour={`play-${kind}`}
      className="flex min-w-0 flex-col gap-4 border-b border-line py-4 last:border-b-0 [&>div:empty]:hidden"
    >
      {bare ? null : (
        <div
          className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2"
          {...(note === undefined || note === null ? {} : helpScope)}
        >
          {titled ? (
            <>
              {/* The name stays in full ink while the stage is off: a grey name beside its glyph
                  (Research's magnifier) read as an empty search box. The switch says Off. */}
              <StageGlyph kind={kind} className={dim ? "text-ink-3" : "text-ink-2"} />
              <h3 id={nameId} className="m-0 text-title-3">
                {name}
              </h3>
            </>
          ) : (
            <span id={nameId} className="sl-field__label">
              {name}
            </span>
          )}
          <RailName.Provider value={nameId}>{source}</RailName.Provider>
          {note === undefined || note === null ? null : (
            <HelpLine className="basis-full">{note}</HelpLine>
          )}
        </div>
      )}
      {children}
    </section>
  );
}

// The id a stage's switch is labelled by: its rail's visible name.
export function useRailName(): string | undefined {
  return useContext(RailName);
}

// A stage's switch may wrap onto a second line. On a phone its choices then stand as separate
// boxes that share each line between them, so a wrapped strip never leaves an empty cell
// inside one border.
export const switchWrap = [
  "max-w-full [&_[data-slot=toggle-group]]:flex-wrap",
  "max-[767px]:[&_[data-slot=toggle-group]]:gap-1 max-[767px]:[&_[data-slot=toggle-group]]:overflow-visible max-[767px]:[&_[data-slot=toggle-group]]:border-0",
  "max-[767px]:[&_[data-slot=toggle-group-item]]:grow max-[767px]:[&_[data-slot=toggle-group-item]]:rounded-control max-[767px]:[&_[data-slot=toggle-group-item]]:border max-[767px]:[&_[data-slot=toggle-group-item]]:last:border-r",
].join(" ");

// The switch offers exactly what `slices/admission/rules.ts` allows for that stage, so a
// source the server would refuse cannot be pressed here. With `without` a choice that another
// control already makes is left off (the Outputs tick is the thumbnail's None).
export function SourceSwitch({
  kind,
  form,
  update,
  without,
}: {
  readonly kind: StageKind;
  readonly form: PlayFormState;
  readonly update: (patch: Partial<PlayFormState>) => void;
  readonly without?: StageSource | undefined;
}) {
  const labelledBy = useRailName();
  return (
    <InlineSwitch<StageSource>
      field={`sources.${kind}`}
      label={stageWords[kind]}
      labelledBy={labelledBy}
      className={switchWrap}
      value={form.sources[kind]}
      options={sourceOptions(kind, form.sources.audio !== "off")
        .filter((option) => option.value !== without)
        // With no article there is nothing for the AI to write a thumbnail prompt from.
        .filter(
          (option) =>
            !(
              kind === "thumbnail" &&
              option.value === "prompt_by_llm" &&
              form.sources.article === "off"
            ),
        )
        .map((option) => ({
          ...option,
          disabled:
            kind === "video" && option.value === "generate" && form.sources.images === "off",
        }))}
      onPick={(source) => {
        if (kind === "article" && source === "off") {
          update(articleOff(form));
          return;
        }
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

// Article Off: what reads the article goes off with it, and its sections leave Play.
export function articleOff(form: PlayFormState): Partial<PlayFormState> {
  return {
    sources: {
      ...form.sources,
      article: "off",
      research: "off",
      audio: "off",
      document: "off",
      ...(form.sources.thumbnail === "prompt_by_llm" ? { thumbnail: "from_prompt" as const } : {}),
    },
    subtitles: { ...form.subtitles, mode: "off" },
    youtubeDescription: false,
    ...(form.shorts === undefined ? {} : { shorts: { ...form.shorts, enabled: false } }),
  };
}
