import { z } from "zod";
import type { Catalogue } from "../../catalog/schema.js";
import type { StageKind } from "../../kernel/pipeline.js";
import type { Message, ThinkingConfig, ThinkingMode } from "../../kernel/ports/llm.js";
import { type FingerprintValue, fingerprint } from "../../kernel/runner/work.js";
import type { RunConfig } from "../admission/model.js";
import { narrationRegenerationToken, narrationRequestFingerprint } from "../narration/plan.js";
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
export const localOperations = [
  "export-wav",
  "wav2vec2-en-a19f851-v2-omissions",
  "automatic-cues-v1",
  "manual-cues-v1",
  "subtitle-files-v1",
  "render-video",
  "render-selected-video",
  "provided-notes",
  "provided-article",
  "manual-article",
  "entry-text",
  "concat-narration",
] as const;
export const deferredOperations = [
  "research-synthesis",
  "article",
  "entry:intro:text",
  "entry:outro:text",
  "thumbnail-prompt",
  "thumbnail-image",
  "body-narration",
  "intro-narration",
  "outro-narration",
  "resolve-revision-recipe",
] as const;
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
      readonly wholeRequest?: boolean | undefined;
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
      readonly operation: (typeof localOperations)[number];
      readonly values: FingerprintValue;
    }
  | {
      readonly kind: "deferred";
      readonly version: 1;
      readonly operation: (typeof deferredOperations)[number];
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
  const requestFingerprint =
    input.kind === "tts"
      ? narrationRequestFingerprint({
          ...input,
          wholeText: input.wholeRequest === true ? input.logicalText : null,
        })
      : fingerprint(
          JSON.parse(
            JSON.stringify(input, (_key: string, value: unknown): unknown =>
              typeof value === "number" ? z.number().finite().parse(value) : value,
            ),
          ) as FingerprintValue,
        );
  const workFingerprint = fingerprint([
    requestFingerprint,
    input.kind === "tts"
      ? narrationRegenerationToken(
          context.content.regenerationTokens,
          input.logicalKey,
          input.segment,
        )
      : (context.content.regenerationTokens[options.tokenKey ?? key] ?? null),
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
export function selectedAsset(
  context: RecipeContext,
  key: string,
  desired?: string,
): string | null {
  const output = context.manifest.outputs.find(
    (row) => row.workKey === key && row.state === "ready" && selectedReference(row),
  );
  if (output !== undefined) return output.assetId;
  const piece = context.manifest.pieces.find(
    (row) =>
      row.key === key &&
      row.piece.state === "done" &&
      selectedReference(row) &&
      (desired === undefined || row.fingerprint === desired),
  );
  return piece?.assetId ?? null;
}
export function resourceIdentity(
  context: RecipeContext,
  value: ResolvedWorkRecipe,
): FingerprintValue {
  return [value.fingerprint, selectedAsset(context, value.key, value.fingerprint)];
}

export function selectedReference(value: ManifestOutput | ManifestPiece): boolean {
  return !("selected" in value) || value.selected === true;
}
