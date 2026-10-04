import { speakerColour } from "@app/slices/voices/palette.js";
import { PencilIcon } from "lucide-react";
import { memo, type ReactElement, type RefObject, useEffect, useRef, useState } from "react";
import { Button, IconButton } from "@/components/kit/button";
import { playerTime } from "@/components/kit/player";
import { cn } from "@/lib/utils";
import { lineAt } from "./review-timing.js";

// One line to follow along with: its words, who says them, and where it plays — the player
// it belongs to and its time within that player's file.
export interface TranscriptLine {
  readonly key: string;
  readonly text: string;
  readonly start: number;
  readonly end: number;
  readonly media: RefObject<HTMLMediaElement | null>;
  // The time shown beside the line, on the whole narration: "4:12".
  readonly shownAt: number;
  readonly speaker?: { readonly name: string; readonly index: number } | undefined;
}

// Plays `media` from `seconds`.
export function playFrom(media: HTMLMediaElement | null, seconds: number): void {
  if (media === null) return;
  media.currentTime = seconds;
  void media.play().catch(() => undefined);
}

// Which media element is playing and where: media events do not bubble, but a capturing
// listener on the document still hears every player's time updates.
export function useMediaClock(): { readonly target: EventTarget | null; readonly seconds: number } {
  const [clock, setClock] = useState<{ target: EventTarget | null; seconds: number }>({
    target: null,
    seconds: 0,
  });
  useEffect(() => {
    const heard = (event: Event) => {
      const media = event.target;
      if (!(media instanceof HTMLMediaElement)) return;
      setClock((current) =>
        current.target === media && Math.abs(current.seconds - media.currentTime) < 0.05
          ? current
          : { target: media, seconds: media.currentTime },
      );
    };
    document.addEventListener("timeupdate", heard, true);
    document.addEventListener("seeked", heard, true);
    return () => {
      document.removeEventListener("timeupdate", heard, true);
      document.removeEventListener("seeked", heard, true);
    };
  }, []);
  return clock;
}

// The transcript beside a player: press a line to play from there, the line being spoken is
// marked while it plays, and a multi-voice run names each line's speaker in their colour. With
// `onFix`, each line offers the narration editor at the passage it was spoken from.
export function Transcript({
  lines,
  label,
  onFix,
  fixLabel = "Correct or remake this passage",
}: {
  readonly lines: readonly TranscriptLine[];
  readonly label: string;
  readonly onFix?: ((line: TranscriptLine) => void) | undefined;
  readonly fixLabel?: string;
}): ReactElement {
  const clock = useMediaClock();
  const list = useRef<HTMLOListElement>(null);
  const mine = lines.filter((line) => line.media.current === clock.target);
  const at = lineAt(mine, clock.seconds);
  const current = at === -1 ? undefined : mine[at]?.key;
  // A two-hour narration has thousands of lines; drawing them all froze the project page for
  // seconds. Only a page of lines is drawn, and it follows the line being spoken.
  const [start, setStart] = useState(0);
  const playingAt = current === undefined ? -1 : lines.findIndex((line) => line.key === current);
  useEffect(() => {
    if (playingAt === -1) return;
    setStart((from) =>
      playingAt < from || playingAt >= from + windowSize ? Math.max(0, playingAt - lead) : from,
    );
  }, [playingAt]);
  const shown = lines.slice(start, start + windowSize);
  const later = lines.length - start - shown.length;
  // The spoken line stays in view inside the list's own scroll, never scrolling the page.
  useEffect(() => {
    const box = list.current;
    if (box === null || current === undefined) return;
    const row = box.querySelector<HTMLElement>(`[data-line="${CSS.escape(current)}"]`);
    if (row === null) return;
    if (
      row.offsetTop < box.scrollTop ||
      row.offsetTop + row.offsetHeight > box.scrollTop + box.clientHeight
    )
      box.scrollTop = Math.max(0, row.offsetTop - box.clientHeight / 3);
  }, [current]);
  return (
    <div className="flex min-w-0 flex-col gap-1">
      {start > 0 ? (
        <Button
          variant="quiet"
          size="small"
          className="self-start"
          onClick={() => setStart(Math.max(0, start - windowSize))}
        >
          {`Earlier lines (${String(start)} before ${playerTime(lines[start]?.shownAt ?? 0)})`}
        </Button>
      ) : null}
      <ol
        ref={list}
        aria-label={label}
        className="relative m-0 flex max-h-[420px] list-none flex-col overflow-y-auto p-0"
      >
        {shown.map((line) => (
          <Row
            key={line.key}
            line={line}
            playing={line.key === current}
            onFix={onFix}
            fixLabel={fixLabel}
          />
        ))}
      </ol>
      {later > 0 ? (
        <Button
          variant="quiet"
          size="small"
          className="self-start"
          onClick={() => setStart(start + windowSize)}
        >
          {`Later lines (${String(later)} more)`}
        </Button>
      ) : null}
    </div>
  );
}

