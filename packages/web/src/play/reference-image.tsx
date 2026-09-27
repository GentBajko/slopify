import type { ReferenceSource } from "@app/slices/admission/model.js";
import type { Prompt } from "@app/slices/library/model.js";
import { type ReactElement, type ReactNode, useId } from "react";
import { InfoTip } from "@/components/kit/info-tip";
import { OptionPicker } from "@/play/pickers";

export const referenceHelp =
  "The establishing image is made first and is never shown in the video. Every other image - the video's, the shorts' and, if ticked, the thumbnail - is drawn with it as a reference, so the characters, style and palette stay the same. Changing it or making it again marks those images outdated.";

// The setting as both editors hold it: Off, From a prompt (an image prompt from the library,
// its keywords filled like the others) or Upload, and whether the thumbnail is drawn from it.
export interface ReferenceChoice {
  readonly source: "off" | ReferenceSource;
  readonly prompt: string;
  readonly thumbnail: boolean;
}
export const referenceOff: ReferenceChoice = { source: "off", prompt: "", thumbnail: true };

// The picker's empty choice reads Off.
const sources = [
  { value: "prompt", label: "From a prompt" },
  { value: "provide", label: "Upload" },
] as const;

// Play's Images rail and Edit project → Images draw the same row. `upload` is the file pick,
// shown for Upload; `prompt` replaces the library picker where the prompt is edited in place.
export function ReferenceImage({
  value,
  prompts,
  problem,
  upload,
  prompt,
  onChange,
}: {
  readonly value: ReferenceChoice;
  readonly prompts: readonly Prompt[];
  readonly problem?: ((field: string) => string | undefined) | undefined;
  readonly upload?: ReactNode;
  readonly prompt?: ReactNode;
  readonly onChange: (next: ReferenceChoice) => void;
}): ReactElement {
  const thumbnailId = useId();
  const off = value.source === "off";
  const names = prompts
    .filter((one) => one.kind === "image")
    .map((one) => ({ value: one.name, label: one.name }));
  return (
    <div className="col-span-full grid min-w-0 grid-cols-1 gap-4 min-[700px]:grid-cols-2">
      <div className="flex min-w-0 items-end gap-2">
        <div className="min-w-0 flex-1">
          <OptionPicker
            field="reference.source"
            label="Establishing image"
            value={off ? "" : value.source}
            placeholder="Off"
            options={sources}
            problem={problem?.("reference.source")}
            onPick={(source) =>
              onChange({
                ...value,
                source: source === "prompt" || source === "provide" ? source : "off",
              })
            }
          />
        </div>
        <InfoTip label="the establishing image">{referenceHelp}</InfoTip>
      </div>
      {value.source === "provide" ? (
        <div className="min-w-0">{upload}</div>
      ) : (
        (prompt ?? (
          <OptionPicker
            field="reference.prompt"
            label="Establishing prompt"
            value={value.prompt}
            placeholder={off ? "Off" : "Pick an image prompt"}
            options={names}
            disabled={off}
            problem={problem?.("reference.prompt")}
            onPick={(name) => onChange({ ...value, prompt: name })}
          />
        ))
      )}
      <label
        htmlFor={thumbnailId}
        className="col-span-full flex min-h-9 cursor-pointer items-center gap-2 text-small text-ink2"
      >
        <input
          id={thumbnailId}
          type="checkbox"
          data-play-field="reference.thumbnail"
          checked={value.thumbnail}
          disabled={off}
          onChange={(event) => onChange({ ...value, thumbnail: event.target.checked })}
        />
        Draw the thumbnail from it too
      </label>
    </div>
  );
}
