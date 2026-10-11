import type { FingerprintValue } from "../../kernel/runner/work.js";
import { breathsOn, deEsser, deEssOn } from "../narration/breaths-model.js";

// Soften breaths and Soften S sounds (`narration/breaths-model.ts`) are made in the narration
// joins, so a join carries them in its values, after the pauses when they are set. Nothing at
// all while they are off, so every join made before them keeps its fingerprint. The levelled
// join copies these values, so it softens the same.
// v2: 3.19.0's v1 muted breaths to silence and could clip word edges; its joins are remade.
export const breathsValue = "breaths-v2";
export const deEssValue = "deess-v1";

export function breathValues(config: {
  readonly removeBreaths?: boolean | undefined;
  readonly deEss?: boolean | undefined;
}): readonly FingerprintValue[] {
  return [
    ...(breathsOn(config) ? [[breathsValue]] : []),
    ...(deEssOn(config) ? [[deEssValue, deEsser.intensity, deEsser.max, deEsser.frequency]] : []),
  ];
}

// Whether a join's values ask for it: any value after the join's own two.
export function breathsAsked(values: unknown): boolean {
  return laterValues(values).some((value) => value.length === 1 && value[0] === breathsValue);
}

export function deEssAsked(values: unknown): boolean {
  return laterValues(values).some((value) => value[0] === deEssValue);
}

function laterValues(values: unknown): readonly (readonly unknown[])[] {
  return Array.isArray(values)
    ? values.slice(2).filter((value): value is unknown[] => Array.isArray(value))
    : [];
}
