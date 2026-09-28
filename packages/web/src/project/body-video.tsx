import { wordTimingUnavailable } from "@app/kernel/ports/languages.js";
import { masterText } from "@app/slices/loudness/model.js";
import { assetOf } from "@app/slices/storage/asset-name.js";
import type { Output } from "@app/slices/storage/model.js";
import { fitChapters } from "@app/slices/youtube/chapters.js";
import { resolveFields, shownFields, splitDescription } from "@app/slices/youtube/edits.js";
import { parseTimestamp } from "@app/slices/youtube/timestamps.js";
import { useQuery } from "@tanstack/react-query";
import { readDescriptionEdits } from "@/api";
import { useApp } from "@/app-context";
import { useCommand } from "@/components/kit/command-palette";
import { Player, type PlayerChapter } from "@/components/kit/player";
import { useToast } from "@/components/kit/toast";
import { keys } from "@/queries";
import type { BodyProps } from "./body.js";
import { outputsOf, roleOf } from "./body.js";
import { currentShorts, useShortClips } from "./body-shorts.js";
import { dockerFolderHelp, openFolder } from "./open-folder.js";
import { MetaLine, StageBody, StageFiles, useOutputText } from "./parts.js";
import { useOutputMedia } from "./revision-media.js";
import { activityText, capitalised, duration, percent, preparingSubtitles } from "./summary.js";
import { WaveAudioPlayer } from "./waveform.js";

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
  // The thumbnail stands in for the video until it plays: the first variant when there are
  // several.
  const poster = useOutputMedia(posterOf(outputs));
  const chapters = useVideoChapters(project.id, description, tags, video?.durationMs ?? null);
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
              : stage.activity !== undefined
                ? capitalised(activityText(stage) ?? "")
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
        <WaveAudioPlayer
          key={video.id}
          label="Combined narration"
          src={media?.url}
          marks={chapters}
        />
      ) : media === undefined ? null : (
        <Player
          key={video.id}
          src={media.url}
          label="Generated video"
          {...(poster === undefined ? {} : { poster: poster.url })}
          chapters={chapters}
          portrait={project.format === "9:16"}
          className={project.format === "9:16" ? "max-w-[360px]" : "max-w-[1100px]"}
          {...(playedSubtitles === "files" && vtt && captions
            ? { captions: { src: captions.url, lang: "en", label: "English" } }
            : {})}
        />
      )}

      <StageFiles
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
      {video === undefined ? null : (
        <MetaLine>
          {[
            duration(video?.durationMs ?? undefined),
            audioExport ? "WAV · stereo · 48 kHz" : project.format,
            // Level the volume: what the finished file measured.
            video?.meta.master === undefined ? undefined : masterText(video.meta.master),
          ]
            .filter((part) => part !== undefined)
            .join(" · ")}
        </MetaLine>
      )}

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
      {project.config.sources.audio === "off" ||
      wordTimingUnavailable(project.config.language) === undefined ? null : (
        // A language no model can time: say how its captions were made, and what is off.
        <p role="note" className="border-t border-line pt-3 text-small text-ink-2">
          {wordTimingUnavailable(project.config.language)}
        </p>
      )}
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

// The project's first thumbnail, which the player shows until the video plays.
export function posterOf(outputs: readonly Output[]): Output | undefined {
  return outputs
    .filter((output) => output.role === "thumbnail")
    .toSorted((left, right) => (left.meta.index ?? 1) - (right.meta.index ?? 1))[0];
}

// The YouTube chapters as marks on the player's track: the description's chapters as the
// YouTube section shows them (the user's edit kept, fitted to YouTube's rules), so a mark sits
// where YouTube will put its chapter. None until the description is written.
function useVideoChapters(
  projectId: string,
  description: Output | undefined,
  tags: Output | undefined,
  durationMs: number | null,
): readonly PlayerChapter[] {
  const { api } = useApp();
  const text = useOutputText(description).data;
  const tagsText = useOutputText(tags).data;
  const edits = useQuery({
    queryKey: keys.youtubeEdits(projectId),
    queryFn: () => readDescriptionEdits(api, projectId),
    enabled: description !== undefined,
  });
  if (text === undefined) return [];
  const shown = shownFields(
    resolveFields(splitDescription(text, tagsText ?? ""), edits.data?.fields ?? {}),
  );
  return playerChapters(shown.chapters, durationMs === null ? undefined : durationMs / 1000);
}

// "0:00 Intro" lines, fitted as YouTube takes them, as start times and titles.
export function playerChapters(text: string, durationSeconds?: number): readonly PlayerChapter[] {
  return fitChapters(text, durationSeconds)
    .text.split("\n")
    .flatMap((line) => {
      const match = /^(\S+)\s+(.+)$/u.exec(line.trim());
      const start = match === null ? undefined : parseTimestamp(match[1] ?? "");
      const title = match?.[2]?.trim() ?? "";
      return start === undefined || title === "" ? [] : [{ start, title }];
    });
}
