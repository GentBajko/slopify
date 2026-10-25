import type { ReactElement, RefObject } from "react";
import { Button } from "@/components/kit/button";
import { Fold } from "@/components/kit/fold";
import { type PlayerChapter, playerTime } from "@/components/kit/player";
import { playFrom } from "./review-transcript.js";

// Beside the finished video (or combined audio): its chapters, each a press away from playing
// there. The narration's words are read in the Narration section, in step with its player.
export function VideoChapters({
  chapters,
  media,
}: {
  readonly chapters: readonly PlayerChapter[];
  readonly media: RefObject<HTMLMediaElement | null>;
}): ReactElement | null {
  if (chapters.length === 0) return null;
  return (
    <nav aria-label="Chapters" className="flex min-w-0 flex-col items-start gap-1">
      <h3 className="sl-kicker m-0">Chapters</h3>
      {chapters.map((chapter) => (
        <TimeButton
          key={`${String(chapter.start)}-${chapter.title}`}
          seconds={chapter.start}
          media={media}
          label={chapter.title}
        />
      ))}
    </nav>
  );
}

// The passages the captions left out, at their own times, to hear before sharing.
export function VideoOmissions({
  omissions,
  media,
}: {
  readonly omissions: readonly { readonly start: number; readonly text: string }[];
  readonly media: RefObject<HTMLMediaElement | null>;
}): ReactElement | null {
  if (omissions.length === 0) return null;
  return (
    <Fold summary="Passages left out of the captions" state={String(omissions.length)}>
      <p className="m-0 mt-2 text-small text-ink-2">
        These passages could not be matched to the audio, so the captions skip them; the audio is
        unchanged. Press a time to hear that moment.
      </p>
      <ul className="m-0 mt-2 flex flex-col gap-2 pl-5 text-small">
        {omissions.map((omission) => (
          <li key={`${String(omission.start)}-${omission.text}`}>
            <TimeButton seconds={omission.start} media={media} /> {omission.text}
          </li>
        ))}
      </ul>
    </Fold>
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
      className="h-auto min-h-[30px] max-w-full justify-start gap-2 py-1 text-left font-normal whitespace-normal"
      aria-label={`Play from ${playerTime(seconds)}${label === undefined ? "" : `, ${label}`}`}
      onClick={() => playFrom(media.current, seconds)}
    >
      <strong className="tabular-nums text-ink">{playerTime(seconds)}</strong>
      {label}
    </Button>
  );
}
