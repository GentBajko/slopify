import type { Format } from "@app/kernel/pipeline.js";
import type { SubtitleConfig } from "@app/slices/subtitles/model.js";
import { defaultSubtitles, subtitlePositions } from "@app/slices/subtitles/model.js";
import { type ReactElement, useId, useState } from "react";
import { Button } from "@/components/kit/button";
import { HelpLine, Input } from "@/components/kit/field";
import { helpScope } from "@/components/kit/info-tip";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { validSubtitleStyle } from "./config";
import { type ControlledFontUpload, FontPicker } from "./font-picker";
import { subtitleFacts } from "./model-facts";
import { SubtitlePreview } from "./style-preview";

export function SubtitleControls({
  value,
  format = "16:9",
  audioEnabled,
  videoEnabled,
  disabled = false,
  onChange,
  onUploading,
  problem,
  session,
  fontUpload,
  showPreview = true,
  illustratedPositions = false,
  rawFontSize,
  language,
}: {
  // The project's language: it decides which model times the captions and what it downloads.
  readonly language?: string | undefined;
  readonly showPreview?: boolean;
  readonly illustratedPositions?: boolean;
  readonly rawFontSize?: { readonly value: string; readonly onChange: (value: string) => void };
  readonly fontUpload?: ControlledFontUpload;
  readonly session?: {
    readonly previewText: string;
    readonly fontUploading: boolean;
    readonly fontUpload: { readonly name: string } | null;
    readonly selectFont: (id: string) => void;
    readonly uploadSubtitleFont: (file: File) => Promise<void>;
  };
  readonly value: SubtitleConfig;
  readonly format?: Format;
  readonly audioEnabled: boolean;
  readonly videoEnabled: boolean;
  readonly disabled?: boolean;
  readonly onChange: (value: SubtitleConfig) => void;
  readonly onUploading?: (pending: boolean) => void;
  readonly problem?: (field: string) => string | undefined;
}): ReactElement {
  const id = useId();
  const sizeId = useId();
  const hintId = useId();
  const positionId = useId();
  const [uploading, setUploading] = useState(false);
  const fontProblem = problem?.("subtitles.fontId");
  const sizeProblem = problem?.("subtitles.fontSize");
  const modeProblem = problem?.("subtitles.mode") ?? problem?.("subtitles");
  const facts = subtitleFacts(language);
  const sizeShown = rawFontSize?.value ?? String(value.fontSize);
  const sizeChanged = sizeShown.trim() !== String(defaultSubtitles.fontSize);
  const resetSize = (): void => {
    if (rawFontSize) rawFontSize.onChange(String(defaultSubtitles.fontSize));
    else onChange({ ...value, fontSize: defaultSubtitles.fontSize });
  };
  // Font, size and position only style captions shown in the video: with caption files only
  // (or no video) they would do nothing, so they are not drawn, unless one of them needs fixing.
  const styled =
    audioEnabled &&
    (value.mode === "burn-in" ||
      (value.mode === "files" &&
        (!validSubtitleStyle(value) ||
          sizeProblem !== undefined ||
          fontProblem !== undefined ||
          fontUpload?.pending === true ||
          uploading)));
  return (
    <section className="flex min-w-0 flex-col gap-3" aria-label="Captions" {...helpScope}>
      <fieldset
        disabled={disabled || !audioEnabled}
        className="flex min-w-0 flex-col gap-3 disabled:opacity-60"
      >
        <div className="flex flex-wrap items-end gap-3">
          {/* The timing note sits beside the label, never beside the select, so on a phone the
              select keeps its whole width and its words. The line under the section explains
              the choice, so there is no info button. */}
          <div className="min-w-0 max-w-[22rem] flex-1">
            <div className="mb-1 flex flex-wrap items-baseline gap-x-2">
              <label htmlFor={id} className="sl-field__label block">
                Captions
              </label>
              <span className="text-label text-ink-3">{facts.tag}</span>
            </div>
            <select
              id={id}
              data-play-field="subtitles.mode"
              value={audioEnabled ? value.mode : "off"}
              disabled={fontUpload?.pending ?? uploading}
              aria-describedby={hintId}
              aria-invalid={modeProblem !== undefined}
              onChange={(event) =>
                onChange({ ...value, mode: event.target.value as SubtitleConfig["mode"] })
              }
              className="sl-select"
            >
              <option value="off">Off</option>
              <option value="burn-in" disabled={!videoEnabled}>
                Show captions in the video
              </option>
              <option value="files">Caption files only (.srt + .vtt)</option>
            </select>
          </div>
        </div>
        {value.mode !== "off" && audioEnabled && !styled ? (
          <HelpLine>{facts.detail}</HelpLine>
        ) : null}
        {styled ? (
          <div className="flex min-w-0 flex-col gap-3" {...helpScope}>
            <HelpLine>{facts.detail}</HelpLine>
            <div
              className="grid items-start gap-5"
              style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))" }}
            >
              <div className="flex min-w-0 flex-col gap-4">
                <FontPicker
                  {...(fontUpload ? { upload: fontUpload } : {})}
                  value={value.fontId}
                  onPick={(fontId) =>
                    session ? session.selectFont(fontId) : onChange({ ...value, fontId })
                  }
                  onUploading={(pending) => {
                    setUploading(pending);
                    onUploading?.(pending);
                  }}
                />
                <div className={illustratedPositions ? "w-full" : "max-w-[180px]"}>
                  <div className="mb-1 flex items-center gap-1">
                    <label htmlFor={sizeId} className="sl-field__label block">
                      Caption size
                    </label>
                  </div>
                  <div className="flex items-center gap-5">
                    {illustratedPositions ? (
                      <input
                        aria-label="Caption size slider"
                        type="range"
                        min={16}
                        max={120}
                        step={1}
                        value={Math.max(
                          16,
                          Math.min(120, Number.isFinite(value.fontSize) ? value.fontSize : 48),
                        )}
                        className="min-w-0 flex-1 accent-accent"
                        onChange={(event) =>
                          rawFontSize
                            ? rawFontSize.onChange(event.target.value)
                            : onChange({ ...value, fontSize: Number(event.target.value) })
                        }
                      />
                    ) : null}
                    <Input
                      className={illustratedPositions ? "w-20" : undefined}
                      id={sizeId}
                      data-play-field="subtitles.fontSize"
                      type="number"
                      min={16}
                      max={120}
                      step={1}
                      value={rawFontSize?.value ?? value.fontSize}
                      aria-invalid={!validSubtitleStyle(value) || sizeProblem !== undefined}
                      onChange={(event) =>
                        rawFontSize
                          ? rawFontSize.onChange(event.target.value)
                          : onChange({ ...value, fontSize: Number(event.target.value) })
                      }
                    />
                  </div>
                  <div className="mt-1 flex min-h-7 items-center gap-2 text-label text-ink-2">
                    <span>
                      {sizeChanged
                        ? `Changed · default ${String(defaultSubtitles.fontSize)}`
                        : "Default size"}
                    </span>
                    {sizeChanged ? (
                      <Button
                        variant="quiet"
                        size="small"
                        aria-label={`Reset caption size to ${String(defaultSubtitles.fontSize)}`}
                        onClick={resetSize}
                      >
                        Reset
                      </Button>
                    ) : null}
                  </div>
                  {!validSubtitleStyle(value) || sizeProblem ? (
                    <p role="alert" className="mt-1 text-label text-danger">
                      {sizeProblem ?? "Choose a whole font size from 16 to 120."}
                    </p>
                  ) : null}
                </div>
                <div>
                  <div className="mb-1 flex items-center gap-1">
                    <label
                      htmlFor={illustratedPositions ? undefined : positionId}
                      id={`${positionId}-label`}
                      className="sl-field__label block"
                    >
                      Caption position
                    </label>
                  </div>
                  {illustratedPositions ? (
                    <ToggleGroup
                      type="single"
                      aria-labelledby={`${positionId}-label`}
                      value={value.position ?? "bottom"}
                      onValueChange={(next) => {
                        const position = subtitlePositions.find((one) => one === next);
                        if (position) onChange({ ...value, position });
                      }}
                      className="grid w-full grid-cols-5 gap-2 overflow-visible border-0"
                    >
                      {subtitlePositions.map((position, index) => (
                        <ToggleGroupItem
                          key={position}
                          value={position}
                          aria-label={position}
                          data-play-field={
                            (value.position ?? "bottom") === position
                              ? "subtitles.position"
                              : undefined
                          }
                          className="flex min-w-0 flex-col items-center gap-2 rounded-control border border-line-strong bg-surface px-1 py-3 text-[10px] last:border-r data-[state=on]:border-focus data-[state=on]:text-accent-ink data-[state=on]:shadow-none"
                        >
                          <span
                            aria-hidden="true"
                            className="relative block h-11 w-7 rounded-[2px] border border-current"
                          >
                            <span
                              className="absolute left-1 right-1 h-[3px] bg-current"
                              style={{ top: `${8 + index * 20}%` }}
                            />
                          </span>
                          <span>
                            {position[0]?.toUpperCase()}
                            {position.slice(1)}
                          </span>
                        </ToggleGroupItem>
                      ))}
                    </ToggleGroup>
                  ) : (
                    <select
                      id={positionId}
                      data-play-field="subtitles.position"
                      value={value.position ?? "bottom"}
                      onChange={(event) => {
                        const position = subtitlePositions.find(
                          (one) => one === event.target.value,
                        );
                        if (position) onChange({ ...value, position });
                      }}
                      className="h-8 w-full rounded-control border border-line-strong bg-raised px-3 text-small text-ink"
                    >
                      {subtitlePositions.map((position) => (
                        <option key={position} value={position}>
                          {position[0]?.toUpperCase()}
                          {position.slice(1)}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
              {showPreview ? (
                <SubtitlePreview
                  value={value}
                  format={format}
                  {...(session ? { sample: session.previewText } : {})}
                />
              ) : null}
            </div>
            {session?.fontUpload && !session.fontUploading ? (
              <p role="alert">Reattach {session.fontUpload.name}, or select a font.</p>
            ) : null}
            {fontProblem ? (
              <p role="alert" className="text-small text-danger">
                {fontProblem}
              </p>
            ) : null}
          </div>
        ) : null}
      </fieldset>
      {session?.fontUpload && (value.mode !== "burn-in" || !audioEnabled) ? (
        <div className="flex flex-col items-start gap-3">
          <p role={session.fontUploading ? "status" : "alert"} className="text-small text-ink-2">
            {session.fontUploading
              ? `Uploading ${session.fontUpload.name}…`
              : `Unfinished font upload: ${session.fontUpload.name}`}
          </p>
          {fontUpload?.error ? (
            <p role="alert" className="text-small text-danger">
              {fontUpload.error}
            </p>
          ) : null}
          <Button
            data-play-field="subtitles.fontUpload"
            disabled={disabled}
            onClick={() => session.selectFont(value.fontId)}
          >
            Keep current font
          </Button>
        </div>
      ) : null}
      {modeProblem ? (
        <p role="alert" className="text-small text-danger">
          {modeProblem}
        </p>
      ) : null}
      <HelpLine id={hintId}>
        {!audioEnabled
          ? "Captions come from the narration: turn Narration on to add them."
          : !videoEnabled
            ? "With no video, captions come as files to upload beside the sound (.srt + .vtt)."
            : value.mode === "files"
              ? "Files to upload beside the video; the video shows none, and the player that shows them styles them."
              : value.mode === "burn-in"
                ? "Also saved as .srt and .vtt files for YouTube."
                : "Captions shown in the video are also saved as .srt and .vtt files for YouTube."}
      </HelpLine>
    </section>
  );
}
