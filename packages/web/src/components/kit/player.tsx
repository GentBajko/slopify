import {
  CaptionsIcon,
  MaximizeIcon,
  MinimizeIcon,
  PauseIcon,
  PictureInPicture2Icon,
  PlayIcon,
  Volume2Icon,
  VolumeXIcon,
} from "lucide-react";
import {
  type FocusEvent,
  type KeyboardEvent,
  type PointerEvent,
  type ReactElement,
  type ReactNode,
  type Ref,
  type RefCallback,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/utils";
import { Button, IconButton } from "./button.js";

// Video plays in Slopify's own player: the poster and a big play key until it starts, then a
// bar on a gradient with play, time, a lime track (buffered range, chapter marks, a time tip
// on hover, click and drag to seek), volume, speed, captions, picture in picture and full
// screen. The bar hides while the video plays and nobody touches it. The keys are YouTube's:
// Space or K plays and pauses, J and L jump ten seconds, the arrows five, M mutes, F goes full
// screen, C toggles captions and 0 to 9 jump to that tenth of the video.

export interface PlayerChapter {
  // Seconds from the start.
  readonly start: number;
  readonly title: string;
}

export const playbackRates = [0.75, 1, 1.25, 1.5, 1.75, 2] as const;

// ceiling: how long the bar stays after the pointer last moved while the video plays.
const idleMs = 2500;

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

function mergeRefs<T>(...refs: readonly (Ref<T> | undefined)[]): RefCallback<T> {
  return (value) => {
    for (const ref of refs) {
      if (typeof ref === "function") ref(value);
      else if (ref !== null && ref !== undefined) ref.current = value;
    }
  };
}

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

export function Player({
  src,
  poster,
  label,
  portrait = false,
  captions,
  chapters = [],
  ref,
  className,
  children,
}: {
  readonly src: string;
  readonly poster?: string;
  // The accessible name: "History: Cleopatra, final video".
  readonly label: string;
  readonly portrait?: boolean;
  // A WebVTT track, when there is one.
  readonly captions?: { readonly src: string; readonly lang: string; readonly label: string };
  // Marks on the track, each titled on hover: the video's YouTube chapters.
  readonly chapters?: readonly PlayerChapter[];
  readonly ref?: Ref<HTMLVideoElement>;
  readonly className?: string;
  // Extra <track> or <source> elements.
  readonly children?: ReactNode;
}): ReactElement {
  const video = useRef<HTMLVideoElement | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const volumeTrack = useRef<HTMLDivElement>(null);
  const idle = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const menuId = useId();
  const [started, setStarted] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [rate, setRate] = useState(1);
  const [captionsOn, setCaptionsOn] = useState(false);
  const [tracks, setTracks] = useState(0);
  const [full, setFull] = useState(false);
  const [pip, setPip] = useState(false);
  const [menu, setMenu] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  const [seeking, setSeeking] = useState(false);
  const [focused, setFocused] = useState(false);
  const [shown, setShown] = useState(true);

  const media = () => video.current;
  const known = Number.isFinite(duration) && duration > 0;
  const hasCaptions = captions !== undefined || tracks > 0;
  const pipAvailable =
    typeof document !== "undefined" &&
    "pictureInPictureEnabled" in document &&
    document.pictureInPictureEnabled === true;
  const marks = known
    ? chapters.filter((chapter) => chapter.start > 0 && chapter.start < duration)
    : [];

  // The bar shows on any movement, and hides again while playing unless a menu is open, focus
  // is inside or the track is being dragged.
  const wake = useCallback(() => {
    setShown(true);
    clearTimeout(idle.current);
    idle.current = setTimeout(() => setShown(false), idleMs);
  }, []);
  useEffect(() => () => clearTimeout(idle.current), []);
  const bare = playing && !shown && !menu && !focused && !seeking && hover === null;

  useEffect(() => {
    const onChange = () => setFull(document.fullscreenElement === box.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  useEffect(() => {
    const element = video.current;
    if (element === null) return;
    const enter = () => setPip(true);
    const leave = () => setPip(false);
    element.addEventListener("enterpictureinpicture", enter);
    element.addEventListener("leavepictureinpicture", leave);
    return () => {
      element.removeEventListener("enterpictureinpicture", enter);
      element.removeEventListener("leavepictureinpicture", leave);
    };
  }, []);

  // Captions follow the toggle: the first text track shows or hides.
  useEffect(() => {
    const list = video.current?.textTracks;
    if (list === undefined) return;
    for (let index = 0; index < list.length; index += 1) {
      const one = list[index];
      if (one !== undefined) one.mode = captionsOn && index === 0 ? "showing" : "hidden";
    }
  }, [captionsOn]);

  const toggle = () => {
    const element = media();
    if (element === null) return;
    if (element.paused || element.ended) {
      setStarted(true);
      const promise = element.play() as Promise<void> | undefined;
      promise?.catch(() => undefined);
    } else element.pause();
  };
  const seekTo = (seconds: number) => {
    const element = media();
    if (element === null || !known) return;
    const next = clamp(seconds, 0, duration);
    element.currentTime = next;
    setCurrent(next);
  };
  const jump = (step: number) => seekTo((media()?.currentTime ?? current) + step);
  const setLevel = (level: number) => {
    const element = media();
    if (element === null) return;
    const next = clamp(Math.round(level * 100) / 100, 0, 1);
    element.volume = next;
    element.muted = next === 0;
    setVolume(next);
    setMuted(next === 0);
  };
  const toggleMute = () => {
    const element = media();
    if (element === null) return;
    element.muted = !element.muted;
    setMuted(element.muted);
  };
  const pickRate = (next: number) => {
    const element = media();
    if (element !== null) element.playbackRate = next;
    setRate(next);
    setMenu(false);
    document.getElementById(`${menuId}-button`)?.focus();
  };
  const toggleFull = () => {
    const container = box.current;
    if (container === null) return;
    if (document.fullscreenElement === container) void document.exitFullscreen?.();
    else void container.requestFullscreen?.()?.catch(() => undefined);
  };
  const togglePip = () => {
    const element = media();
    if (element === null) return;
    if (document.pictureInPictureElement === element)
      void document.exitPictureInPicture?.().catch(() => undefined);
    else void element.requestPictureInPicture?.().catch(() => undefined);
  };

  // A pointer's place along a track, 0 to 1.
  const fraction = (element: HTMLDivElement | null, clientX: number): number => {
    const rect = element?.getBoundingClientRect();
    if (rect === undefined || rect.width === 0) return 0;
    return clamp((clientX - rect.left) / rect.width, 0, 1);
  };
  const onTrackDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!known) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setSeeking(true);
    seekTo(fraction(track.current, event.clientX) * duration);
  };
  const onTrackMove = (event: PointerEvent<HTMLDivElement>) => {
    const at = fraction(track.current, event.clientX);
    setHover(at);
    if (seeking) seekTo(at * duration);
  };
  const onTrackUp = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    setSeeking(false);
  };
  const onVolumeDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setLevel(fraction(volumeTrack.current, event.clientX));
  };
  const onVolumeMove = (event: PointerEvent<HTMLDivElement>) => {
    if (event.buttons === 1) setLevel(fraction(volumeTrack.current, event.clientX));
  };

  const onTrackKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const moves: Readonly<Record<string, () => void>> = {
      ArrowLeft: () => jump(-5),
      ArrowDown: () => jump(-5),
      ArrowRight: () => jump(5),
      ArrowUp: () => jump(5),
      PageDown: () => jump(-10),
      PageUp: () => jump(10),
      Home: () => seekTo(0),
      End: () => seekTo(duration),
    };
    const move = moves[event.key];
    if (move === undefined) return;
    event.preventDefault();
    event.stopPropagation();
    move();
  };
  const onVolumeKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const level = muted ? 0 : volume;
    const moves: Readonly<Record<string, number>> = {
      ArrowLeft: level - 0.05,
      ArrowDown: level - 0.05,
      ArrowRight: level + 0.05,
      ArrowUp: level + 0.05,
      Home: 0,
      End: 1,
    };
    const next = moves[event.key];
    if (next === undefined) return;
    event.preventDefault();
    event.stopPropagation();
    setLevel(next);
  };
  const onMenuKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setMenu(false);
      document.getElementById(`${menuId}-button`)?.focus();
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    event.stopPropagation();
    const items = [...event.currentTarget.querySelectorAll<HTMLElement>("[role=menuitemradio]")];
    const at = items.indexOf(document.activeElement as HTMLElement);
    const next = items[(at + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length];
    next?.focus();
  };

  // The player's own keys, anywhere inside it. A focused button keeps Space and Enter.
  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target as HTMLElement;
    const onButton = target.closest("button") !== null;
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    const act: (() => void) | undefined =
      key === " "
        ? onButton
          ? undefined
          : toggle
        : key === "k"
          ? toggle
          : key === "j"
            ? () => jump(-10)
            : key === "l"
              ? () => jump(10)
              : key === "ArrowLeft"
                ? () => jump(-5)
                : key === "ArrowRight"
                  ? () => jump(5)
                  : key === "m"
                    ? toggleMute
                    : key === "f"
                      ? toggleFull
                      : key === "c"
                        ? hasCaptions
                          ? () => setCaptionsOn((on) => !on)
                          : undefined
                        : /^[0-9]$/.test(key)
                          ? () => seekTo((Number(key) / 10) * duration)
                          : undefined;
    if (act === undefined) return;
    // The player's key is the player's alone: the lightbox around it does not page on it.
    event.preventDefault();
    event.stopPropagation();
    wake();
    act();
  };
  const onBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setFocused(false);
      setMenu(false);
    }
  };

  const played = known ? (current / duration) * 100 : 0;
  const loaded = known ? (buffered / duration) * 100 : 0;
  const tip = hover === null || !known ? undefined : hover * duration;
  const tipChapter = tip === undefined ? undefined : chapterAt(chapters, tip);
  const level = muted ? 0 : volume;

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: the player's keyboard shortcuts work wherever focus is inside it; each control is its own button or slider.
    <div
      ref={box}
      data-slot="player"
      data-state={playing ? "playing" : "paused"}
      className={cn(
        "sl-player",
        portrait && "sl-player--portrait",
        bare && "sl-player--bare",
        full && "sl-player--full",
        className,
      )}
      onKeyDown={onKey}
      onPointerMove={wake}
      onPointerDown={wake}
      onFocus={() => setFocused(true)}
      onBlur={onBlur}
    >
      {/* biome-ignore lint/a11y/useMediaCaption: the track is passed when the video has one; burned-in captions need none. */}
      <video
        ref={mergeRefs(video, ref)}
        src={src}
        poster={poster}
        preload="metadata"
        playsInline
        aria-label={label}
        onClick={toggle}
        onPlay={() => {
          setStarted(true);
          setPlaying(true);
          wake();
        }}
        onPause={() => {
          setPlaying(false);
          setShown(true);
        }}
        onEnded={() => {
          setPlaying(false);
          setShown(true);
        }}
        onTimeUpdate={(event) => {
          if (!seeking) setCurrent(event.currentTarget.currentTime);
        }}
        onDurationChange={(event) => setDuration(event.currentTarget.duration)}
        onLoadedMetadata={(event) => {
          setDuration(event.currentTarget.duration);
          setTracks(event.currentTarget.textTracks?.length ?? 0);
        }}
        onProgress={(event) => {
          const ranges = event.currentTarget.buffered;
          setBuffered(ranges.length > 0 ? ranges.end(ranges.length - 1) : 0);
        }}
        onVolumeChange={(event) => {
          setVolume(event.currentTarget.volume);
          setMuted(event.currentTarget.muted);
        }}
        onRateChange={(event) => setRate(event.currentTarget.playbackRate)}
      >
        {captions === undefined ? null : (
          <track
            kind="captions"
            src={captions.src}
            srcLang={captions.lang}
            label={captions.label}
          />
        )}
        {children}
      </video>

      {started ? null : (
        <IconButton label={`Play ${label}`} className="sl-player__big" onClick={toggle}>
          <PlayIcon aria-hidden="true" strokeWidth={1.75} />
        </IconButton>
      )}

      {/* biome-ignore lint/a11y/useSemanticElements: a bar of player controls over the video; a fieldset's legend and box would fight it. */}
      <div className="sl-player__bar" role="group" aria-label={`${label} controls`}>
        <IconButton size="small" label={playing ? "Pause" : "Play"} onClick={toggle}>
          {playing ? (
            <PauseIcon aria-hidden="true" strokeWidth={1.75} />
          ) : (
            <PlayIcon aria-hidden="true" strokeWidth={1.75} />
          )}
        </IconButton>
        <span className="sl-player__time">
          {`${playerTime(current)} / ${known ? playerTime(duration) : "-:--"}`}
        </span>
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
          onPointerDown={onTrackDown}
          onPointerMove={onTrackMove}
          onPointerUp={onTrackUp}
          onPointerCancel={onTrackUp}
          onPointerLeave={() => setHover(null)}
          onKeyDown={onTrackKey}
        >
          <span className="sl-player__rail">
            <span className="sl-player__buffered" style={{ width: `${String(loaded)}%` }} />
            <span className="sl-player__played" style={{ width: `${String(played)}%` }} />
          </span>
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
        <IconButton
          size="small"
          label={muted ? "Unmute" : "Mute"}
          aria-pressed={muted}
          onClick={toggleMute}
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
          onPointerDown={onVolumeDown}
          onPointerMove={onVolumeMove}
          onKeyDown={onVolumeKey}
        >
          <span className="sl-player__rail">
            <span className="sl-player__played" style={{ width: `${String(level * 100)}%` }} />
          </span>
        </div>
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
            onClick={() => setMenu((open) => !open)}
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
                  className="sl-player__option"
                  // The menu opens on the speed now playing, as a native menu does.
                  autoFocus={one === rate}
                  onClick={() => pickRate(one)}
                >
                  {one === 1 ? "Normal" : rateLabel(one)}
                </Button>
              ))}
            </div>
          ) : null}
        </span>
        {hasCaptions ? (
          <IconButton
            size="small"
            label="Captions"
            aria-pressed={captionsOn}
            onClick={() => setCaptionsOn((on) => !on)}
          >
            <CaptionsIcon aria-hidden="true" strokeWidth={1.75} />
          </IconButton>
        ) : null}
        {pipAvailable ? (
          <IconButton
            size="small"
            label="Picture in picture"
            aria-pressed={pip}
            onClick={togglePip}
          >
            <PictureInPicture2Icon aria-hidden="true" strokeWidth={1.75} />
          </IconButton>
        ) : null}
        <IconButton
          size="small"
          label={full ? "Exit full screen" : "Full screen"}
          aria-pressed={full}
          onClick={toggleFull}
        >
          {full ? (
            <MinimizeIcon aria-hidden="true" strokeWidth={1.75} />
          ) : (
            <MaximizeIcon aria-hidden="true" strokeWidth={1.75} />
          )}
        </IconButton>
      </div>
    </div>
  );
}
