import type { Entry } from "@app/slices/library/model.js";
import type { ReactElement } from "react";
import { Button } from "@/components/kit/button";
import { useDraftLanguage } from "@/language/play-language";
import { useDraftCast } from "./channel-picker";
import { usePlaySession } from "./draft-context";
import { ImageScaleControl } from "./image-scale";
import { ImageScenesControl } from "./image-scenes";
import { AudioRail, ImagesRail } from "./media-rails";
import { OptionPicker } from "./pickers";
import type { RailProps } from "./rail-frame";
import { DocumentRail, NumberField, ThumbnailRail, VideoExtras, VideoRail } from "./stage-rails";
import { StyleSection } from "./style-section";
import { TextGenerationIn } from "./text-generation";

// The editors behind Play's Narration, Images, Video and style, and Outputs rows. Each is the
// stage's own rail; the raw numbers are edited in the draft document itself so what was typed
// survives a reload.

export function NarrationSection(
  props: RailProps & {
    readonly entries: readonly Entry[];
    readonly onKeyword: (field: string) => void;
    readonly onSettings: () => void;
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
          <div className="col-span-full flex flex-wrap gap-2">
            <Button variant="quiet" size="small" onClick={props.onSettings}>
              Settings
            </Button>
          </div>
          <div className="col-span-full empty:hidden">
            <TextGenerationIn {...props} section="narration" onSettings={props.onSettings} />
          </div>
        </>
      }
    />
  );
}

export function ImagesSection(props: RailProps): ReactElement {
  const session = usePlaySession();
  const document = session.document;
  return (
    <ImagesRail
      {...props}
      titled={false}
      more={
        <>
          <ImageScaleControl document={document} problem={props.problem} onEdit={session.edit} />
          {document.form.sources.article === "off" ? null : (
            <ImageScenesControl document={document} onEdit={session.edit} />
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

// How the video is cut and how it looks: the Export rail without its extras, then the frame
// and the captions.
export function VideoSection(
  props: RailProps & { readonly problemOf: (field: string) => string | undefined },
): ReactElement {
  const session = usePlaySession();
  const document = session.document;
  const language = useDraftLanguage();
  return (
    <>
      <VideoRail
        {...props}
        titled={false}
        extras={false}
        language={language}
        rawTiming={{
          imageSeconds: document.form.imageSeconds,
          zoomPercent: document.form.zoomPercent,
          edgeSilenceSeconds: document.form.edgeSilenceSeconds,
          onChange: (field, value) =>
            session.edit({ ...document, form: { ...document.form, [field]: value } }),
        }}
      />
      {document.form.sources.audio !== "off" ? (
        <div className="sl-fields border-b border-line py-4">
          <NumberField
            field="silenceGapSeconds"
            label="Silence between segments (seconds)"
            tip="play.silence-gap"
            placeholder={String(props.silenceGapSeconds)}
            step={0.1}
            problem={props.problem("silenceGapSeconds")}
            value={document.form.silenceGapSeconds ?? ""}
            onChange={(silenceGapSeconds) => {
              const { silenceGapSeconds: _gap, ...form } = document.form;
              session.edit({
                ...document,
                form: silenceGapSeconds.trim() === "" ? form : { ...form, silenceGapSeconds },
              });
            }}
          />
        </div>
      ) : null}
      <StyleSection problem={props.problemOf} />
    </>
  );
}

// What the run makes besides the long video: the thumbnail, the YouTube description, Shorts
// and the PDF.
// For an article, audiobook, podcast or images the publishing extras (thumbnail, YouTube
// description, Shorts) fold away under one line, opened on request or when one is already on.
export function ExtrasSection(
  props: RailProps & {
    readonly entries: readonly Entry[];
    readonly onSettings: () => void;
    readonly publishing?: boolean | undefined;
  },
): ReactElement {
  const { form } = props;
  const extras = (
    <>
      <ThumbnailRail {...props} />
      <section className="border-b border-line py-4">
        <VideoExtras
          form={props.form}
          prompts={props.prompts}
          problem={props.problem}
          update={props.update}
          onPickFiles={props.onPickFiles}
          onRemoveFile={props.onRemoveFile}
          {...(props.onReattachFile === undefined ? {} : { onReattachFile: props.onReattachFile })}
        />
      </section>
    </>
  );
  const anyOn =
    form.sources.thumbnail !== "off" ||
    form.youtubeDescription === true ||
    form.shorts?.enabled === true;
  return (
    <>
      <TextGenerationIn {...props} section="outputs" onSettings={props.onSettings} />
      {props.publishing === false ? (
        <details open={anyOn} className="border-b border-line py-3">
          <summary className="flex min-h-9 cursor-pointer items-center text-small text-ink-2">
            Publishing extras: thumbnail, YouTube description, Shorts
          </summary>
          {extras}
        </details>
      ) : (
        extras
      )}
      {/* The PDF is made from the article, so with Article Off it isn't offered. */}
      {props.form.sources.article === "off" ? null : <DocumentRail {...props} />}
    </>
  );
}