const windowSize = 120;
// Lines kept above the spoken one when the page moves to follow it.
const lead = 20;

// One line; only the rows whose playing state changed render again as the audio plays.
const Row = memo(function Row({
  line,
  playing,
  onFix,
  fixLabel,
}: {
  readonly line: TranscriptLine;
  readonly playing: boolean;
  readonly onFix: ((line: TranscriptLine) => void) | undefined;
  readonly fixLabel: string;
}): ReactElement {
  return (
    <li
      data-line={line.key}
      aria-current={playing ? "true" : undefined}
      className={cn(
        "group grid grid-cols-[52px_minmax(0,1fr)_auto] items-start gap-2 rounded-control px-2 py-1",
        playing && "bg-accent-tint",
      )}
    >
      <Button
        variant="quiet"
        size="small"
        className="h-auto justify-start px-1 py-0.5 text-label font-normal tabular-nums"
        aria-label={`Play from ${playerTime(line.shownAt)}`}
        onClick={() => playFrom(line.media.current, line.start)}
      >
        {playerTime(line.shownAt)}
      </Button>
      <Button
        variant="quiet"
        size="small"
        className={cn(
          "block h-auto min-w-0 whitespace-normal px-1 py-0.5 text-left text-small font-normal [--btn-soft:transparent]",
          playing && "text-ink",
        )}
        onClick={() => playFrom(line.media.current, line.start)}
      >
        {line.speaker === undefined ? null : (
          <span className="mr-2 inline-flex items-center gap-1 font-semibold text-ink">
            <span
              aria-hidden="true"
              className="inline-block size-2 rounded-full"
              style={{ backgroundColor: speakerColour(line.speaker.index) }}
            />
            {line.speaker.name}:
          </span>
        )}
        {line.text}
      </Button>
      {onFix === undefined ? (
        <span />
      ) : (
        <IconButton
          size="small"
          label={`${fixLabel}: “${line.text.slice(0, 40)}”`}
          tip={fixLabel}
          className="opacity-60 group-hover:opacity-100 focus-visible:opacity-100"
          onClick={() => onFix(line)}
        >
          <PencilIcon aria-hidden="true" strokeWidth={1.75} />
        </IconButton>
      )}
    </li>
  );
});

// A multi-voice run's speakers by id, with their place in the speaker list for their colour.
export function speakerNames(
  speakers: readonly { readonly id: string; readonly name: string }[] | undefined,
): (id: string | undefined) => { readonly name: string; readonly index: number } | undefined {
  return (id) => {
    if (id === undefined || speakers === undefined) return undefined;
    const index = speakers.findIndex((speaker) => speaker.id === id);
    const speaker = speakers[index];
    return speaker === undefined ? { name: id, index: 0 } : { name: speaker.name || id, index };
  };
}
