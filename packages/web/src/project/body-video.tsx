import { assetOf } from "@app/slices/storage/asset-name.js";
import { fileUrl } from "@/api";
import { useApp } from "@/app-context";
import { cn } from "@/lib/utils";
import type { BodyProps } from "./body.js";
import { outputsOf, roleOf } from "./body.js";
import { ConfirmedButton } from "./controls.js";
import { ActionRow, OutputDownload, StageBody } from "./parts.js";
import { duration, percent } from "./summary.js";

// The final stage plays an MP4 or, when Video is Off, the combined narration WAV.
// The previous file stays playable until ffmpeg successfully replaces it.
export function VideoBody({ stage, project, outputs, actions, busy }: BodyProps) {
  const { api } = useApp();
  const audioExport =
    project.config.sources.video === "off" && project.config.sources.audio !== "off";
  const video = roleOf(outputsOf(outputs, stage), audioExport ? "audio_export" : "video");
  const rendering = stage.state === "running";
  const done = percent(stage.progressCurrent ?? 0, stage.progressTotal ?? 0);

  return (
    <StageBody>
      {rendering ? (
        <p className="text-small text-run-text">
          {audioExport
            ? "Exporting combined audio"
            : stage.progressTotal === null
              ? "Re-rendering"
              : `Re-rendering · ${String(done)}%`}
        </p>
      ) : null}

      {video === undefined ? (
        <p className="text-small text-ink2">
          {audioExport ? "No combined audio export has landed yet." : "No render has landed yet."}
        </p>
      ) : audioExport ? (
        // biome-ignore lint/a11y/useMediaCaption: the export is the user's own narration and there is no caption track.
        <audio
          controls
          preload="metadata"
          aria-label="Combined narration"
          src={fileUrl(api, video.projectId, assetOf(video))}
          className="h-9 w-full max-w-[720px]"
        />
      ) : (
        // biome-ignore lint/a11y/useMediaCaption: the narration is the user's own audio and no caption track exists for it anywhere in the pipeline.
        <video
          controls
          preload="metadata"
          src={fileUrl(api, video.projectId, assetOf(video))}
          className={cn(
            "block max-h-[720px] w-auto max-w-full rounded-control bg-screen",
            project.format === "9:16" ? "aspect-[9/16]" : "aspect-video",
          )}
        />
      )}

      <ActionRow>
        {video === undefined ? null : (
          <OutputDownload output={video} label={audioExport ? "Download .wav" : "Download .mp4"} />
        )}
        <ConfirmedButton
          action={{ kind: "rerun", stage: stage.kind }}
          run={() => {
            actions.run({ kind: "rerun", stage: stage.kind });
          }}
          disabled={busy}
          pending={actions.pending}
        >
          {audioExport ? "Re-export" : "Re-render"}
        </ConfirmedButton>
        <span className="text-small text-ink2">
          {[
            duration(video?.durationMs ?? undefined),
            audioExport ? "WAV · stereo · 48 kHz" : project.format,
          ]
            .filter((part) => part !== undefined)
            .join(" · ")}
        </span>
      </ActionRow>
    </StageBody>
  );
}
