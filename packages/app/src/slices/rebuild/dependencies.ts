import type { StageKind } from "../../kernel/pipeline.js";
import type { RebuildWork } from "./model.js";

export interface WorkRecipe {
  readonly key: string;
  readonly stage: StageKind;
  readonly kind: "provider" | "local" | "provided";
  readonly requestFingerprint: string;
  readonly fingerprint: string;
  readonly dependsOn: readonly string[];
  readonly unresolved: boolean;
}

export interface RetainedWork {
  readonly key: string;
  readonly requestFingerprint: string;
  readonly fingerprint: string;
  readonly available: boolean;
  readonly inflight: boolean;
  readonly pieceIds: readonly string[];
}

export function planDependencies(
  desired: readonly WorkRecipe[],
  retained: readonly RetainedWork[],
): readonly RebuildWork[] {
  return desired.map((recipe) => {
    const old = retained.find(
      (one) =>
        one.key === recipe.key &&
        one.fingerprint === recipe.fingerprint &&
        (one.available || one.inflight),
    );
    const changedProvided =
      recipe.kind === "provided" &&
      retained.some((one) => one.key === recipe.key && one.fingerprint !== recipe.fingerprint);
    const disposition = recipe.unresolved
      ? "blocked"
      : old
        ? "reuse"
        : changedProvided
          ? "review"
          : recipe.kind === "provided"
            ? "blocked"
            : recipe.kind === "local"
              ? "local"
              : "generate";
    return {
      ...recipe,
      disposition,
      inflight: old?.inflight ?? false,
      pieceIds: old?.pieceIds ?? [],
      reason:
        disposition === "reuse"
          ? "Inputs match retained work."
          : disposition === "review"
            ? "Confirm the provided content against changed inputs."
            : disposition === "blocked"
              ? "An input is unavailable or needs a fresh preview."
              : "Inputs changed or a required output is missing.",
    };
  });
}
