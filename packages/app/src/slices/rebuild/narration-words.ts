import { causedBy } from "../../kernel/errors.js";
import type { RevisionView } from "../revisions/model.js";
import { type NarrationAudioDeps, narrationAudio } from "./runtime-export-inputs.js";
import { wordsSchema } from "./runtime-subtitles.js";

export type BodyWordTimings =
  | { readonly ok: true; readonly value: string }
  | { readonly ok: false; readonly reason: string };

// The word timing of the body narration file alone. The subtitles stage timed the words on the
// export's clock (`narrationAudio`); the body file starts at zero, so its words move back by
// where the body starts, and the intro's and outro's are left out. Refused, with why, when the
// timing can't be read or the narration can't be timed.
export async function bodyWordTimings(
  deps: NarrationAudioDeps,
  view: RevisionView,
  words: string,
): Promise<BodyWordTimings> {
  try {
    const timing = wordsSchema.parse(JSON.parse(words));
    const timeline = await narrationAudio(deps, view);
    const before = timeline.findIndex((segment) => segment.kind === "body");
    const start = timeline.slice(0, before).reduce((sum, segment) => sum + segment.seconds, 0);
    const end = start + (timeline[before]?.seconds ?? 0);
    // Times are rounded to the millisecond, so a body word can sit a hair before the body.
    const inBody = (at: number) => at >= start - 0.001 && at < end;
    return {
      ok: true,
      value: JSON.stringify({
        ...timing,
        words: timing.words
          .filter((word) => inBody(word.start))
          .map((word) => ({
            ...word,
            start: Math.max(0, word.start - start),
            end: Math.min(word.end, end) - start,
          })),
        omissions: timing.omissions
          .filter((omission) => inBody(omission.start))
          .map((omission) => ({ ...omission, start: Math.max(0, omission.start - start) })),
      }),
    };
  } catch (error) {
    return { ok: false, reason: causedBy(error) };
  }
}
