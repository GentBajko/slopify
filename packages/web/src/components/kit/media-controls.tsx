import { PauseIcon, PlayIcon, Volume2Icon, VolumeXIcon } from "lucide-react";
import {
  type KeyboardEvent,
  type PointerEvent,
  type ReactElement,
  type Ref,
  type RefCallback,
  type RefObject,
  type SyntheticEvent,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/utils";
import { Button, IconButton } from "./button.js";

// What the video Player and the AudioPlayer share: one hook that keeps a media element's state
// and moves it (play, seek, volume, speed), and the controls drawn from it (the play key, the
// time, the lime seek track, mute and volume, the speed menu). Each player adds its own frame.

export interface PlayerChapter {
  // Seconds from the start.
  readonly start: number;
  readonly title: string;
}

export const playbackRates = [0.75, 1, 1.25, 1.5, 1.75, 2] as const;

// "0:07", "12:40", "2:04:11".
export function playerTime(seconds: number): string {
  const whole = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const rest = String(whole % 60).padStart(2, "0");
  return hours > 0
    ? `${String(hours)}:${String(minutes).padStart(2, "0")}:${rest}`
    : `${String(minutes)}:${rest}`;
}

function rateLabel(rate: number): string {
  return `${String(rate)}×`;
}

// The chapter a time falls in: the last one starting at or before it.
function chapterAt(chapters: readonly PlayerChapter[], seconds: number): PlayerChapter | undefined {
  return chapters.filter((chapter) => chapter.start <= seconds).at(-1);
}

export function mergeRefs<T>(...refs: readonly (Ref<T> | undefined)[]): RefCallback<T> {
  return (value) => {
    for (const ref of refs) {
      if (typeof ref === "function") ref(value);
      else if (ref !== null && ref !== undefined) ref.current = value;
    }
  };
}

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

type MediaEvent = SyntheticEvent<HTMLMediaElement>;

export interface MediaControls {
  readonly media: RefObject<HTMLMediaElement | null>;
  readonly menuId: string;
  readonly playing: boolean;
  readonly current: number;
  readonly duration: number;
  readonly buffered: number;
  readonly known: boolean;
  readonly volume: number;
  readonly muted: boolean;
  readonly rate: number;
  readonly menu: boolean;
  readonly setMenu: (open: boolean | ((open: boolean) => boolean)) => void;
  readonly hover: number | null;
  readonly setHover: (at: number | null) => void;
  readonly seeking: boolean;
  readonly setSeeking: (on: boolean) => void;
  readonly toggle: () => void;
  readonly seekTo: (seconds: number) => void;
  readonly jump: (step: number) => void;
  readonly setLevel: (level: number) => void;
  readonly toggleMute: () => void;
  readonly pickRate: (rate: number) => void;
  // The media element's handlers that keep the state; spread them onto <video> or <audio>.
  readonly events: {
    readonly onPlay: (event: MediaEvent) => void;
    readonly onPause: (event: MediaEvent) => void;
    readonly onEnded: (event: MediaEvent) => void;
    readonly onTimeUpdate: (event: MediaEvent) => void;
    readonly onDurationChange: (event: MediaEvent) => void;
    readonly onLoadedMetadata: (event: MediaEvent) => void;
    readonly onProgress: (event: MediaEvent) => void;
    readonly onVolumeChange: (event: MediaEvent) => void;
    readonly onRateChange: (event: MediaEvent) => void;
  };
  // The YouTube keys both players answer: Space or K plays and pauses, J and L jump ten
  // seconds, the arrows five, M mutes and 0 to 9 jump to that tenth. Undefined for any other.
  readonly keyAction: (key: string) => (() => void) | undefined;
}

export function useMediaControls(): MediaControls {
  const media = useRef<HTMLMediaElement | null>(null);
  const menuId = useId();
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [rate, setRate] = useState(1);
  const [menu, setMenu] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  const [seeking, setSeeking] = useState(false);
  const known = Number.isFinite(duration) && duration > 0;

  const toggle = () => {
    const element = media.current;
    if (element === null) return;
    if (element.paused || element.ended) {
      const promise = element.play() as Promise<void> | undefined;
      promise?.catch(() => undefined);
    } else element.pause();
  };
  const seekTo = (seconds: number) => {
    const element = media.current;
    if (element === null || !known) return;
    const next = clamp(seconds, 0, duration);
    element.currentTime = next;
    setCurrent(next);
  };
  const jump = (step: number) => seekTo((media.current?.currentTime ?? current) + step);
  const setLevel = (level: number) => {
    const element = media.current;
    if (element === null) return;
    const next = clamp(Math.round(level * 100) / 100, 0, 1);
    element.volume = next;
    element.muted = next === 0;
    setVolume(next);
    setMuted(next === 0);
  };
  const toggleMute = () => {
    const element = media.current;
    if (element === null) return;
    element.muted = !element.muted;
    setMuted(element.muted);
  };
  const pickRate = (next: number) => {
    const element = media.current;
    if (element !== null) element.playbackRate = next;
    setRate(next);
    setMenu(false);
    document.getElementById(`${menuId}-button`)?.focus();
  };
  const keyAction = (key: string): (() => void) | undefined => {
    const lower = key.length === 1 ? key.toLowerCase() : key;
    if (lower === " " || lower === "k") return toggle;
    if (lower === "j") return () => jump(-10);
    if (lower === "l") return () => jump(10);
    if (lower === "ArrowLeft") return () => jump(-5);
    if (lower === "ArrowRight") return () => jump(5);
    if (lower === "m") return toggleMute;
    if (/^[0-9]$/.test(lower)) return () => seekTo((Number(lower) / 10) * duration);
    return undefined;
  };

  return {
    media,
    menuId,
    playing,
    current,
    duration,
    buffered,
    known,
    volume,
    muted,
    rate,
    menu,
    setMenu,
    hover,
    setHover,
    seeking,
    setSeeking,
    toggle,
    seekTo,
    jump,
    setLevel,
    toggleMute,
    pickRate,
    keyAction,
    events: {
      onPlay: () => setPlaying(true),
      onPause: () => setPlaying(false),
      onEnded: () => setPlaying(false),
      onTimeUpdate: (event) => {
        if (!seeking) setCurrent(event.currentTarget.currentTime);
      },
      onDurationChange: (event) => setDuration(event.currentTarget.duration),
      onLoadedMetadata: (event) => setDuration(event.currentTarget.duration),
      onProgress: (event) => {
        const ranges = event.currentTarget.buffered;
        setBuffered(ranges.length > 0 ? ranges.end(ranges.length - 1) : 0);
      },
      onVolumeChange: (event) => {
        setVolume(event.currentTarget.volume);
        setMuted(event.currentTarget.muted);
      },
      onRateChange: (event) => setRate(event.currentTarget.playbackRate),
    },
  };
}

// A pointer's place along a track, 0 to 1.
function fraction(element: HTMLDivElement | null, clientX: number): number {
  const rect = element?.getBoundingClientRect();
  if (rect === undefined || rect.width === 0) return 0;
  return clamp((clientX - rect.left) / rect.width, 0, 1);
}

// Stops a key the control handled from reaching the player's own keys, or a lightbox around it.
function handled(event: KeyboardEvent, act: (() => void) | undefined): void {
  if (act === undefined) return;
  event.preventDefault();
  event.stopPropagation();
  act();
}

export function PlayPause({
  controls,
  className,
}: {
  readonly controls: MediaControls;
  readonly className?: string;
}): ReactElement {
  return (
    <IconButton
      size="small"
      label={controls.playing ? "Pause" : "Play"}
      className={className}
      onClick={controls.toggle}
    >
      {controls.playing ? (
        <PauseIcon aria-hidden="true" strokeWidth={1.75} />
      ) : (
        <PlayIcon aria-hidden="true" strokeWidth={1.75} />
      )}
    </IconButton>
  );
}

// "0:12 / 2:00". The total is its own span, so a narrow player can keep only where it is.
export function PlayTime({ controls }: { readonly controls: MediaControls }): ReactElement {
  return (
    <span className="sl-player__time">
      <span className="sl-player__now">{playerTime(controls.current)}</span>
      <span className="sl-player__total">
        {` / ${controls.known ? playerTime(controls.duration) : "-:--"}`}
      </span>
    </span>
  );
}

// The lime seek track: the buffered range, chapter marks, a time tip on hover, click and drag
// to seek, and the arrows, Page keys, Home and End as a slider.
export function SeekTrack({
  controls,
  chapters = [],
  waveform,
}: {
  readonly controls: MediaControls;
  // Marks on the track, each titled on hover.
  readonly chapters?: readonly PlayerChapter[];
  // The audio's loudness as bars from 0 to 1, drawn in place of the rail: lime up to where it
  // plays, pale after. Absent, the thin rail with its buffered range.
  readonly waveform?: readonly number[] | undefined;
}): ReactElement {
  const track = useRef<HTMLDivElement>(null);
  const { known, duration, current, buffered, seeking, hover } = controls;
  // One bar per few pixels of the track, the loudest of the peaks it covers: however many peaks
  // a long narration has, the bars stay apart and readable.
  const width = useTrackWidth(track);
  const bars = waveform === undefined ? undefined : foldPeaks(waveform, width);
  const marks = known
    ? chapters.filter((chapter) => chapter.start > 0 && chapter.start < duration)
    : [];
  const onDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!known) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    controls.setSeeking(true);
    controls.seekTo(fraction(track.current, event.clientX) * duration);
  };
  const onMove = (event: PointerEvent<HTMLDivElement>) => {
    const at = fraction(track.current, event.clientX);
    controls.setHover(at);
    if (seeking) controls.seekTo(at * duration);
  };
  const onUp = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    controls.setSeeking(false);
  };
  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const moves: Readonly<Record<string, () => void>> = {
      ArrowLeft: () => controls.jump(-5),
      ArrowDown: () => controls.jump(-5),
      ArrowRight: () => controls.jump(5),
      ArrowUp: () => controls.jump(5),
      PageDown: () => controls.jump(-10),
      PageUp: () => controls.jump(10),
      Home: () => controls.seekTo(0),
      End: () => controls.seekTo(duration),
    };
    handled(event, moves[event.key]);
  };
  const played = known ? (current / duration) * 100 : 0;
  const loaded = known ? (buffered / duration) * 100 : 0;
  const tip = hover === null || !known ? undefined : hover * duration;
  const tipChapter = tip === undefined ? undefined : chapterAt(chapters, tip);
  return (
    <div
      ref={track}
      role="slider"
      tabIndex={0}
      aria-label="Seek"
      aria-valuemin={0}
      aria-valuemax={known ? Math.floor(duration) : 0}
      aria-valuenow={Math.floor(current)}
      aria-valuetext={`${playerTime(current)} of ${known ? playerTime(duration) : "unknown length"}`}
      aria-disabled={!known}
      className="sl-player__track"
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onPointerLeave={() => controls.setHover(null)}
      onKeyDown={onKey}
    >
      {bars === undefined || bars.length === 0 ? (
        <span className="sl-player__rail">
          <span className="sl-player__buffered" style={{ width: `${String(loaded)}%` }} />
          <span className="sl-player__played" style={{ width: `${String(played)}%` }} />
        </span>
      ) : (
        <span className="sl-player__wave" data-slot="waveform" aria-hidden="true">
          {bars.map((level, bar) => (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: bars are positional and never reorder.
              key={bar}
              className="sl-player__peak"
              data-played={((bar + 0.5) / bars.length) * 100 <= played ? "" : undefined}
              style={{ height: `${String(Math.max(12, Math.round(level * 100)))}%` }}
            />
          ))}
        </span>
      )}
      {marks.map((chapter) => (
        <span
          key={`${String(chapter.start)}-${chapter.title}`}
          className="sl-player__mark"
          data-chapter={chapter.title}
          title={chapter.title}
          style={{ left: `${String((chapter.start / duration) * 100)}%` }}
        />
      ))}
      <span className="sl-player__knob" style={{ left: `${String(played)}%` }} />
      {tip === undefined || hover === null ? null : (
        <span
          className="sl-player__tip"
          aria-hidden="true"
          style={{ left: `${String(hover * 100)}%` }}
        >
          {tipChapter === undefined ? null : (
            <span className="sl-player__tip-title">{tipChapter.title}</span>
          )}
          {playerTime(tip)}
        </span>
      )}
    </div>
  );
}

