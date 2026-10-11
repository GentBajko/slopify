import type { FingerprintValue } from "../../kernel/runner/work.js";
import { breathsOn } from "../narration/breaths-model.js";

// Remove breaths (`narration/breaths-model.ts`) is made in the narration joins, so a join carries
// it in its values, after the pauses when they are set. Nothing at all while it is off, so
// every join made before it keeps its fingerprint. The levelled join copies these values, so it
// removes the same breaths.
export const breathsValue = "breaths-v1";

export function breathValues(config: {
  readonly removeBreaths?: boolean | undefined;
}): readonly FingerprintValue[] {
  return breathsOn(config) ? [[breathsValue]] : [];
}

// Whether a join's values ask for it: any value after the join's own two.
export function breathsAsked(values: unknown): boolean {
  return (
    Array.isArray(values) &&
    values
      .slice(2)
      .some((value) => Array.isArray(value) && value.length === 1 && value[0] === breathsValue)
  );
}
