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
export function VideoBody({ stage, project, outputs, actions, busy, subtitleControls }: BodyProps) {
  const { api } = useApp();
  const audioExport =
    project.config.sources.video === "off" && project.config.sources.audio !== "off";
  const video = roleOf(outputsOf(outputs, stage), audioExport ? "audio_export" : "video");
  const subtitleOutputs = outputsOf(outputs, stage);
  const srt = roleOf(subtitleOutputs, "subtitles_srt");
  const vtt = roleOf(subtitleOutputs, "subtitles_vtt");
  const playedSubtitles = video?.meta.subtitlesMode ?? project.config.subtitles?.mode;
  const rendering = stage.state === "running";
  const done = percent(stage.progressCurrent ?? 0, stage.progressTotal ?? 0);

  if (project.config.sources.video === "off" && !audioExport)
    return <StageBody>{subtitleControls}</StageBody>;

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
          key={video.id}
          controls
          preload="metadata"
          aria-label="Combined narration"
          src={fileUrl(api, video.projectId, assetOf(video))}
          className="h-9 w-full max-w-[720px]"
        />
      ) : (
        // biome-ignore lint/a11y/useMediaCaption: the conditional track uses generated VTT only in files mode; burned captions are already visible.
        <video
          key={video.id}
          controls
          preload="metadata"
          src={fileUrl(api, video.projectId, assetOf(video))}
          aria-label="Generated video"
          className={cn(
            "mx-auto block max-h-[min(58vh,560px)] w-auto max-w-full rounded-control bg-screen",
            project.format === "9:16" ? "aspect-[9/16]" : "aspect-video",
          )}
        >
          {playedSubtitles === "files" && vtt ? (
            <track
              key={vtt.id}
              kind="captions"
              srcLang="en"
              label="English"
              default
              src={fileUrl(api, project.id, "subtitles-vtt")}
            />
          ) : null}
        </video>
      )}

      <ActionRow>
        {video === undefined ? null : (
          <OutputDownload output={video} label={audioExport ? "Download .wav" : "Download .mp4"} />
        )}
        {stage.state === "pending" || stage.state === "skipped" ? null : (
          <ConfirmedButton
            action={{ kind: "rerun", stage: stage.kind }}
            run={() => {
              actions.run({ kind: "rerun", stage: stage.kind });
            }}
            disabled={busy || !["done", "failed", "canceled"].includes(stage.state)}
            pending={actions.pending}
          >
            {audioExport ? "Re-export" : "Re-render"}
          </ConfirmedButton>
        )}
        <span className="text-small text-ink2">
          {[
            duration(video?.durationMs ?? undefined),
            audioExport ? "WAV · stereo · 48 kHz" : project.format,
          ]
            .filter((part) => part !== undefined)
            .join(" · ")}
        </span>
      </ActionRow>
      {video?.meta.subtitleOmissions?.length ? (
        <details className="rounded-control border border-line p-3 text-small">
          <summary className="cursor-pointer font-semibold">
            Subtitles recovered after missing narration ({video.meta.subtitleOmissions.length})
          </summary>
          <p className="mt-2 text-ink2">
            These transcript passages could not be matched to the audio and were left out of the
            captions. The audio is unchanged. Review these passages before sharing.
          </p>
          <ul className="mt-2 space-y-2">
            {video.meta.subtitleOmissions.map((omission) => (
              <li key={`${omission.start}-${omission.text}`}>
                <strong>{new Date(omission.start * 1000).toISOString().slice(11, 19)}</strong> —{" "}
                {omission.text}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {srt || vtt ? (
        <ActionRow>
          {srt ? <OutputDownload output={srt} label="Download .srt" /> : null}
          {vtt ? <OutputDownload output={vtt} label="Download .vtt" /> : null}
        </ActionRow>
      ) : null}
      {subtitleControls ? (
        <details className="mt-2 rounded-control border border-line px-4 py-3">
          <summary className="cursor-pointer text-small font-semibold">
            Subtitles &amp; fonts
          </summary>
          {subtitleControls}
        </details>
      ) : null}
    </StageBody>
  );
}
