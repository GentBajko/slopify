import {
  CaptionsIcon,
  MaximizeIcon,
  MinimizeIcon,
  PictureInPicture2Icon,
  PlayIcon,
} from "lucide-react";
import {
  type FocusEvent,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
  type Ref,
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/utils";
import { IconButton } from "./button.js";
import {
  mergeRefs,
  type PlayerChapter,
  PlayPause,
  PlayTime,
  SeekTrack,
  SpeedMenu,
  useMediaControls,
  VolumeControl,
} from "./media-controls.js";

export { type PlayerChapter, playbackRates, playerTime } from "./media-controls.js";

// Video plays in Slopify's own player: the poster and a big play key until it starts, then a
// bar on a gradient with play, time, a lime track (buffered range, chapter marks, a time tip
// on hover, click and drag to seek), volume, speed, captions, picture in picture and full
// screen. The bar hides while the video plays and nobody touches it. The keys are YouTube's:
// Space or K plays and pauses, J and L jump ten seconds, the arrows five, M mutes, F goes full
// screen, C toggles captions and 0 to 9 jump to that tenth of the video. The play, time, track,
// volume and speed controls are media-controls.tsx's, shared with the AudioPlayer.

// ceiling: how long the bar stays after the pointer last moved while the video plays.
const idleMs = 2500;

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
  const controls = useMediaControls();
  const video = controls.media as RefObject<HTMLVideoElement | null>;
  const box = useRef<HTMLDivElement>(null);
  const idle = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [started, setStarted] = useState(false);
  const [captionsOn, setCaptionsOn] = useState(false);
  const [tracks, setTracks] = useState(0);
  const [full, setFull] = useState(false);
  const [pip, setPip] = useState(false);
  const [focused, setFocused] = useState(false);
  const [shown, setShown] = useState(true);
  const { playing, menu, seeking, hover, events } = controls;

  const hasCaptions = captions !== undefined || tracks > 0;
  const pipAvailable =
    typeof document !== "undefined" &&
    "pictureInPictureEnabled" in document &&
    document.pictureInPictureEnabled === true;

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
  }, [video]);

  // Captions follow the toggle: the first text track shows or hides.
  useEffect(() => {
    const list = video.current?.textTracks;
    if (list === undefined) return;
    for (let index = 0; index < list.length; index += 1) {
      const one = list[index];
      if (one !== undefined) one.mode = captionsOn && index === 0 ? "showing" : "hidden";
    }
  }, [captionsOn, video]);

  const toggle = () => {
    const element = video.current;
    if (element !== null && (element.paused || element.ended)) setStarted(true);
    controls.toggle();
  };
  const toggleFull = () => {
    const container = box.current;
    if (container === null) return;
    if (document.fullscreenElement === container) void document.exitFullscreen?.();
    else void container.requestFullscreen?.()?.catch(() => undefined);
  };
  const togglePip = () => {
    const element = video.current;
    if (element === null) return;
    if (document.pictureInPictureElement === element)
      void document.exitPictureInPicture?.().catch(() => undefined);
    else void element.requestPictureInPicture?.().catch(() => undefined);
  };

  // The player's own keys, anywhere inside it. A focused button keeps Space and Enter.
  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const onButton = (event.target as HTMLElement).closest("button") !== null;
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    const act: (() => void) | undefined =
      key === " " && onButton
        ? undefined
        : key === " " || key === "k"
          ? toggle
          : key === "f"
            ? toggleFull
            : key === "c"
              ? hasCaptions
                ? () => setCaptionsOn((on) => !on)
                : undefined
              : controls.keyAction(key);
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
      controls.setMenu(false);
    }
  };

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
      <video
        ref={mergeRefs(video, ref)}
        src={src}
        poster={poster}
        preload="metadata"
        playsInline
        aria-label={label}
        onClick={toggle}
        {...events}
        onPlay={(event) => {
          events.onPlay(event);
          setStarted(true);
          wake();
        }}
        onPause={(event) => {
          events.onPause(event);
          setShown(true);
        }}
        onEnded={(event) => {
          events.onEnded(event);
          setShown(true);
        }}
        onLoadedMetadata={(event) => {
          events.onLoadedMetadata(event);
          setTracks(event.currentTarget.textTracks?.length ?? 0);
        }}
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
        <PlayPause controls={{ ...controls, toggle }} />
        <PlayTime controls={controls} />
        <SeekTrack controls={controls} chapters={chapters} />
        <VolumeControl controls={controls} />
        <SpeedMenu controls={controls} />
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
            className="sl-player__pip"
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
