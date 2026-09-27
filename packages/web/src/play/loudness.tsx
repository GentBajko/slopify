import { defaultLoudness } from "@app/slices/loudness/model.js";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useApp } from "@/app-context";
import type { RailProps } from "@/play/rail-frame";
import { settingsQuery } from "@/queries";
import { LoudnessControls } from "@/video/loudness-controls";

// Play's Level the volume, on the Export rail under the ambient sound. A draft that never
// touched it follows Settings → General (on at the recommended volumes unless changed there);
// the first change writes the whole choice onto the draft.
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
    <LoudnessControls
      value={{
        enabled: chosen?.enabled ?? fallback.enabled,
        videoLufs: chosen?.videoLufs ?? fallback.videoLufs,
        audioFilesLufs: chosen?.audioFilesLufs ?? fallback.audioFilesLufs,
      }}
      problem={(field) => problem(`loudness.${field}`)}
      onChange={(next) => update({ loudness: next })}
    />
  );
}
