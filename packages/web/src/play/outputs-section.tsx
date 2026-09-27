import type { Entry } from "@app/slices/library/model.js";
import type { ReactElement } from "react";
import { Button } from "@/components/ui/button";
import { usePlaySession } from "./draft-context";
import { AudioRail, ImagesRail } from "./media-rails";
import { OptionPicker } from "./pickers";
import type { RailProps } from "./rail-frame";
import { DocumentRail, ThumbnailRail, VideoExtras, VideoRail } from "./stage-rails";
import { StyleSection } from "./style-section";

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
  const { form, entries, problem, update } = props;
  return (
    <AudioRail
      {...props}
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
            {form.narrationPrompt ? (
              <Button variant="ghost" onClick={() => props.onKeyword("llm")}>
                Choose text generation under Article
              </Button>
            ) : null}
            <Button variant="ghost" onClick={props.onSettings}>
              Settings
            </Button>
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
  return (
    <>
      <VideoRail
        {...props}
        extras={false}
        rawTiming={{
          imageSeconds: document.form.imageSeconds,
          zoomPercent: document.form.zoomPercent,
          edgeSilenceSeconds: document.form.edgeSilenceSeconds,
          onChange: (field, value) =>
            session.edit({ ...document, form: { ...document.form, [field]: value } }),
        }}
      />
      <StyleSection problem={props.problemOf} />
    </>
  );
}

// What the run makes besides the long video: the thumbnail, the YouTube description, Shorts
// and the PDF.
export function ExtrasSection(props: RailProps): ReactElement {
  return (
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
      <DocumentRail {...props} />
    </>
  );
}
