import { speakerColour } from "@app/slices/voices/palette.js";
import {
  type MouseEvent,
  memo,
  type ReactElement,
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Button } from "@/components/kit/button";
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

// The narration's words to read and follow: paragraphs of flowing text at the reading measure,
// each opening with its time. Pressing the words plays from the line pressed, the line being
// spoken is tinted, and a multi-voice run names each speaker in their colour. One worded "Fix
// this line" sits under the paragraph of the line last played or pressed, and opens the
// narration's editor at it, to correct its words or record it again. A narration of more than
// 150 lines is drawn a page at a time in a box that follows the spoken line; a shorter one
// reads straight down the page. `query` marks the lines that hold it; each change of `seek`
// brings the next of them into view.
export function Transcript({
  lines,
  label,
  onFix,
  query = "",
  seek = 0,
}: {
  readonly lines: readonly TranscriptLine[];
  readonly label: string;
  readonly onFix?: ((line: TranscriptLine) => void) | undefined;
  readonly query?: string;
  readonly seek?: number;
}): ReactElement {
  const clock = useMediaClock();
  const box = useRef<HTMLOListElement>(null);
  const mine = lines.filter((line) => line.media.current === clock.target);
  const at = lineAt(mine, clock.seconds);
  const playing = at === -1 ? undefined : mine[at]?.key;
  const [pressed, setPressed] = useState<string | undefined>();
  const active = playing ?? pressed;
  const long = lines.length > longNarration;
  // A two-hour narration has thousands of lines; drawing them all froze the project page for
  // seconds. Only a page of lines is drawn, and it follows the line being spoken.
  const [start, setStart] = useState(0);
  const playingAt = playing === undefined ? -1 : lines.findIndex((line) => line.key === playing);
  useEffect(() => {
    if (!long || playingAt === -1) return;
    setStart((from) =>
      playingAt < from || playingAt >= from + windowSize ? Math.max(0, playingAt - lead) : from,
    );
  }, [playingAt, long]);
  const needle = query.trim().toLowerCase();
  // Each Enter in the search box: the next line that holds the words, after the one last
  // brought into view (from the top again for new words).
  const found = useRef({ seek: 0, needle: "", at: -1 });
  useEffect(() => {
    if (seek === found.current.seek) return;
    const after = found.current.needle === needle ? found.current.at : -1;
    found.current = { seek, needle, at: after };
    if (needle === "") return;
    const hits = lines.flatMap((line, index) =>
      line.text.toLowerCase().includes(needle) ? [index] : [],
    );
    const next = hits.find((index) => index > after) ?? hits[0];
    if (next === undefined) return;
    found.current.at = next;
    if (long) setStart(Math.max(0, next - lead));
    const key = lines[next]?.key ?? "";
    requestAnimationFrame(() =>
      box.current
        ?.querySelector<HTMLElement>(`[data-line="${CSS.escape(key)}"]`)
        ?.scrollIntoView?.({ block: "center" }),
    );
  }, [seek, needle, lines, long]);
  const shown = long ? lines.slice(start, start + windowSize) : lines;
  const later = lines.length - start - shown.length;
  // In the long box, the spoken line stays in view inside the box's own scroll, never
  // scrolling the page.
  useEffect(() => {
    const list = box.current;
    if (!long || list === null || playing === undefined) return;
    const row = list.querySelector<HTMLElement>(`[data-line="${CSS.escape(playing)}"]`);
    if (row === null) return;
    if (
      row.offsetTop < list.scrollTop ||
      row.offsetTop + row.offsetHeight > list.scrollTop + list.clientHeight
    )
      list.scrollTop = Math.max(0, row.offsetTop - list.clientHeight / 3);
  }, [playing, long]);
  const play = useCallback((line: TranscriptLine) => {
    setPressed(line.key);
    playFrom(line.media.current, line.start);
  }, []);
  return (
    <div className="flex min-w-0 flex-col gap-1">
      {long && start > 0 ? (
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
        ref={box}
        aria-label={label}
        className={cn(
          "sl-transcript relative m-0 flex max-w-[68ch] list-none flex-col gap-2 p-0",
          long && "max-h-[70vh] overflow-y-auto",
        )}
      >
        {paragraphsOf(shown).map((paragraph) => (
          <Paragraph
            key={paragraph[0]?.key}
            lines={paragraph}
            playing={playing}
            active={active}
            needle={needle}
            onPlay={play}
            onFix={onFix}
          />
        ))}
      </ol>
      {long && later > 0 ? (
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

// More lines than this and the transcript is a box of its own, a page of lines at a time.
const longNarration = 150;
const windowSize = 120;
// Lines kept above the spoken one when the page moves to follow it.
const lead = 20;

// Caption lines run together into paragraphs: a new one where the speaker or the player
// changes, at a pause, or at the end of a sentence once a paragraph has a few lines. A heading
// the narration reads out ("A library at the edge of the sea", then a pause and "Around three
// hundred years…") is a paragraph of its own, so it never runs into the sentence after it.
export function paragraphsOf(lines: readonly TranscriptLine[]): readonly TranscriptLine[][] {
  const paragraphs: TranscriptLine[][] = [];
  let current: TranscriptLine[] = [];
  let afterHeading = false;
  for (const [index, line] of lines.entries()) {
    const last = current.at(-1);
    const heading = isHeading(line, lines[index + 1]);
    if (
      last !== undefined &&
      (heading ||
        afterHeading ||
        line.speaker?.name !== last.speaker?.name ||
        line.media !== last.media ||
        line.start - last.end > 1.5 ||
        (current.length >= 4 && /[.!?…]["”’)]?$/u.test(last.text.trim())))
    ) {
      paragraphs.push(current);
      current = [];
    }
    current.push(line);
    afterHeading = heading;
  }
  if (current.length > 0) paragraphs.push(current);
  return paragraphs;
}

// A line read as a heading: no closing punctuation, then a pause and a new capitalised line by
// the same voice. A caption broken mid-sentence runs on without the pause.
function isHeading(line: TranscriptLine, next: TranscriptLine | undefined): boolean {
  return (
    next !== undefined &&
    next.media === line.media &&
    next.speaker?.name === line.speaker?.name &&
    next.start - line.end >= 0.5 &&
    !endsPhrase(line.text) &&
    /^\p{Lu}/u.test(next.text.trim())
  );
}

const endsPhrase = (text: string): boolean => /[.,;:!?…"”’)\]–—-]$/u.test(text.trim());

// One paragraph: a single button whose words flow as text, so pressing anywhere in it plays
// from the line pressed (and Enter from its first line); only the paragraphs whose spoken or
// pressed line changed render again as the audio plays.
const Paragraph = memo(function Paragraph({
  lines,
  playing,
  active,
  needle,
  onPlay,
  onFix,
}: {
  readonly lines: readonly TranscriptLine[];
  readonly playing: string | undefined;
  readonly active: string | undefined;
  // What the search box holds, lower case; empty marks nothing.
  readonly needle: string;
  readonly onPlay: (line: TranscriptLine) => void;
  readonly onFix: ((line: TranscriptLine) => void) | undefined;
}): ReactElement | null {
  const first = lines[0];
  if (first === undefined) return null;
  // A heading read out stands alone and reads as one.
  const heading = lines.length === 1 && !endsPhrase(first.text);
  const fixing = onFix === undefined ? undefined : lines.find((line) => line.key === active);
  const pressed = (event: MouseEvent<HTMLButtonElement>) => {
    const key =
      event.target instanceof Element
        ? event.target.closest("[data-line]")?.getAttribute("data-line")
        : undefined;
    onPlay(lines.find((line) => line.key === key) ?? first);
  };
  return (
    <li className="m-0 flex flex-col items-start gap-1">
      <Button
        variant="quiet"
        className={cn("sl-transcript__para", heading && "sl-transcript__para--heading")}
        onClick={pressed}
      >
        <span className="sl-transcript__time">{playerTime(first.shownAt)}</span>
        {first.speaker === undefined ? null : (
          <span className="mr-1 inline-flex items-center gap-1 font-semibold">
            <span
              aria-hidden="true"
              className="inline-block size-2 rounded-full"
              style={{ backgroundColor: speakerColour(first.speaker.index) }}
            />
            {first.speaker.name}:
          </span>
        )}
        {lines.map((line, index) => (
          <span key={line.key}>
            {index === 0 ? null : " "}
            <span
              data-line={line.key}
              aria-current={line.key === playing ? "true" : undefined}
              {...(needle !== "" && line.text.toLowerCase().includes(needle)
                ? { "data-match": "" }
                : {})}
              className="sl-transcript__line"
            >
              {line.text}
            </span>
          </span>
        ))}
      </Button>
      {fixing === undefined || onFix === undefined ? null : (
        <Button size="small" onClick={() => onFix(fixing)}>
          Fix this line
          <span className="sr-only">: “{fixing.text.slice(0, 60)}”</span>
        </Button>
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