// Mute, then the volume slider beside it.
export function VolumeControl({ controls }: { readonly controls: MediaControls }): ReactElement {
  const volumeTrack = useRef<HTMLDivElement>(null);
  const { muted, volume } = controls;
  const level = muted ? 0 : volume;
  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const moves: Readonly<Record<string, number>> = {
      ArrowLeft: level - 0.05,
      ArrowDown: level - 0.05,
      ArrowRight: level + 0.05,
      ArrowUp: level + 0.05,
      Home: 0,
      End: 1,
    };
    const next = moves[event.key];
    handled(event, next === undefined ? undefined : () => controls.setLevel(next));
  };
  return (
    <>
      <IconButton
        size="small"
        label={muted ? "Unmute" : "Mute"}
        aria-pressed={muted}
        className="sl-player__mute"
        onClick={controls.toggleMute}
      >
        {muted || volume === 0 ? (
          <VolumeXIcon aria-hidden="true" strokeWidth={1.75} />
        ) : (
          <Volume2Icon aria-hidden="true" strokeWidth={1.75} />
        )}
      </IconButton>
      <div
        ref={volumeTrack}
        role="slider"
        tabIndex={0}
        aria-label="Volume"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(level * 100)}
        aria-valuetext={muted ? "Muted" : `${String(Math.round(level * 100))}%`}
        className="sl-player__volume"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture?.(event.pointerId);
          controls.setLevel(fraction(volumeTrack.current, event.clientX));
        }}
        onPointerMove={(event) => {
          if (event.buttons === 1) controls.setLevel(fraction(volumeTrack.current, event.clientX));
        }}
        onKeyDown={onKey}
      >
        <span className="sl-player__rail">
          <span className="sl-player__played" style={{ width: `${String(level * 100)}%` }} />
        </span>
      </div>
    </>
  );
}

