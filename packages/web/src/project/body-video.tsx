import { wordTimingUnavailable } from "@app/kernel/ports/languages.js";
import type { ProjectSummary } from "@app/slices/admission/model.js";
import { masterText } from "@app/slices/loudness/model.js";
import { assetOf } from "@app/slices/storage/asset-name.js";
import type { Output } from "@app/slices/storage/model.js";
import { fitChapters } from "@app/slices/youtube/chapters.js";
import { resolveFields, shownFields, splitDescription } from "@app/slices/youtube/edits.js";
import { parseTimestamp } from "@app/slices/youtube/timestamps.js";
import { useQuery } from "@tanstack/react-query";
import { CopyIcon } from "lucide-react";
import { type ReactElement, use, useRef } from "react";
import { readDescriptionEdits } from "@/api";
import { useApp } from "@/app-context";
import { Button, ButtonRow } from "@/components/kit/button";
import { useCommand } from "@/components/kit/command-palette";
import { Fold } from "@/components/kit/fold";
import { TextLink } from "@/components/kit/link";
import { Player, type PlayerChapter } from "@/components/kit/player";
import { useToast } from "@/components/kit/toast";
import { keys } from "@/queries";
import type { BodyProps } from "./body.js";
import { outputsOf, roleOf } from "./body.js";
import { dockerFolderHelp, openFolder } from "./open-folder.js";
import {
  DownloadMenu,
  downloadWords,
  fileSize,
  MetaLine,
  OutputFolder,
  StageBody,
  type StageFile,
  useOlderOutputs,
  useOutputText,
} from "./parts.js";
import { LeadDownloadContext, TitleDownloadContext } from "./read-only.js";
import { VideoChapters, VideoOmissions } from "./review-video.js";
import { useOutputMedia } from "./revision-media.js";
import { YoutubeCopyContext } from "./section-copy.js";
import { activityText, capitalised, percent, preparingSubtitles } from "./summary.js";
import { WaveAudioPlayer } from "./waveform.js";

