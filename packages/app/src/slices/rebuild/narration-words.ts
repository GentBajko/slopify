import { causedBy } from "../../kernel/errors.js";
import type { Log } from "../../kernel/log.js";
import type { RevisionView } from "../revisions/model.js";
import { type NarrationAudioDeps, narrationAudio } from "./runtime-export-inputs.js";
import { wordsSchema } from "./runtime-subtitles.js";

// The word timing for one narration file, as the agent's get_project_file hands it out. The
// timing is on the export's clock (the subtitles stage timed it on `narrationAudio`), which the
// audio export plays on. The body file alone starts at zero: its words move back by where the
// body starts, and the intro's and outro's are left out. Undefined, and logged, when the
// timing can't be read or the narration can't be timed.
export async function wordTimingsFor(
  deps: NarrationAudioDeps & { readonly log: Pick<Log, "write"> },
  view: RevisionView,
  asset: "audio-body" | "audio-export",
  words: string,
): Promise<string | undefined> {
  if (asset === "audio-export") return words;
  const projectId = view.revision.projectId;
  try {
    const timing = wordsSchema.parse(JSON.parse(words));
    const timeline = await narrationAudio(deps, view);
    const before = timeline.findIndex((segment) => segment.kind === "body");
    const start = timeline.slice(0, before).reduce((sum, segment) => sum + segment.seconds, 0);
    const end = start + (timeline[before]?.seconds ?? 0);
    // Times are rounded to the millisecond, so a body word can sit a hair before the body.
    const inBody = (at: number) => at >= start - 0.001 && at < end;
    return JSON.stringify({
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
    });
  } catch (error) {
    deps.log.write("error", "mcp.word-timing", {
      projectId,
      detail: `The narration's word timing was left out of get_project_file: ${causedBy(error)}`,
    });
    return undefined;
  }
}
