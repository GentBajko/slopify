import { z } from "zod";
import type { Catalogue } from "../../catalog/schema.js";
import type { StageKind } from "../../kernel/pipeline.js";
import type { Message, ThinkingConfig, ThinkingMode } from "../../kernel/ports/llm.js";
import { type FingerprintValue, fingerprint } from "../../kernel/runner/work.js";
import type { RunConfig } from "../admission/model.js";
import type { Finding } from "../research/synthesis.js";
import type {
  ManifestOutput,
  ManifestPiece,
  RevisionContent,
  RevisionManifest,
} from "../revisions/model.js";
import type { WorkRecipe } from "./dependencies.js";

export interface ResolvedRevisionInputs {
  readonly articleMarkdown: string | null;
  readonly researchNotes: string | null;
  readonly research?:
    | { readonly outline: readonly string[]; readonly findings: readonly Finding[] }
    | undefined;
  readonly articleContinuation?: string | undefined;
}
export type RecipeInput =
  | {
      readonly kind: "llm";
      readonly version: 1;
      readonly provider: string;
      readonly model: string;
      readonly thinking: ThinkingMode | null;
      readonly thinkingConfig: ThinkingConfig | null;
      readonly messages: readonly Message[];
      readonly webSearch: boolean;
    }
  | {
      readonly kind: "tts";
      readonly version: 1;
      readonly provider: string;
      readonly model: string;
      readonly voice: string;
      readonly text: string;
      readonly logicalKey: string;
      readonly logicalText: string;
      readonly segment: "body" | "intro" | "outro";
      readonly pronunciation: null;
    }
  | {
      readonly kind: "image";
      readonly version: 1;
      readonly provider: string;
      readonly model: string;
      readonly prompt: string;
      readonly aspect: RunConfig["format"];
    }
  | {
      readonly kind: "provided";
      readonly version: 1;
      readonly assetId: string | null;
      readonly semantic: FingerprintValue;
    }
  | {
      readonly kind: "local";
      readonly version: 1;
      readonly operation: string;
      readonly values: FingerprintValue;
    }
  | {
      readonly kind: "deferred";
      readonly version: 1;
      readonly operation: string;
      readonly template: FingerprintValue;
    };
export interface ResolvedWorkRecipe extends WorkRecipe {
  readonly input: RecipeInput;
  readonly logicalFingerprint: string;
  readonly deferred: boolean;
}
export interface RecipeContext {
  readonly config: RunConfig;
  readonly content: RevisionContent;
  readonly manifest: RevisionManifest;
  readonly resolved: ResolvedRevisionInputs;
  readonly catalogue?: Catalogue | undefined;
}

export function recipe(
  context: Pick<RecipeContext, "content">,
  key: string,
  stage: StageKind,
  input: RecipeInput,
  dependsOn: readonly string[] = [],
  options: {
    readonly unresolved?: boolean;
    readonly tokenKey?: string;
    readonly logicalFingerprint?: string;
    readonly kind?: WorkRecipe["kind"];
  } = {},
): ResolvedWorkRecipe {
  const requestValue = input.kind === "tts" ? { ...input, logicalKey: undefined } : input;
  const requestFingerprint = fingerprint(
    JSON.parse(
      JSON.stringify(requestValue, (_key: string, value: unknown): unknown =>
        typeof value === "number" ? z.number().finite().parse(value) : value,
      ),
    ) as FingerprintValue,
  );
  const workFingerprint = fingerprint([
    requestFingerprint,
    context.content.regenerationTokens[options.tokenKey ?? key] ?? null,
  ]);
  return {
    key,
    stage,
    kind:
      options.kind ??
      (input.kind === "llm" ||
      input.kind === "tts" ||
      input.kind === "image" ||
      input.kind === "deferred"
        ? "provider"
        : input.kind),
    input,
    requestFingerprint,
    fingerprint: workFingerprint,
    logicalFingerprint: options.logicalFingerprint ?? workFingerprint,
    dependsOn,
    unresolved: options.unresolved ?? false,
    deferred: input.kind === "deferred",
  };
}
export function selectedAsset(context: RecipeContext, key: string): string | null {
  const output = context.manifest.outputs.find(
    (row) => row.workKey === key && row.state === "ready" && selectedReference(row),
  );
  if (output !== undefined) return output.assetId;
  const piece = context.manifest.pieces.find(
    (row) => row.key === key && row.piece.state === "done" && selectedReference(row),
  );
  return piece?.assetId ?? null;
}
export function resourceIdentity(
  context: RecipeContext,
  value: ResolvedWorkRecipe,
): FingerprintValue {
  return [value.fingerprint, selectedAsset(context, value.key)];
}

export function selectedReference(value: ManifestOutput | ManifestPiece): boolean {
  return !("selected" in value) || value.selected === true;
}
