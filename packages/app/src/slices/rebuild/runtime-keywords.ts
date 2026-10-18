import { errorText } from "../../kernel/errors.js";
import type { StageContext } from "../../kernel/runner/index.js";
import type { StageProviders } from "../../kernel/runner/providers.js";
import { fillLateKeywords, mentionsLateKeyword } from "../keywords/fill.js";
import { durationText, releaseDateText } from "../keywords/values.js";
import { releasesOf } from "../studio/releases.js";
import type { ExportExecutionDeps } from "./runtime-export.js";
import { revisionAudio } from "./runtime-export-inputs.js";
import { executionView } from "./runtime-plan.js";

export interface LateValues {
  readonly releaseDate?: string | undefined;
  readonly duration?: string | undefined;
}

// The release date and the video's length are filled into a request only as it is sent: the
// planned request keeps `{{Slopify_Release_Date}}` and `{{Slopify_Duration}}`, so moving the
// date later, or a new length, never makes anything outdated. Every other call goes through as
// it was.
export function lateKeywordProviders(
  providers: StageProviders,
  values: () => Promise<LateValues>,
): StageProviders {
  let once: Promise<LateValues> | undefined;
  const late = (): Promise<LateValues> => {
    once ??= values();
    return once;
  };
  const wrap = (inner: StageProviders): StageProviders => ({
    ...inner,
    llm: async (call, onEvent) => {
      if (!call.messages.some((message) => mentionsLateKeyword(message.content)))
        return inner.llm(call, onEvent);
      const filled = await late();
      return inner.llm(
        {
          ...call,
          messages: call.messages.map((message) => ({
            ...message,
            content: fillLateKeywords(message.content, filled),
          })),
        },
        onEvent,
      );
    },
    image: async (call) =>
      mentionsLateKeyword(call.prompt)
        ? inner.image({ ...call, prompt: fillLateKeywords(call.prompt, await late()) })
        : inner.image(call),
    forPiece: (pieceId) => wrap(inner.forPiece(pieceId)),
  });
  return wrap(providers);
}

// The long video's release time from the posting plan, and the narration's length once it is
// there. A length that can't be read yet (an article review runs before the narration) is
// blank, so its line is left out, and the reason is logged.
export async function lateValuesOf(
  deps: ExportExecutionDeps,
  context: StageContext,
): Promise<LateValues> {
  const releaseDate = releaseDateText(
    releasesOf(deps.db, context.work.projectId).find((release) => release.short === 0)?.at,
  );
  const view = executionView(deps, context.work.projectId, context.work.revisionId);
  let duration: string | undefined;
  if (view !== undefined && view.revision.config.sources.audio !== "off")
    try {
      const audio = await revisionAudio(deps, context, view);
      const seconds = audio.reduce((sum, segment) => sum + segment.seconds, 0);
      duration = seconds > 0 ? durationText(seconds) : undefined;
    } catch (error) {
      deps.log.write("warn", "keywords.duration", {
        projectId: context.work.projectId,
        stage: context.work.kind,
        detail: errorText(error),
      });
    }
  return { releaseDate, duration };
}
