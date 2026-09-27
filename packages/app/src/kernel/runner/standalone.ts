import type { Clock } from "../clock.js";
import type { Log } from "../log.js";
import type { Format } from "../pipeline.js";
import type { GeneratedImage } from "../ports/image.js";
import type { Message, ThinkingMode, Usage } from "../ports/llm.js";
import { isProviderError } from "../ports/model.js";
import type { PlanLimitReading } from "../ports/plan-limits.js";
import type { Registry } from "../ports/registry.js";
import { type AttemptOptions, attempt, type ProviderCall } from "./attempt.js";
import type { AttemptStore } from "./attempt-repo.js";
import type { ProviderUse, StandaloneMeter, StandaloneUse } from "./meter.js";

// Provider calls that belong to no project: a schedule's topic generation, a channel's episode
// summary and cast pictures. They go through the same attempt wrapper and retry policy as a
// stage's calls, with nothing recorded as attempts, since there is no stage to show them on.
// What each successful call used is metered against its schedule or channel.

export interface StandaloneDeps {
  readonly registry: Registry;
  readonly clock: Clock;
  readonly log: Log;
  // Absent in tests that don't look at run cost.
  readonly meter?: StandaloneMeter | undefined;
}

export interface StandaloneLlmCall extends StandaloneUse {
  readonly provider: string;
  readonly model: string;
  readonly thinking?: ThinkingMode | undefined;
  readonly messages: readonly Message[];
  // The caller's own deadline or shutdown; aborting it ends the retries too.
  readonly signal?: AbortSignal | undefined;
}

export interface StandaloneLlmAnswer {
  readonly text: string;
  readonly usage: Usage | null;
  readonly limits?: PlanLimitReading | undefined;
}

export type StandaloneLlm = (call: StandaloneLlmCall) => Promise<StandaloneLlmAnswer>;

export async function standaloneLlm(
  deps: StandaloneDeps,
  call: StandaloneLlmCall,
): Promise<StandaloneLlmAnswer> {
  const port = deps.registry.llm(call.provider);
  const started = deps.clock.now().getTime();
  const answer = await wrapped(
    deps,
    call,
    async (signal, progress): Promise<StandaloneLlmAnswer> => {
      let text = "";
      let usage: Usage | null = null;
      let limits: PlanLimitReading | undefined;
      for await (const event of port.complete({
        model: call.model,
        ...(call.thinking === undefined ? {} : { thinking: call.thinking }),
        messages: call.messages,
        signal,
      })) {
        signal.throwIfAborted();
        // Every event is a sign of life, so the idle clock restarts here.
        progress();
        if (event.type === "delta") text += event.text;
        else if (event.type === "done") {
          usage = event.usage;
          limits = event.limits;
        }
      }
      return { text, usage, ...(limits === undefined ? {} : { limits }) };
    },
    { kind: "llm", streaming: port.capabilities.streams },
  );
  meter(deps, call, {
    kind: "llm",
    provider: call.provider,
    model: answer.usage?.model ?? call.model,
    ...tokens(answer.usage ?? undefined),
    wallMs: Math.max(0, deps.clock.now().getTime() - started),
    ...(answer.limits === undefined ? {} : { limits: answer.limits }),
  });
  return answer;
}

export interface StandaloneImageCall extends StandaloneUse {
  readonly provider: string;
  readonly model: string;
  readonly prompt: string;
  readonly aspect: Format;
}

export async function standaloneImage(
  deps: StandaloneDeps,
  call: StandaloneImageCall,
): Promise<GeneratedImage> {
  const port = deps.registry.image(call.provider);
  const started = deps.clock.now().getTime();
  const image = await wrapped(
    deps,
    call,
    (signal) =>
      port.generate({
        model: call.model,
        prompt: call.prompt,
        aspect: call.aspect,
        signal,
      }),
    { kind: "image", ...(port.timeoutMs === undefined ? {} : { timeoutMs: port.timeoutMs }) },
  );
  meter(deps, call, {
    kind: "image",
    provider: call.provider,
    model: call.model,
    images: 1,
    size: call.aspect,
    ...tokens(image.usage),
    wallMs: Math.max(0, deps.clock.now().getTime() - started),
    ...(image.limits === undefined ? {} : { limits: image.limits }),
  });
  return image;
}

async function wrapped<T>(
  deps: StandaloneDeps,
  use: StandaloneUse & { readonly signal?: AbortSignal | undefined },
  call: ProviderCall<T>,
  opts: AttemptOptions,
): Promise<T> {
  // The wrapper names its log lines by project and stage; these name what the call was for.
  const label = `${use.purpose}:${use.owner.kind}:${use.owner.id}`;
  let next = 0;
  const attempts: AttemptStore = {
    start: () => {
      next += 1;
      return String(next);
    },
    end: () => {},
  };
  const stage = opts.kind === "image" ? "images" : "article";
  try {
    const result = await attempt(
      {
        work: {
          projectId: label,
          revisionId: label,
          workId: label,
          stageId: label,
          kind: stage,
          fingerprint: label,
        },
        maySubmit: () => true,
        clock: deps.clock,
        log: deps.log,
        attempts,
        projectId: label,
        stage,
        stageId: label,
        signal: use.signal ?? new AbortController().signal,
      },
      call,
      opts,
    );
    if (!result.ok) throw new Error("The provider did not take the request.");
    return result.value;
  } catch (error) {
    throw standaloneError(error);
  }
}

// The wrapper's own advice points at a stage's buttons ("use Retry stage"); a standalone call
// has none, and each caller says itself where to go next, so that advice is dropped.
function standaloneError(error: unknown): unknown {
  if (!isProviderError(error)) return error;
  const kept = error.message
    .replace(
      /,? then use Retry stage(?:, or choose another model in the Providers section of Edit project)?/g,
      "",
    )
    .split(/(?<=\.)\s+/)
    .filter((sentence) => !/Retry stage|Edit project/.test(sentence))
    .join(" ")
    .trim();
  if (kept === error.message || kept === "") return error;
  return Object.assign(new Error(kept, { cause: error }), { fault: error.fault });
}

function tokens(usage: Usage | undefined): Partial<ProviderUse> {
  if (usage === undefined) return {};
  return {
    tokensIn: usage.inputTokens,
    tokensOut: usage.outputTokens,
    ...(usage.cachedInputTokens === undefined ? {} : { cachedTokens: usage.cachedInputTokens }),
  };
}

// Metering never fails a call: the answer is already paid for.
function meter(deps: StandaloneDeps, use: StandaloneUse, call: ProviderUse): void {
  if (deps.meter === undefined) return;
  try {
    deps.meter.record({ ...call, owner: use.owner, purpose: use.purpose });
  } catch (error) {
    deps.log.write("warn", "usage.record", {
      detail: `${use.purpose} for ${use.owner.kind} ${use.owner.id}: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}
