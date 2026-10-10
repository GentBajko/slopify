import { causedBy } from "../../kernel/errors.js";
import type { RevisionView } from "../revisions/model.js";
import type { AudioSegment } from "../video/plan.js";
import {
  type NarrationAudioDeps,
  narrationAudio,
  narrationTimeline,
  speaksPart,
} from "./runtime-export-inputs.js";
import { wordsSchema } from "./runtime-subtitles.js";

export type BodyWordTimings =
  // `unclipped` says why the last words were not cut at the body's end.
  | { readonly ok: true; readonly value: string; readonly unclipped?: string }
  | { readonly ok: false; readonly reason: string };

// The narration's parts on the timing's clock. A body with no intro or outro starts at a known
// place, after the edge silence: its length only clips the last words, so one that can't be
// measured (an upload too long for the measuring timeout) still gives its words, unclipped.
async function timelineOf(
  deps: NarrationAudioDeps,
  view: RevisionView,
): Promise<{ readonly timeline: readonly AudioSegment[]; readonly unclipped?: string }> {
  const config = view.revision.config;
  let unmeasured: unknown;
  const measure = async (path: string): Promise<number> => {
    try {
      return await deps.measure(path);
    } catch (error) {
      unmeasured = error;
      throw error;
    }
  };
  try {
    return { timeline: await narrationAudio({ ...deps, measure }, view) };
  } catch (error) {
    const alone = !speaksPart(config, "intro") && !speaksPart(config, "outro");
    if (!alone || unmeasured === undefined) throw error;
    const body = { path: "", seconds: Number.POSITIVE_INFINITY };
    return {
      timeline: narrationTimeline(config, { body, intro: undefined, outro: undefined }),
      unclipped: causedBy(unmeasured),
    };
  }
}

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
    const { timeline, unclipped } = await timelineOf(deps, view);
    // The words were timed with every part the settings speak; without one, the body's place
    // on that clock is unknown.
    for (const part of ["intro", "outro"] as const)
      if (
        speaksPart(view.revision.config, part) &&
        !timeline.some((segment) => segment.kind === part)
      )
        return {
          ok: false,
          reason: `the narration's ${part} has no finished audio, so where the body starts on the timing's clock is unknown`,
        };
    const before = timeline.findIndex((segment) => segment.kind === "body");
    const start = timeline.slice(0, before).reduce((sum, segment) => sum + segment.seconds, 0);
    const end = start + (timeline[before]?.seconds ?? 0);
    // Times are rounded to the millisecond, so a body word can sit a hair before the body.
    const inBody = (at: number) => at >= start - 0.001 && at < end;
    return {
      ok: true,
      ...(unclipped === undefined ? {} : { unclipped }),
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
