import type { SubtitleConfig } from "@app/slices/subtitles/model.js";
import { type ReactElement, useId } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubtitleControls } from "@/subtitles/controls";
import { usePlaySession } from "./draft-context";
import { FormatPicker } from "./format-picker";

export function StyleSection({
  problem,
}: {
  readonly problem: (field: string) => string | undefined;
}): ReactElement {
  const session = usePlaySession();
  const { document } = session;
  const { form } = document;
  const sampleId = useId();
  const change = (subtitles: SubtitleConfig): void =>
    session.edit({
      ...document,
      form: { ...form, subtitles: { ...subtitles, fontSize: form.subtitles.fontSize } },
    });
  return (
    <div data-tour="play-subtitles" className="flex min-w-0 flex-col gap-6 py-6">
      <p className="text-body text-ink2">See frame and caption changes in the preview as you go.</p>
      <FormatPicker
        value={form.format}
        onPick={(format) => session.edit({ ...document, form: { ...form, format } })}
      />
      <div className="border-t border-line pt-6">
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
          audioEnabled={form.sources.audio !== "off"}
          videoEnabled={form.sources.video === "generate" && form.sources.images !== "off"}
          onChange={change}
          problem={problem}
        />
      </div>
      <div className="border-t border-line pt-6">
        <Label htmlFor={sampleId} className="mb-2">
          Preview text
        </Label>
        <Input
          id={sampleId}
          value={document.previewText}
          onChange={(event) => session.edit({ ...document, previewText: event.target.value })}
        />
        <p className="mt-2 text-small text-ink3">
          Just a sample. Your actual captions come from the narration.
        </p>
      </div>
    </div>
  );
}
