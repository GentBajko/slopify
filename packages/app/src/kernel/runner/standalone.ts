import type { Clock } from "../clock.js";
import type { Log } from "../log.js";
import type { Format } from "../pipeline.js";
import type { GeneratedImage } from "../ports/image.js";
import type { Registry } from "../ports/registry.js";
import { attempt } from "./attempt.js";
import type { AttemptStore } from "./attempt-repo.js";

// An image that belongs to no project, such as a channel's cast picture: the same attempt
// wrapper and retry policy as a stage's image, with nothing recorded, since there is no stage
// to show attempts on. `label` names it in the log.
export async function standaloneImage(
  deps: { readonly registry: Registry; readonly clock: Clock; readonly log: Log },
  call: {
    readonly provider: string;
    readonly model: string;
    readonly prompt: string;
    readonly aspect: Format;
  },
  label: string,
): Promise<GeneratedImage> {
  const port = deps.registry.image(call.provider);
  let next = 0;
  const attempts: AttemptStore = {
    start: () => {
      next += 1;
      return String(next);
    },
    end: () => {},
  };
  const result = await attempt(
    {
      work: {
        projectId: label,
        revisionId: label,
        workId: label,
        stageId: label,
        kind: "images",
        fingerprint: label,
      },
      maySubmit: () => true,
      clock: deps.clock,
      log: deps.log,
      attempts,
      projectId: label,
      stage: "images",
      stageId: label,
      signal: new AbortController().signal,
    },
    (signal) =>
      port.generate({
        model: call.model,
        prompt: call.prompt,
        aspect: call.aspect,
        signal,
      }),
    { kind: "image", ...(port.timeoutMs === undefined ? {} : { timeoutMs: port.timeoutMs }) },
  );
  if (!result.ok) throw new Error("The image provider did not take the request.");
  return result.value;
}