// The final stage: the player and, beside it once the column is wide enough, everything a
// person takes away from it — the main download named for its file, the folder, the other
// files as quiet links, one line of facts in plain words, the chapters, and the YouTube
// text's two copies. Narrower, the same blocks stack under the player. An audiobook or a
// podcast leads with its listening file. The YouTube text and the shorts have their own
// sections; the narration's words are read in Narration.
export function VideoBody({ stage, project, outputs }: BodyProps) {
  const { api } = useApp();
  const notify = useToast();
  const lead = use(LeadDownloadContext);
  // The title row already downloads this file: the section does not offer it again.
  const carried = use(TitleDownloadContext);
  const copies = use(YoutubeCopyContext);
  const audioExport =
    project.config.sources.video === "off" && project.config.sources.audio !== "off";
  const own = outputsOf(outputs, stage);
  const video = roleOf(own, audioExport ? "audio_export" : "video");
  const srt = roleOf(own, "subtitles_srt");
  const vtt = roleOf(own, "subtitles_vtt");
  const written = roleOf(own, "youtube_description") !== undefined;
  const listening = listeningFiles(project, roleOf(own, "audio_mp3"), roleOf(own, "audio_m4b"));
  const media = useOutputMedia(video);
  // The thumbnail stands in for the video until it plays: the first variant when there are
  // several.
  const poster = useOutputMedia(posterOf(outputs));
  const chapters = useVideoChapters(
    project.id,
    roleOf(own, "youtube_description"),
    roleOf(own, "youtube_tags"),
    video?.durationMs ?? null,
  );
  const captions = useOutputMedia(vtt);
  const playedSubtitles = video?.meta.subtitlesMode ?? project.config.subtitles?.mode;
  const rendering = stage.state === "running";
  // The chapter and omission times play the file from there.
  const played = useRef<HTMLMediaElement | null>(null);
  const hold = (element: HTMLMediaElement | null) => {
    played.current = element;
  };
  const done = percent(stage.progressCurrent ?? 0, stage.progressTotal ?? 0);
  const main: StageFile = {
    output: video,
    label: audioExport ? "Audio (.wav)" : "Video (.mp4)",
  };
  const older = useOlderOutputs(
    [listening?.main.output, video].filter((one): one is Output => one !== undefined),
  );
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
            : "The folder couldn't be opened. Use Open folder beside the video.",
          "error",
        );
      }
    },
  });

  // No video and no sound-only export: nothing of this stage to show.
  if (project.config.sources.video === "off" && !audioExport) return null;

  const shape = project.format;
  // The length and the shape are the status list's, beside the section: said once.
  const facts = [
    fileSize(video?.bytes),
    video?.meta.master === undefined
      ? undefined
      : video.meta.master.target === -14 && !audioExport
        ? "loudness set for YouTube"
        : "volume evened out",
  ].filter((part) => part !== undefined);
  const copy = (part: "description" | "tags") => {
    const run = copies?.current[part];
    if (run === undefined)
      notify(`The ${part} is still loading. Press Copy ${part} again.`, "info");
    else run();
  };
  const technical = [listening?.main.output, video].flatMap((output) =>
    output?.meta.master === undefined
      ? []
      : [
          `${output === video ? (audioExport ? "Audio" : "Video") : (listening?.main.label ?? "")}: ${masterText(output.meta.master)}.`,
        ],
  );
  const subtitles = [
    { output: srt, label: ".srt", file: "Captions (.srt)" },
    { output: vtt, label: ".vtt", file: "Captions (.vtt)" },
  ].filter(
    (one): one is { output: Output; label: string; file: string } => one.output !== undefined,
  );

  return (
    <StageBody className="@container">
      {rendering ? (
        <p className="m-0 text-small text-accent-ink">
          {preparingSubtitles(stage, project.config)
            ? `Preparing captions · ${String(percent(stage.progressCurrent ?? 0, 35))}%`
            : audioExport
              ? "Exporting combined audio"
              : stage.activity !== undefined
                ? capitalised(activityText(stage) ?? "")
                : stage.progressTotal === null
                  ? "Making the video"
                  : `Making the video · ${String(done)}%`}
        </p>
      ) : null}
      <div
        className={
          shape === "9:16"
            ? "grid items-start justify-start gap-x-6 gap-y-4 @min-[620px]:grid-cols-[minmax(0,360px)_300px]"
            : shape === "1:1"
              ? "grid items-start justify-start gap-x-6 gap-y-4 @min-[760px]:grid-cols-[minmax(0,520px)_300px]"
              : "grid items-start justify-start gap-x-6 gap-y-4 @min-[760px]:grid-cols-[minmax(0,720px)_300px]"
        }
      >
        <div className="min-w-0">
          {video === undefined ? (
            <p className="m-0 text-small text-ink-2">
              {audioExport
                ? "No combined audio export has landed yet."
                : "No video has landed yet."}
            </p>
          ) : audioExport ? (
            <WaveAudioPlayer
              key={video.id}
              ref={hold}
              label="Combined narration"
              src={media?.url}
              marks={chapters}
            />
          ) : media === undefined ? null : (
            <Player
              key={video.id}
              ref={hold}
              src={media.url}
              label="Generated video"
              {...(poster === undefined ? {} : { poster: poster.url })}
              chapters={chapters}
              portrait={shape === "9:16"}
              square={shape === "1:1"}
              className={
                shape === "9:16"
                  ? "max-w-[360px]"
                  : shape === "1:1"
                    ? "max-w-[520px]"
                    : "max-w-[720px]"
              }
              {...(playedSubtitles === "files" && vtt && captions
                ? { captions: { src: captions.url, lang: "en", label: "English" } }
                : {})}
            />
          )}
        </div>
        {video === undefined && listening === undefined ? null : (
          <div className="flex min-w-0 flex-col gap-3">
            <ButtonRow>
              {listening === undefined || carried === assetOf(listening.main.output) ? null : (
                <DownloadMenu
                  files={[listening.main]}
                  variant={lead ? "primary" : "secondary"}
                  noteOlder={false}
                />
              )}
              {video !== undefined && carried === assetOf(video) ? null : (
                <DownloadMenu
                  files={[main]}
                  variant={lead && listening === undefined ? "primary" : "secondary"}
                  noteOlder={false}
                />
              )}
              <OutputFolder output={video ?? listening?.main.output} />
            </ButtonRow>
            {/* Said once, here, rather than on the button: a button named "… (previous
                version)" ran out of the 300px column. */}
            {older.size === 0 ? null : (
              <MetaLine>
                {rendering
                  ? "Being made again: the download is the current file until the new one is ready."
                  : "Made before your last change: the download is that previous version until you make it again."}
              </MetaLine>
            )}
            {subtitles.length === 0 && listening?.other === undefined ? null : (
              <p className="m-0 flex flex-wrap items-center gap-x-3 gap-y-1 text-small text-ink-2">
                {subtitles.length === 0 ? null : (
                  <span className="inline-flex flex-wrap items-center gap-x-2">
                    Captions:
                    {subtitles.map((one) => (
                      <FileWord
                        key={one.output.id}
                        output={one.output}
                        label={one.label}
                        file={one.file}
                      />
                    ))}
                  </span>
                )}
                {listening?.other === undefined ? null : (
                  <span className="inline-flex flex-wrap items-center gap-x-2">
                    Also:
                    <FileWord
                      output={listening.other.output}
                      label={listening.other.label}
                      file={listening.other.file}
                    />
                  </span>
                )}
              </p>
            )}
            {facts.length === 0 ? null : <MetaLine>{facts.join(" · ")}</MetaLine>}
            <VideoChapters chapters={chapters} media={played} />
            {written && copies !== undefined ? (
              <ButtonRow>
                <Button onClick={() => copy("description")}>
                  <CopyIcon aria-hidden="true" strokeWidth={1.75} />
                  Copy description
                </Button>
                <Button onClick={() => copy("tags")}>
                  <CopyIcon aria-hidden="true" strokeWidth={1.75} />
                  Copy tags
                </Button>
              </ButtonRow>
            ) : null}
            {project.config.sources.audio === "off" ? null : (
              <TextLink
                to="/projects/$projectId"
                params={{ projectId: project.id }}
                search={{ section: "narration" }}
                resetScroll={false}
                className="self-start text-small"
              >
                Read the narration
              </TextLink>
            )}
          </div>
        )}
      </div>

      {/* What the render could not do as asked: an image shown still because its clip could
          not be made. */}
      {video?.meta.warnings?.length ? (
        <ul
          aria-label="Notes from making the video"
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
        <p role="note" className="m-0 text-small text-ink-2">
          {wordTimingUnavailable(project.config.language)}
        </p>
      )}
      <VideoOmissions omissions={video?.meta.subtitleOmissions ?? []} media={played} />
      {technical.length === 0 ? null : (
        <Fold summary="Technical details">
          <p className="m-0 mt-2 text-small text-ink-2 tabular-nums">{technical.join(" ")}</p>
        </Fold>
      )}
    </StageBody>
  );
}

