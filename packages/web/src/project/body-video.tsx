import { assetOf } from "@app/slices/storage/asset-name.js";
import { useApp } from "@/app-context";
import { useCommand } from "@/components/kit/command-palette";
import { Player } from "@/components/kit/player";
import { useToast } from "@/components/kit/toast";
import type { BodyProps } from "./body.js";
import { outputsOf, roleOf } from "./body.js";
import { currentShorts, useShortClips } from "./body-shorts.js";
import { dockerFolderHelp, openFolder } from "./open-folder.js";
import { DownloadMenu, OutputFolder, StageBody } from "./parts.js";
import { useOutputMedia } from "./revision-media.js";
import { duration, percent, preparingSubtitles } from "./summary.js";

// The final stage plays the MP4 in a real player or, when Video is Off, the combined narration
// WAV. The previous file stays playable until ffmpeg successfully replaces it. Every file the
// stage made is behind one Download menu, with one folder for them all. The YouTube text and
// the shorts have their own sections.
export function VideoBody({ stage, project, outputs, subtitleControls }: BodyProps) {
  const { api } = useApp();
  const notify = useToast();
  const audioExport =
    project.config.sources.video === "off" && project.config.sources.audio !== "off";
  const video = roleOf(outputsOf(outputs, stage), audioExport ? "audio_export" : "video");
  const subtitleOutputs = outputsOf(outputs, stage);
  const srt = roleOf(subtitleOutputs, "subtitles_srt");
  const vtt = roleOf(subtitleOutputs, "subtitles_vtt");
  const description = roleOf(subtitleOutputs, "youtube_description");
  const tags = roleOf(subtitleOutputs, "youtube_tags");
  // A multi-voice run's listening files, with chapter markers.
  const mp3 = roleOf(subtitleOutputs, "audio_mp3");
  const m4b = roleOf(subtitleOutputs, "audio_m4b");
  const clips = useShortClips(subtitleOutputs);
  const shorts = currentShorts(subtitleOutputs, "short_video", clips).toSorted(
    (left, right) => (left.meta.short ?? 0) - (right.meta.short ?? 0),
  );
  const media = useOutputMedia(video);
  const captions = useOutputMedia(vtt);
  const playedSubtitles = video?.meta.subtitlesMode ?? project.config.subtitles?.mode;
  const rendering = stage.state === "running";
  const done = percent(stage.progressCurrent ?? 0, stage.progressTotal ?? 0);
  useCommand({
    id: "project.folder",
    title: "Open the project folder",
    group: "This project",
    context: project.title,
    keywords: ["folder", "files", "finder", "explorer", "video"],
    run: async () => {
      if (video === undefined) {
        notify("The video has not been saved yet, so there is no folder to open.", "info");
        return;
      }
      try {
        const reply = await openFolder(api, {
          projectId: project.id,
          asset: assetOf(video),
          folder: media?.folder ?? null,
        });
        if (!reply.opened) notify(`${dockerFolderHelp} ${reply.path}`, "info");
      } catch (error) {
        notify(
          error instanceof Error
            ? error.message
            : "The folder couldn't be opened. Use Open folder under the video.",
          "error",
        );
      }
    },
  });

  if (project.config.sources.video === "off" && !audioExport)
    return <StageBody>{subtitleControls}</StageBody>;

  return (
    <StageBody className="p-0">
      {rendering ? (
        <p className="m-0 text-small text-accent-ink">
          {preparingSubtitles(stage, project.config)
            ? `Preparing subtitles · ${String(percent(stage.progressCurrent ?? 0, 35))}%`
            : audioExport
              ? "Exporting combined audio"
              : stage.progressTotal === null
                ? "Rendering"
                : `Rendering · ${String(done)}%`}
        </p>
      ) : null}

      {video === undefined ? (
        <p className="m-0 text-small text-ink-2">
          {audioExport ? "No combined audio export has landed yet." : "No render has landed yet."}
        </p>
      ) : audioExport ? (
        // biome-ignore lint/a11y/useMediaCaption: the export is the user's own narration and there is no caption track.
        <audio
          key={video.id}
          controls
          preload="metadata"
          aria-label="Combined narration"
          src={media?.url}
          className="h-10 w-full max-w-[720px]"
        />
      ) : media === undefined ? null : (
        <Player
          key={video.id}
          src={media.url}
          label="Generated video"
          portrait={project.format === "9:16"}
          className={project.format === "9:16" ? "max-w-[360px]" : "max-w-[1100px]"}
          {...(playedSubtitles === "files" && vtt && captions
            ? { captions: { src: captions.url, lang: "en", label: "English" } }
            : {})}
        />
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <DownloadMenu
          files={[
            { output: video, label: audioExport ? "Audio (.wav)" : "Video (.mp4)" },
            { output: srt, label: "Subtitles (.srt)" },
            { output: vtt, label: "Subtitles (.vtt)" },
            { output: description, label: "YouTube description (.txt)" },
            { output: tags, label: "YouTube tags (.txt)" },
            { output: mp3, label: "Audio with chapters (.mp3)" },
            { output: m4b, label: "Audiobook with chapters (.m4b)" },
            ...shorts.map((output) => ({
              output,
              label: `Short ${String(output.meta.short ?? "")} (.mp4)`,
            })),
          ]}
        />
        <OutputFolder output={video} />
        <span className="text-small text-ink-2">
          {[
            duration(video?.durationMs ?? undefined),
            audioExport ? "WAV · stereo · 48 kHz" : project.format,
          ]
            .filter((part) => part !== undefined)
            .join(" · ")}
        </span>
      </div>

      {/* What the render could not do as asked: an image shown still because its clip could
          not be made. */}
      {video?.meta.warnings?.length ? (
        <ul
          aria-label="Render notes"
          className="m-0 flex flex-col gap-1 pl-5 text-small text-ink-2"
        >
          {video.meta.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}
      {video?.meta.subtitleOmissions?.length ? (
        <details className="border-t border-line pt-3 text-small">
          <summary className="cursor-pointer font-semibold">
            Subtitles recovered after missing narration ({video.meta.subtitleOmissions.length})
          </summary>
          <p className="m-0 mt-2 text-ink-2">
            These transcript passages could not be matched to the audio and were left out of the
            captions. The audio is unchanged. Review these passages before sharing.
          </p>
          <ul className="m-0 mt-2 flex flex-col gap-2 pl-5">
            {video.meta.subtitleOmissions.map((omission) => (
              <li key={`${omission.start}-${omission.text}`}>
                <strong>{new Date(omission.start * 1000).toISOString().slice(11, 19)}</strong> —{" "}
                {omission.text}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {subtitleControls ? (
        <details className="border-t border-line pt-3">
          <summary className="cursor-pointer text-small font-semibold">
            Subtitles &amp; fonts
          </summary>
          {subtitleControls}
        </details>
      ) : null}
    </StageBody>
  );
}
