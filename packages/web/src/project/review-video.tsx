import type { ProjectSummary } from "@app/slices/admission/model.js";
import type { Output } from "@app/slices/storage/model.js";
import { type ReactElement, type RefObject, useCallback, useMemo } from "react";
import { Button } from "@/components/kit/button";
import { type PlayerChapter, playerTime } from "@/components/kit/player";
import { useNarrationChunks, useTimedLines } from "./review-narration.js";
import { chunkOfLine } from "./review-timing.js";
import { playFrom, speakerNames, Transcript, type TranscriptLine } from "./review-transcript.js";

// Under the finished video (or combined audio): its chapters and the narration's transcript,
// each time a press away from playing there, with speakers named on a multi-voice run, and the
// passages the captions left out at their own times. A podcast's conversation is checked here,
// turn by turn.
export function VideoReview({
  project,
  outputs,
  media,
  chapters,
  omissions,
}: {
  readonly project: ProjectSummary;
  readonly outputs: readonly Output[];
  readonly media: RefObject<HTMLMediaElement | null>;
  readonly chapters: readonly PlayerChapter[];
  readonly omissions: readonly { readonly start: number; readonly text: string }[];
}): ReactElement | null {
  const timed = useTimedLines(outputs);
  const { chunks, open } = useNarrationChunks();
  const voices = project.config.voices;
  const lines: readonly TranscriptLine[] = useMemo(() => {
    const speaker = speakerNames(voices?.speakers);
    return timed.map((line, index) => ({
      key: String(index),
      text: line.text,
      start: line.start,
      end: line.end,
      shownAt: line.start,
      media,
      speaker: speaker(line.speaker),
    }));
  }, [timed, media, voices]);
  const fix = useCallback(
    (line: TranscriptLine) => open?.(chunkOfLine(chunks, line.text)),
    [open, chunks],
  );
  const conversation = voices?.format === "podcast" || voices?.format === "interview";
  if (lines.length === 0 && chapters.length === 0 && omissions.length === 0) return null;
  return (
    <>
      {chapters.length === 0 ? null : (
        <nav aria-label="Chapters" className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {chapters.map((chapter) => (
            <TimeButton
              key={`${String(chapter.start)}-${chapter.title}`}
              seconds={chapter.start}
              media={media}
              label={chapter.title}
            />
          ))}
        </nav>
      )}
      {lines.length === 0 ? null : (
        <details className="border-t border-line pt-3" open={conversation}>
          <summary className="cursor-pointer text-small font-semibold">
            {conversation ? "Conversation, turn by turn" : "Transcript"}
          </summary>
          <p className="m-0 mt-2 mb-1 text-small text-ink-2">
            {voices === undefined
              ? "Press a line to play from there."
              : "Press a line to play from there; each line names its speaker."}
          </p>
          <Transcript
            lines={lines}
            label={conversation ? "Conversation" : "Transcript"}
            onFix={open === undefined ? undefined : fix}
            {...(conversation ? { fixLabel: "Correct or remake this turn" } : {})}
          />
        </details>
      )}
      {omissions.length === 0 ? null : (
        <details className="border-t border-line pt-3 text-small">
          <summary className="cursor-pointer font-semibold">
            Subtitles recovered after missing narration ({omissions.length})
          </summary>
          <p className="m-0 mt-2 text-ink-2">
            These transcript passages could not be matched to the audio and were left out of the
            captions. The audio is unchanged. Press a time to hear that moment before sharing.
          </p>
          <ul className="m-0 mt-2 flex flex-col gap-2 pl-5">
            {omissions.map((omission) => (
              <li key={`${String(omission.start)}-${omission.text}`}>
                <TimeButton seconds={omission.start} media={media} /> — {omission.text}
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}

function TimeButton({
  seconds,
  media,
  label,
}: {
  readonly seconds: number;
  readonly media: RefObject<HTMLMediaElement | null>;
  readonly label?: string;
}): ReactElement {
  return (
    <Button
      variant="quiet"
      size="small"
      className="gap-1 font-normal"
      aria-label={`Play from ${playerTime(seconds)}${label === undefined ? "" : `, ${label}`}`}
      onClick={() => playFrom(media.current, seconds)}
    >
      <strong className="tabular-nums text-ink">{playerTime(seconds)}</strong>
      {label}
    </Button>
  );
}
