import type { Entry } from "@app/slices/library/model.js";
import type { ReactElement } from "react";
import { Fold } from "@/components/kit/fold";
import { useDraftLanguage } from "@/language/play-language";
import { useDraftCast } from "./channel-picker";
import { usePlaySession } from "./draft-context";
import { freshImageCount } from "./image-prompts";
import { ImageScaleControl } from "./image-scale";
import { ImageScenesControl } from "./image-scenes";
import { PlayLoudness } from "./loudness";
import { AudioRail, ImagesRail } from "./media-rails";
import { outputKindOf } from "./output-kind";
import { OptionPicker } from "./pickers";
import type { RailProps } from "./rail-frame";
import {
  DocumentRail,
  ImagesAndCuts,
  NumberField,
  ThumbnailRail,
  timingOf,
  VideoExtras,
  VideoRail,
} from "./stage-rails";
import { StyleSection } from "./style-section";
import { TextGenerationIn } from "./text-generation";

// The editors behind Play's Narration, Images, Video and style, and Outputs rows. Each is the
// stage's own rail; the raw numbers are edited in the draft document itself so what was typed
// survives a reload.

export function NarrationSection(
  props: RailProps & {
    readonly entries: readonly Entry[];
    readonly onKeyword: (field: string) => void;
  },
): ReactElement {
  const session = usePlaySession();
  const document = session.document;
  const cast = useDraftCast();
  const language = useDraftLanguage();
  const { form, entries, problem, update } = props;
  return (
    <AudioRail
      {...props}
      titled={false}
      cast={cast}
      language={language}
      rawCounts={{
        ...document.form.chunking,
        onChange: (mode, amount) =>
          session.edit({
            ...document,
            form: {
              ...document.form,
              chunking: {
                ...document.form.chunking,
                mode,
                ...(mode === "words"
                  ? { words: amount }
                  : mode === "characters"
                    ? { characters: amount }
                    : {}),
              },
            },
          }),
      }}
      advanced={
        <>
          {(["intro", "outro"] as const).map((kind) => (
            <OptionPicker
              key={kind}
              field={kind}
              label={kind === "intro" ? "Intro" : "Outro"}
              tip={kind === "intro" ? "play.intro" : "play.outro"}
              value={form[kind]}
              placeholder="Off"
              options={entries
                .filter((entry) => entry.category === kind)
                .map((entry) => ({ value: entry.name, label: entry.name }))}
              problem={problem(kind)}
              onPick={(value) => update({ [kind]: value })}
            />
          ))}
          <div className="col-span-full empty:hidden">
            <TextGenerationIn {...props} section="narration" />
          </div>
        </>
      }
    />
  );
}

export function ImagesSection(props: RailProps): ReactElement {
  const session = usePlaySession();
  const document = session.document;
  const taken = props.form.imagePrompts.reduce(
    (sum, choice) => sum + (Number.isFinite(choice.number) ? choice.number : 0),
    0,
  );
  return (
    <ImagesRail
      {...props}
      titled={false}
      startAt={freshImageCount(props.form, taken)}
      more={
        <>
          <ImageScaleControl document={document} problem={props.problem} onEdit={session.edit} />
          {document.form.sources.article === "off" ? null : (
            <ImageScenesControl document={document} prompts={props.prompts} onEdit={session.edit} />
          )}
        </>
      }
      rawNumbers={{
        values: document.form.imagePrompts,
        onChange: (name, number) =>
          session.edit({
            ...document,
            form: {
              ...document.form,
              imagePrompts: document.form.imagePrompts.map((entry) =>
                entry.name === name ? { ...entry, number } : entry,
              ),
            },
          }),
      }}
    />
  );
}

// What the video looks like, in the order a person decides it: whether there is one, its
// shape, the captions, then the images and cuts, and last the sound polish (pauses, levels,
// silences), folded for a video and open for spoken work, where it is most of the row.
export function VideoSection(
  props: RailProps & { readonly problemOf: (field: string) => string | undefined },
): ReactElement {
  const session = usePlaySession();
  const document = session.document;
  const language = useDraftLanguage();
  const { form } = props;
  const rawTiming = {
    imageSeconds: document.form.imageSeconds,
    zoomPercent: document.form.zoomPercent,
    edgeSilenceSeconds: document.form.edgeSilenceSeconds,
    onChange: (field: "imageSeconds" | "zoomPercent" | "edgeSilenceSeconds", value: string) =>
      session.edit({ ...document, form: { ...document.form, [field]: value } }),
  };
  return (
    <>
      <VideoRail form={form} update={props.update} titled={false} />
      <StyleSection problem={props.problemOf} />
      {form.sources.video === "generate" ? (
        <ImagesAndCuts {...props} rawTiming={rawTiming} language={language} />
      ) : null}
      {form.sources.audio !== "off" ? (
        <SoundPolish {...props} rawTiming={rawTiming} spoken={outputKindOf(form) !== "video"} />
      ) : null}
    </>
  );
}

