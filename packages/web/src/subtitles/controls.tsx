import type { Format } from "@app/kernel/pipeline.js";
import type { SubtitleConfig } from "@app/slices/subtitles/model.js";
import { subtitlePositions } from "@app/slices/subtitles/model.js";
import { useId, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { validSubtitleStyle } from "./config";
import { FontPicker } from "./font-picker";
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
}: {
  readonly value: SubtitleConfig;
  readonly format?: Format;
  readonly audioEnabled: boolean;
  readonly videoEnabled: boolean;
  readonly disabled?: boolean;
  readonly onChange: (value: SubtitleConfig) => void;
  readonly onUploading?: (pending: boolean) => void;
  readonly problem?: (field: string) => string | undefined;
}) {
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
              value={audioEnabled ? value.mode : "off"}
              disabled={uploading}
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
                  value={value.fontId}
                  onPick={(fontId) => onChange({ ...value, fontId })}
                  onUploading={(pending) => {
                    setUploading(pending);
                    onUploading?.(pending);
                  }}
                />
                <div className="max-w-[180px]">
                  <Label htmlFor={sizeId} className="mb-1">
                    Subtitle font size
                  </Label>
                  <Input
                    id={sizeId}
                    type="number"
                    min={16}
                    max={120}
                    step={1}
                    value={value.fontSize}
                    aria-invalid={!validSubtitleStyle(value) || sizeProblem !== undefined}
                    onChange={(event) =>
                      onChange({ ...value, fontSize: Number(event.target.value) })
                    }
                  />
                  {!validSubtitleStyle(value) || sizeProblem ? (
                    <p role="alert" className="mt-1 text-label text-red">
                      {sizeProblem ?? "Choose a whole font size from 16 to 120."}
                    </p>
                  ) : null}
                </div>
                <div>
                  <Label htmlFor={positionId} className="mb-1">
                    Subtitle position
                  </Label>
                  <select
                    id={positionId}
                    value={value.position ?? "bottom"}
                    onChange={(event) => {
                      const position = subtitlePositions.find((one) => one === event.target.value);
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
                </div>
              </div>
              <SubtitlePreview value={value} format={format} />
            </div>
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
