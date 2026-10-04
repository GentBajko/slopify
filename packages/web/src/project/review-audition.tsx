import type { RevisionView } from "@app/slices/revisions/model.js";
import { type ReactElement, useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "@/app-context";
import { revisionFileUrl } from "./revision-api.js";

// Hearing a stretch of the narration timeline before anything is rendered: a caption's words,
// a short's moved start or end. The finished video (or, with Video off, the combined audio) runs
// on the same timeline the captions and the shorts are timed on, so its sound plays the stretch.

export interface Audition {
  // The hidden player; render it once.
  readonly element: ReactElement | null;
  // Undefined while there is nothing current to play from.
  readonly play: ((start: number, end: number, id: string) => void) | undefined;
  readonly stop: () => void;
  // Which stretch is playing, by the id it was started with.
  readonly playing: string | undefined;
}

// The current, finished file the timeline plays in: the video, else the combined audio. A file
// made before the narration last changed is on another timeline, so none is offered then.
export function timelineSource(view: RevisionView | undefined): string | undefined {
  const row =
    view?.outputs.find(
      (one) =>
        one.selected &&
        one.available &&
        one.state === "ready" &&
        one.output.stageKind === "video" &&
        one.output.role === "video",
    ) ??
    view?.outputs.find(
      (one) =>
        one.selected &&
        one.available &&
        one.state === "ready" &&
        one.output.role === "audio_export",
    );
  return row === undefined ? undefined : row.recordId;
}

export function useAudition(view: RevisionView | undefined): Audition {
  const { api } = useApp();
  const record = timelineSource(view);
  const src =
    record === undefined || view === undefined
      ? undefined
      : revisionFileUrl(api, view.revision.projectId, view.revision.id, record);
  const audio = useRef<HTMLAudioElement>(null);
  const until = useRef<number | undefined>(undefined);
  const [playing, setPlaying] = useState<string | undefined>();
  const stop = useCallback(() => {
    audio.current?.pause();
    until.current = undefined;
    setPlaying(undefined);
  }, []);
  useEffect(() => stop, [stop]);
  const play = useCallback((start: number, end: number, id: string) => {
    const player = audio.current;
    if (player === null) return;
    player.currentTime = Math.max(0, start);
    until.current = end;
    setPlaying(id);
    void player.play().catch(() => {
      until.current = undefined;
      setPlaying(undefined);
    });
  }, []);
  return {
    element:
      src === undefined ? null : (
        // biome-ignore lint/a11y/useMediaCaption: a stretch of the narration, heard on request; its words are on screen beside the button.
        <audio
          ref={audio}
          src={src}
          preload="none"
          hidden
          onTimeUpdate={(event) => {
            if (until.current !== undefined && event.currentTarget.currentTime >= until.current)
              stop();
          }}
          onEnded={stop}
          onPause={() => {
            if (until.current === undefined) setPlaying(undefined);
          }}
        />
      ),
    play: src === undefined ? undefined : play,
    stop,
    playing,
  };
}