// Pauses between sentences, breaths, levels and silences: one fold, named for what it does.
function SoundPolish({
  form,
  problem,
  update,
  silenceGapSeconds,
  rawTiming,
  spoken,
}: Pick<RailProps, "form" | "problem" | "update" | "silenceGapSeconds"> & {
  readonly rawTiming: Parameters<typeof timingOf>[2];
  // Audiobooks and podcasts: the sound is most of what the row sets, so the fold starts open.
  readonly spoken: boolean;
}): ReactElement {
  const session = usePlaySession();
  const document = session.document;
  const timing = timingOf(form, update, rawTiming);
  const state = [
    form.removeBreaths === true ? "breaths softened" : undefined,
    form.deEss === true ? "S sounds softened" : undefined,
    form.levelSentences === true ? "sentences levelled" : undefined,
    form.loudness?.enabled === false ? "volume as recorded" : "volume levelled",
  ]
    .filter((part) => part !== undefined)
    .join(", ")
    .replace(/^./, (first) => first.toUpperCase());
  return (
    <section aria-label="Sound polish" className="border-b border-line py-3">
      <Fold summary="Sound polish" state={state} defaultOpen={spoken}>
        <div className="flex min-w-0 flex-col gap-4 pt-2 pb-3">
          <PlayLoudness form={form} problem={problem} update={update} />
          <div className="sl-fields">
            <NumberField
              field="edgeSilenceSeconds"
              label="Silence at start and end (seconds)"
              tip="play.edge-silence"
              step={0.5}
              problem={problem("edgeSilenceSeconds")}
              {...timing("edgeSilenceSeconds")}
            />
            <NumberField
              field="silenceGapSeconds"
              label="Silence between segments (seconds)"
              tip="play.silence-gap"
              placeholder={String(silenceGapSeconds)}
              step={0.1}
              problem={problem("silenceGapSeconds")}
              value={document.form.silenceGapSeconds ?? ""}
              onChange={(silenceGapSeconds) => {
                const { silenceGapSeconds: _gap, ...rest } = document.form;
                session.edit({
                  ...document,
                  form: silenceGapSeconds.trim() === "" ? rest : { ...rest, silenceGapSeconds },
                });
              }}
            />
          </div>
        </div>
      </Fold>
    </section>
  );
}

// What the run makes besides its main work, as a checklist: the thumbnail, the YouTube
// description, Shorts, posting to other sites and the PDF, each one tick whose settings appear
// only once it is ticked. For an article, audiobook, podcast or images the publishing ticks
// fold away under one line, open when one of them is already on.
export function ExtrasSection(
  props: RailProps & {
    readonly entries: readonly Entry[];
    readonly publishing?: boolean | undefined;
  },
): ReactElement {
  const { form } = props;
  const anyOn =
    form.sources.thumbnail !== "off" ||
    form.youtubeDescription === true ||
    form.shorts?.enabled === true ||
    form.social !== undefined;
  const extras = (
    <>
      <ThumbnailRail {...props} />
      <VideoExtras
        form={props.form}
        prompts={props.prompts}
        problem={props.problem}
        update={props.update}
        onPickFiles={props.onPickFiles}
        onRemoveFile={props.onRemoveFile}
        {...(props.onReattachFile === undefined ? {} : { onReattachFile: props.onReattachFile })}
      />
    </>
  );
  return (
    <>
      <TextGenerationIn {...props} section="outputs" />
      {props.publishing === false ? (
        <div className="border-b border-line py-3">
          <Fold
            summary="Publishing extras"
            state="Thumbnail, YouTube description, Shorts, posts"
            defaultOpen={anyOn}
          >
            {extras}
          </Fold>
        </div>
      ) : (
        extras
      )}
      <DocumentRail {...props} />
    </>
  );
}
