import type { SubtitleConfig } from "@app/slices/subtitles/model.js";
import type { ReactElement } from "react";
import { Field, Input } from "@/components/kit/field";
import { useDraftLanguage } from "@/language/play-language";
import { SubtitleControls } from "@/subtitles/controls";
import { usePlaySession } from "./draft-context";
import { FormatPicker } from "./format-picker";

// The two things a person first decides about how the video looks: its shape, and its
// captions. The shape matters while there are pictures to draw in it; the captions while there
// is narration to time them from.
export function StyleSection({
  problem,
}: {
  readonly problem: (field: string) => string | undefined;
}): ReactElement {
  const session = usePlaySession();
  const language = useDraftLanguage();
  const { document } = session;
  const { form } = document;
  const shaped = form.sources.video === "generate" || form.sources.images !== "off";
  const narrated = form.sources.audio !== "off";
  // A font still uploading, or one that failed, keeps the captions in view until it is settled.
  const captions = narrated || document.fontUpload !== null;
  if (!shaped && !captions)
    return (
      <p
        data-tour="play-subtitles"
        className="m-0 border-b border-line py-4 text-small text-ink-2 last:border-b-0"
      >
        No frame or captions to set: this run makes no pictures and no narration.
      </p>
    );
  const change = (subtitles: SubtitleConfig): void =>
    session.edit({
      ...document,
      form: { ...form, subtitles: { ...subtitles, fontSize: form.subtitles.fontSize } },
    });
  return (
    <div
      data-tour="play-subtitles"
      className="flex min-w-0 flex-col gap-4 border-b border-line py-4 last:border-b-0"
    >
      {shaped ? (
        <FormatPicker
          value={form.format}
          onPick={(format) => session.edit({ ...document, form: { ...form, format } })}
        />
      ) : null}
      {captions ? (
        <div className={shaped ? "border-t border-line pt-4" : undefined}>
          <SubtitleControls
            showPreview={false}
            illustratedPositions
            fontUpload={session.fontUpload}
            session={{
              previewText: document.previewText,
              fontUploading: session.fontUploading,
              fontUpload: document.fontUpload,
              selectFont: session.selectFont,
              uploadSubtitleFont: session.uploadSubtitleFont,
            }}
            value={{ ...form.subtitles, fontSize: Number(form.subtitles.fontSize) }}
            rawFontSize={{
              value: form.subtitles.fontSize,
              onChange: (fontSize) =>
                session.edit({
                  ...document,
                  form: { ...form, subtitles: { ...form.subtitles, fontSize } },
                }),
            }}
            format={form.format}
            language={language}
            audioEnabled={narrated}
            videoEnabled={form.sources.video === "generate" && form.sources.images !== "off"}
            onChange={change}
            problem={problem}
          />
        </div>
      ) : null}
      {narrated && form.subtitles.mode === "burn-in" ? (
        <Field
          label="Preview sentence"
          help="Only the style preview shows it; real captions come from the narration."
          className="max-w-[32rem]"
        >
          <Input
            value={document.previewText}
            onChange={(event) => session.edit({ ...document, previewText: event.target.value })}
          />
        </Field>
      ) : null}
    </div>
  );
}
