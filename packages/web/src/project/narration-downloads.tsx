import type { Output } from "@app/slices/storage/model.js";
import type { ReactElement } from "react";
import { EngravedLabel, OutputDownload } from "./parts";

export function NarrationDownloads({
  outputs,
}: {
  readonly outputs: readonly Output[];
}): ReactElement | null {
  const files = outputs.filter(
    (output) => output.role === "narration_txt" || output.role === "tts_script",
  );
  if (files.length === 0) return null;
  return (
    <section aria-label="Narration text downloads" className="space-y-3">
      {(["intro", "body", "outro"] as const).map((segment) => {
        const mine = files.filter((output) => output.meta.segment === segment);
        if (mine.length === 0) return null;
        const name = segment === "body" ? "Body" : segment === "intro" ? "Intro" : "Outro";
        return (
          <div key={segment} className="flex flex-wrap items-center gap-3 text-small">
            <EngravedLabel>{name}</EngravedLabel>
            {mine.map((output) => (
              <OutputDownload
                key={output.id}
                output={output}
                label={`${name} ${output.role === "narration_txt" ? "Clean Narration" : "TTS Script"}`}
              />
            ))}
          </div>
        );
      })}
      <p className="text-small text-ink3">
        Clean Narration is the spoken text used for captions. TTS Script includes delivery cues;
        blank lines separate requests. Uploaded audio has no TTS request.
      </p>
    </section>
  );
}
