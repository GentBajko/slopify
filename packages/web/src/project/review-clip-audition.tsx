import type { ShortPick } from "@app/slices/shorts/pick.js";
import type { ReactElement } from "react";
import { Button } from "@/components/kit/button";
import type { Audition } from "./review-audition.js";

// ceiling: how much of a clip's ending "Hear the ending" plays, in seconds.
const endingSeconds = 6;

// Hears a clip as it is now set, a moved start or end included, from the finished video's
// sound, before anything is rendered again.
export function ClipAudition({
  audition,
  clip,
}: {
  readonly audition: Audition;
  readonly clip: Pick<ShortPick, "number" | "start" | "end">;
}): ReactElement | null {
  const play = audition.play;
  if (play === undefined) return null;
  const number = String(clip.number);
  const whole = `short-${number}`;
  const ending = `short-${number}-end`;
  const toggle = (id: string, start: number) =>
    audition.playing === id ? audition.stop() : play(start, clip.end, id);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        size="small"
        variant="quiet"
        aria-label={audition.playing === whole ? `Stop short ${number}` : `Play short ${number}`}
        onClick={() => toggle(whole, clip.start)}
      >
        {audition.playing === whole ? "Stop" : "Play the clip"}
      </Button>
      <Button
        type="button"
        size="small"
        variant="quiet"
        aria-label={
          audition.playing === ending
            ? `Stop the ending of short ${number}`
            : `Hear the ending of short ${number}`
        }
        onClick={() => toggle(ending, Math.max(clip.start, clip.end - endingSeconds))}
      >
        {audition.playing === ending ? "Stop" : "Hear the ending"}
      </Button>
      <span className="text-label text-ink-3">
        From the finished video, as the range is set now
      </span>
    </div>
  );
}
