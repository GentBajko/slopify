import { defaultLoudness } from "@app/slices/loudness/model.js";
import { defaultSentencePauseSeconds } from "@app/slices/narration/pauses-model.js";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useApp } from "@/app-context";
import type { RailProps } from "@/play/rail-frame";
import { settingsQuery } from "@/queries";
import { LoudnessControls } from "@/video/loudness-controls";
import { PauseControls } from "@/video/pause-controls";

// Play's pauses between sentences and Level the volume, on the Export rail under the ambient
// sound. A draft that never touched the volume follows Settings → General (on at the
// recommended volumes unless changed there); the first change writes the whole choice onto the
// draft. The pauses start at their defaults.
export function PlayLoudness({
  form,
  problem,
  update,
}: Pick<RailProps, "form" | "problem" | "update">): ReactElement {
  const { api } = useApp();
  const settings = useQuery(settingsQuery(api));
  const fallback = settings.data?.loudness ?? defaultLoudness;
  const chosen = form.loudness;
  return (
    <div className="grid min-w-0 grid-cols-1 gap-3">
      {form.sources.audio === "generate" ? (
        <PauseControls
          sentence={form.sentencePause ?? String(defaultSentencePauseSeconds)}
          paragraph={form.paragraphPause ?? "0"}
          problem={problem}
          onChange={(field, text) =>
            update(
              field === "sentencePauseSeconds" ? { sentencePause: text } : { paragraphPause: text },
            )
          }
        />
      ) : null}
      <LoudnessControls
        value={{
          enabled: chosen?.enabled ?? fallback.enabled,
          videoLufs: chosen?.videoLufs ?? fallback.videoLufs,
          audioFilesLufs: chosen?.audioFilesLufs ?? fallback.audioFilesLufs,
        }}
        problem={(field) => problem(`loudness.${field}`)}
        onChange={(next) => update({ loudness: next })}
      />
    </div>
  );
}
