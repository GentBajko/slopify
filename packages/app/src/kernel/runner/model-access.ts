import type { Log } from "../log.js";
import { isProviderError, type ProviderFamily } from "../ports/model.js";

// What a real call taught about a model for the person's key or login: it worked, or the
// provider said it is not theirs to use. Settings → Models and the pickers read it; the call
// itself goes on exactly as it would without it (main.ts wires it to the model-checks slice).
export interface AccessUse {
  readonly provider: string;
  readonly family: ProviderFamily;
  readonly model: string;
}

export interface ModelAccessRecorder {
  readonly worked: (use: AccessUse) => void;
  readonly denied: (use: AccessUse & { readonly sentence: string }) => void;
}

// Like metering, recording never fails a call: the answer is already in hand.
function guarded(log: Log, use: AccessUse, write: () => void): void {
  try {
    write();
  } catch (error) {
    log.write("warn", "model-checks.record", {
      detail: `${use.provider} ${use.model}: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

export function recordWorked(
  recorder: ModelAccessRecorder | undefined,
  log: Log,
  use: AccessUse,
): void {
  if (recorder === undefined || use.model.trim() === "") return;
  guarded(log, use, () => recorder.worked(use));
}

// Only a failure whose fault names the model's access teaches anything.
export function recordFailure(
  recorder: ModelAccessRecorder | undefined,
  log: Log,
  use: AccessUse,
  error: unknown,
): void {
  if (recorder === undefined || use.model.trim() === "") return;
  if (!isProviderError(error) || error.fault.access === undefined) return;
  const sentence = error.message;
  guarded(log, use, () => recorder.denied({ ...use, sentence }));
}

// Observes a call's outcome and hands it back unchanged.
export function observed<T>(
  recorder: ModelAccessRecorder | undefined,
  log: Log,
  use: AccessUse,
  call: Promise<T>,
  succeeded: (value: T) => boolean = () => true,
): Promise<T> {
  if (recorder === undefined) return call;
  return call.then(
    (value) => {
      if (succeeded(value)) recordWorked(recorder, log, use);
      return value;
    },
    (error: unknown) => {
      recordFailure(recorder, log, use, error);
      throw error;
    },
  );
}
