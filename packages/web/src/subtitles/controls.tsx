import type { Format } from "@app/kernel/pipeline.js";
import type { SubtitleConfig } from "@app/slices/subtitles/model.js";
import { subtitlePositions } from "@app/slices/subtitles/model.js";
import { type ReactElement, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { validSubtitleStyle } from "./config";
import { type ControlledFontUpload, FontPicker } from "./font-picker";
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
}: {
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
  return (
    <section className="flex min-w-0 flex-col gap-3" aria-label="Subtitles">
      <fieldset
        disabled={disabled || !audioEnabled}
        className="flex min-w-0 flex-col gap-3 disabled:opacity-60"
      >
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-0 flex-1">
            <Label htmlFor={id} className="mb-1">
              Subtitles
            </Label>
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
              className="h-8 w-full rounded-control border border-line2 bg-panel2 px-[10px] text-small text-ink"
            >
              <option value="off">Off</option>
              <option value="files">Subtitle files (.srt + .vtt)</option>
              <option value="burn-in" disabled={!videoEnabled}>
                Burn into video + files
              </option>
            </select>
          </div>
          <span className="pb-1 text-label text-ink3">English · local · no paid API</span>
        </div>
        {value.mode !== "off" && audioEnabled ? (
          <>
            <p className="text-small text-ink2">
              Timed from your narration on this computer. First use downloads an approximately 95 MB
              speech model. Review the subtitles before publishing.
            </p>
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
                  <Label htmlFor={sizeId} className="mb-1">
                    Subtitle font size
                  </Label>
                  <div className="flex items-center gap-5">
                    {illustratedPositions ? (
                      <input
                        aria-label="Subtitle font size slider"
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
                  {!validSubtitleStyle(value) || sizeProblem ? (
                    <p role="alert" className="mt-1 text-label text-red">
                      {sizeProblem ?? "Choose a whole font size from 16 to 120."}
                    </p>
                  ) : null}
                </div>
                <div>
                  <Label
                    htmlFor={illustratedPositions ? undefined : positionId}
                    id={`${positionId}-label`}
                    className="mb-1"
                  >
                    Subtitle position
                  </Label>
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
                          className="flex min-w-0 flex-col items-center gap-2 rounded-control border border-line2 bg-panel px-1 py-3 text-[10px] last:border-r data-[state=on]:border-focus data-[state=on]:text-run-text data-[state=on]:shadow-none"
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
                      className="h-8 w-full rounded-control border border-line2 bg-panel2 px-[10px] text-small text-ink"
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
              <p role="alert" className="text-small text-red">
                {fontProblem}
              </p>
            ) : null}
            {value.mode === "files" ? (
              <p className="text-label text-ink3">
                Font, size and position apply to burned captions. SRT/VTT players choose their own
                styling.
              </p>
            ) : null}
          </>
        ) : null}
      </fieldset>
      {session?.fontUpload && (value.mode === "off" || !audioEnabled) ? (
        <div className="flex flex-col items-start gap-3">
          <p role={session.fontUploading ? "status" : "alert"} className="text-small text-ink2">
            {session.fontUploading
              ? `Uploading ${session.fontUpload.name}…`
              : `Unfinished font upload: ${session.fontUpload.name}`}
          </p>
          {fontUpload?.error ? (
            <p role="alert" className="text-small text-red">
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
        <p role="alert" className="text-small text-red">
          {modeProblem}
        </p>
      ) : null}
      <p id={hintId} className="text-small text-ink2">
        {!audioEnabled
          ? "Turn Audio on to add subtitles."
          : !videoEnabled
            ? "Audio exports support separate subtitle files. Enable Video to burn captions into an MP4."
            : "Optional: download subtitles separately or keep them visible in the video."}
      </p>
    </section>
  );
}