// What a finished audiobook or podcast downloads from the title row: its own file, named for
// it ("Download audiobook (.m4b)"), by the asset name its URL takes. Undefined for a video
// project, or before the file is made.
export function listeningDownload(
  project: ProjectSummary,
  outputs: readonly Output[],
): { readonly asset: string; readonly label: string } | undefined {
  const listening = listeningFiles(
    project,
    outputs.find((output) => output.role === "audio_mp3"),
    outputs.find((output) => output.role === "audio_m4b"),
  );
  return listening === undefined
    ? undefined
    : { asset: assetOf(listening.main.output), label: downloadWords(listening.main.label) };
}

// An audiobook's or a podcast's own file, which it leads with: the chaptered M4B for a book or
// a drama, the MP3 for an episode. The other format is offered beside it.
function listeningFiles(
  project: ProjectSummary,
  mp3: Output | undefined,
  m4b: Output | undefined,
):
  | {
      readonly main: StageFile & { readonly output: Output };
      readonly other?: { readonly output: Output; readonly label: string; readonly file: string };
    }
  | undefined {
  const format = project.config.voices?.format;
  if (format === undefined) return undefined;
  const book = format === "audiobook" || format === "drama";
  const main = book ? m4b : mp3;
  const other = book ? mp3 : m4b;
  if (main === undefined) return undefined;
  const name =
    format === "audiobook" ? "Audiobook" : format === "drama" ? "Radio drama" : "Episode";
  return {
    main: { output: main, label: `${name} (.${book ? "m4b" : "mp3"})` },
    ...(other === undefined
      ? {}
      : {
          other: {
            output: other,
            label: book ? ".mp3 with chapters" : ".m4b with chapters",
            file: book ? "Audio with chapters (.mp3)" : "Audiobook with chapters (.m4b)",
          },
        }),
  };
}

// One of the stage's other files, as a quiet link in a sentence (".srt"), named in full for a
// screen reader and on hover ("Subtitles (.srt)").
function FileWord({
  output,
  label,
  file,
}: {
  readonly output: Output;
  readonly label: string;
  readonly file: string;
}): ReactElement | null {
  const media = useOutputMedia(output);
  if (media === undefined) return null;
  return (
    <a
      href={media.url}
      download
      className="sl-link"
      title={file}
      aria-label={`Download ${file.charAt(0).toLowerCase()}${file.slice(1)}`}
    >
      {label}
    </a>
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