// The speed key and its menu, opening on the speed now playing as a native menu does.
export function SpeedMenu({ controls }: { readonly controls: MediaControls }): ReactElement {
  const { menuId, menu, rate } = controls;
  const onMenuKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      handled(event, () => {
        controls.setMenu(false);
        document.getElementById(`${menuId}-button`)?.focus();
      });
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const items = [...event.currentTarget.querySelectorAll<HTMLElement>("[role=menuitemradio]")];
    const at = items.indexOf(document.activeElement as HTMLElement);
    const next = items[(at + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length];
    handled(event, () => next?.focus());
  };
  return (
    <span className="sl-player__speed">
      <Button
        id={`${menuId}-button`}
        variant="quiet"
        size="small"
        className="sl-player__rate"
        aria-label={`Playback speed, ${rateLabel(rate)}`}
        aria-haspopup="menu"
        aria-expanded={menu}
        aria-controls={menu ? `${menuId}-menu` : undefined}
        onClick={() => controls.setMenu((open) => !open)}
      >
        {rateLabel(rate)}
      </Button>
      {menu ? (
        <div
          id={`${menuId}-menu`}
          role="menu"
          aria-label="Playback speed"
          className="sl-player__menu"
          onKeyDown={onMenuKey}
        >
          {playbackRates.map((one) => (
            <Button
              key={one}
              variant="quiet"
              size="small"
              role="menuitemradio"
              aria-checked={one === rate}
              className={cn("sl-player__option")}
              autoFocus={one === rate}
              onClick={() => controls.pickRate(one)}
            >
              {one === 1 ? "Normal" : rateLabel(one)}
            </Button>
          ))}
        </div>
      ) : null}
    </span>
  );
}

// Pixels per bar: a 2-pixel bar and its gap.
const pixelsPerBar = 4;

// The peaks folded to fit: at most one bar per `pixelsPerBar`, each the loudest peak it covers.
// Before the track is measured (width 0), the peaks as they are.
export function foldPeaks(peaks: readonly number[], width: number): readonly number[] {
  const room = Math.floor(width / pixelsPerBar);
  if (room <= 0 || peaks.length <= room) return peaks;
  const folded: number[] = [];
  for (let bar = 0; bar < room; bar += 1) {
    const from = Math.floor((bar * peaks.length) / room);
    const to = Math.max(from + 1, Math.floor(((bar + 1) * peaks.length) / room));
    folded.push(Math.max(...peaks.slice(from, to)));
  }
  return folded;
}

function useTrackWidth(track: RefObject<HTMLDivElement | null>): number {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = track.current;
    if (element === null) return;
    setWidth(element.clientWidth);
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setWidth(element.clientWidth));
    observer.observe(element);
    return () => observer.disconnect();
  }, [track]);
  return width;
}
