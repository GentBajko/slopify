import type { ReferenceSource } from "@app/slices/admission/model.js";
import type { Prompt } from "@app/slices/library/model.js";
import { type ReactElement, type ReactNode, useId } from "react";
import { Checkbox, HelpLine } from "@/components/kit/field";
import { helpScope } from "@/components/kit/info-tip";
import { OptionPicker } from "@/play/pickers";

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
  { value: "prompt", label: "Drawn from an image prompt" },
  { value: "provide", label: "Upload mine" },
] as const;

// Play's Images rail and Edit project → Images draw the same row: the choice, then (once it is
// on) the prompt or the file, and the tick that lets the thumbnail use it as a reference too.
// `upload` is the file pick, shown for Upload; `prompt` replaces the library picker where the
// prompt is edited in place. The tick is only drawn while there is a thumbnail to draw:
// `thumbnailOn` is Outputs → Thumbnail drawn by the image service (an uploaded one is not drawn).
export function ReferenceImage({
  value,
  prompts,
  problem,
  upload,
  prompt,
  thumbnailOn = true,
  onChange,
}: {
  readonly value: ReferenceChoice;
  readonly prompts: readonly Prompt[];
  readonly problem?: ((field: string) => string | undefined) | undefined;
  readonly upload?: ReactNode;
  readonly prompt?: ReactNode;
  readonly thumbnailOn?: boolean | undefined;
  readonly onChange: (next: ReferenceChoice) => void;
}): ReactElement {
  const thumbnailId = useId();
  const off = value.source === "off";
  const names = prompts
    .filter((one) => one.kind === "image")
    .map((one) => ({ value: one.name, label: one.name }));
  return (
    <div className="col-span-full sl-fields" {...helpScope}>
      <div className="min-w-0">
        <OptionPicker
          field="reference.source"
          label="Establishing image (keeps characters and style the same)"
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
      {off ? null : value.source === "provide" ? (
        <div className="min-w-0">{upload}</div>
      ) : (
        (prompt ?? (
          <OptionPicker
            field="reference.prompt"
            label="Establishing prompt"
            value={value.prompt}
            placeholder="Pick an image prompt"
            options={names}
            problem={problem?.("reference.prompt")}
            onPick={(name) => onChange({ ...value, prompt: name })}
          />
        ))
      )}
      <HelpLine className="sl-fields__wide">
        {off
          ? "Off: each image is drawn on its own."
          : value.source === "prompt"
            ? "Drawn first and never shown; every other image copies its characters and style · one more image call."
            : "Never shown; every other image copies its characters and style."}
      </HelpLine>
      {off || !thumbnailOn ? null : (
        <div className="sl-fields__wide flex min-w-0 flex-col gap-1">
          <label
            htmlFor={thumbnailId}
            className="flex min-h-9 cursor-pointer items-center gap-3 text-small"
          >
            <Checkbox
              id={thumbnailId}
              data-play-field="reference.thumbnail"
              checked={value.thumbnail}
              onChange={(event) => onChange({ ...value, thumbnail: event.target.checked })}
            />
            Use it as a reference for the thumbnail too
          </label>
          <HelpLine className="pl-7">The thumbnail itself is switched on under Outputs.</HelpLine>
        </div>
      )}
    </div>
  );
}
