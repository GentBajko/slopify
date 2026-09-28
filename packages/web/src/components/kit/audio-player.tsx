import type { KeyboardEvent, ReactElement, ReactEventHandler, Ref } from "react";
import { cn } from "@/lib/utils";
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

// Narration, intros and outros, podcast and audiobook files play in Slopify's own strip, never
// the browser's grey pill: the video Player's bar on its own, dark in both themes. A lime play
// key, the time in tabular numerals, the same lime track (buffered range, marks, a time tip,
// click, drag and keys to seek), mute and volume, and the speed menu. Inside it the keys are the
// Player's: Space or K plays, J and L jump ten seconds, the arrows five, M mutes, 0 to 9 jump.
// `compact` is the short strip for tight rows: a smaller key, no volume slider. With `waveform`
// (the audio's loudness, `project/waveform.ts`) the track draws its bars instead of a thin line.

export function AudioPlayer({
  src,
  label,
  marks = [],
  waveform,
  compact = false,
  preload = "metadata",
  onError,
  ref,
  className,
}: {
  readonly src: string | undefined;
  // The accessible name of the audio: "Body narration".
  readonly label: string;
  // Chapter or segment marks on the track, each titled on hover.
  readonly marks?: readonly PlayerChapter[];
  // Loudness bars from 0 to 1; absent while loading or where there is none.
  readonly waveform?: readonly number[] | undefined;
  readonly compact?: boolean;
  readonly preload?: "none" | "metadata" | "auto";
  readonly onError?: ReactEventHandler<HTMLAudioElement>;
  readonly ref?: Ref<HTMLAudioElement>;
  readonly className?: string;
}): ReactElement {
  const controls = useMediaControls();
  const audio = controls.media as Ref<HTMLAudioElement>;
  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    // A focused button keeps Space for itself.
    if (event.key === " " && (event.target as HTMLElement).closest("button") !== null) return;
    const act = controls.keyAction(event.key);
    if (act === undefined) return;
    event.preventDefault();
    event.stopPropagation();
    act();
  };
  return (
    // biome-ignore lint/a11y/useSemanticElements: a strip of player controls; a fieldset's legend and box would fight it.
    <div
      role="group"
      aria-label={`${label} controls`}
      data-slot="audio-player"
      data-state={controls.playing ? "playing" : "paused"}
      className={cn(
        "sl-audio",
        compact && "sl-audio--compact",
        waveform !== undefined && waveform.length > 0 && "sl-audio--wave",
        className,
      )}
      onKeyDown={onKey}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          controls.setMenu(false);
      }}
    >
      <audio
        ref={mergeRefs(audio, ref)}
        src={src}
        preload={preload}
        aria-label={label}
        onError={onError}
        {...controls.events}
      />
      <PlayPause controls={controls} className="sl-audio__key" />
      <PlayTime controls={controls} />
      <SeekTrack controls={controls} chapters={marks} waveform={waveform} />
      <VolumeControl controls={controls} />
      <SpeedMenu controls={controls} />
    </div>
  );
}
