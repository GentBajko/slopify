import type { Clock } from "../clock.js";
import type { Log } from "../log.js";
import type { Registry } from "../ports/registry.js";
import { attempt } from "./attempt.js";
import type { AttemptStore } from "./attempt-repo.js";
import type { NarratedAudio, TtsCall } from "./providers.js";
import type { AttemptResult } from "./work.js";

// A voice audition: one short line spoken before any run exists, when the person clicks
// Audition on a speaker. It is not project work, so no attempt rows are written and nothing is
// queued behind a run; it still goes through the attempt wrapper, which classifies the
// provider's errors and retries like every other call.

export interface AuditionDeps {
  readonly registry: Registry;
  readonly clock: Clock;
  readonly log: Log;
}

const unrecorded: AttemptStore = {
  start: () => "audition",
  end: () => {},
};

export function auditionVoice(
  deps: AuditionDeps,
  call: TtsCall,
  signal: AbortSignal,
): Promise<AttemptResult<NarratedAudio>> {
  const port = deps.registry.tts(call.provider);
  return attempt(
    {
      work: {
        projectId: "audition",
        revisionId: "audition",
        workId: "audition",
        stageId: "audition",
        kind: "audio",
        fingerprint: "audition",
      },
      maySubmit: () => true,
      clock: deps.clock,
      log: deps.log,
      attempts: unrecorded,
      projectId: "audition",
      stage: "audio",
      stageId: "audition",
      signal,
    },
    async (inner, progress): Promise<NarratedAudio> => {
      const spoken = await port.synthesize({
        model: call.model,
        voiceId: call.voiceId,
        text: call.text,
        signal: inner,
        onActivity: progress,
      });
      const bytes = new Uint8Array(await new Response(spoken.audio).arrayBuffer());
      return { bytes, container: spoken.container };
    },
    { kind: "tts", streaming: port.capabilities.streams },
  );
}
