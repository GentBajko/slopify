import { ambientBedSources } from "@app/slices/video/ambient-bed.js";
import type { ReactElement } from "react";
import { FilePick } from "@/play/provided";
import type { RailProps } from "@/play/rail-frame";
import { AmbientBedControls } from "@/video/ambient-bed-controls";

// Play's ambient sound, on the Export rail under the Look: the channel's bed unless the setup
// picks its own or None, and the upload for My own file, staged like the shorts' music.
export function PlayAmbientBed({
  form,
  problem,
  update,
  onPickFiles,
  onRemoveFile,
  onReattachFile,
}: Pick<RailProps, "form" | "problem" | "update" | "onPickFiles" | "onRemoveFile"> & {
  readonly onReattachFile: RailProps["onReattachFile"] | undefined;
}): ReactElement {
  const upload = form.provided.ambientBed;
  return (
    <AmbientBedControls
      value={form.ambientBed}
      inherit="The channel's (brand kit)"
      sources={ambientBedSources}
      offerNone
      problem={(field) => problem(`ambientBed.${field}`)}
      file={
        <FilePick
          field="ambientBed.file"
          label="Ambient sound file: an audio file, looped if shorter than the video"
          accept="audio/*"
          uploads={upload === undefined ? [] : [upload]}
          problem={problem("ambientBed.file")}
          onPick={(files) => onPickFiles("ambientBed", files)}
          onReattach={
            onReattachFile ? (key, file) => onReattachFile("ambientBed", key, file) : undefined
          }
          onRemove={(key) => onRemoveFile("ambientBed", key)}
        />
      }
      onChange={(ambientBed) => update({ ambientBed })}
    />
  );
}
