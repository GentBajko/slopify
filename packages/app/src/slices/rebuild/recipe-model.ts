import { z } from "zod";
import type { Catalogue } from "../../catalog/schema.js";
import type { StageKind } from "../../kernel/pipeline.js";
import type { Message, ThinkingConfig, ThinkingMode } from "../../kernel/ports/llm.js";
import type { LlmDocument } from "../../kernel/ports/llm-documents.js";
import { type FingerprintValue, fingerprint } from "../../kernel/runner/work.js";
import type { RunConfig } from "../admission/model.js";
import { narrationRegenerationToken, narrationRequestFingerprint } from "../narration/plan.js";
import type { PreparationSource } from "../narration/preparation.js";
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
  "wav2vec2-xlsr56-2d48b01-v1",
  "sentence-timing-v1",
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
  "narration-files-v1",
  "render-document",
  "youtube-description-v1",
  "shorts-pick-v1",
  "short-render-v1",
  "review-v1",
  "concat-turns-v1",
  "voice-captions-v1",
  "audio-files-v1",
  "level-narration-v1",
  "figure-card-v1",
] as const;
export const deferredOperations = [
  "narration-preparation",
  "narration-description",
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
  "shorts",
  "animate",
  "script-attribution",
  // Scenes from the article (`recipe-scenes.ts`): the scenes step and each image waiting on it.
  "image-scenes",
  "image-scene",
] as const;
export interface DialogueLine {
  readonly speaker: string;
  readonly turn: number;
  readonly voice: string;
  readonly text: string;
}
export interface ScriptCheck {
  readonly speakers: readonly { readonly id: string; readonly name: string }[];
  readonly attribute: boolean;
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
      readonly documents?: readonly LlmDocument[] | undefined;
      readonly webSearch: boolean;
      readonly preparation?: PreparationSource | undefined;
      // A multi-voice script answer, checked against the speakers before it is accepted; with
      // `attribute`, the source text in the last message must keep its words.
      readonly script?: ScriptCheck | undefined;
      // A table, figure, equation or code block described for the narration
      // (`narration:describe:<n>`): the answer is the spoken passage.
      readonly describe?: import("../narration/describe.js").DescribeSource | undefined;
    }
  | {
      readonly kind: "tts";
      readonly version: 1;
      readonly provider: string;
      readonly model: string;
      readonly voice: string;
      readonly text: string;
      readonly spokenText?: string | undefined;
      readonly logicalKey: string;
      readonly logicalText: string;
      readonly segment: "body" | "intro" | "outro";
      readonly pronunciation: null;
      readonly wholeRequest?: boolean | undefined;
      // Multiple voices: the speaker and script turn this request speaks, or, for a native
      // multi-speaker request, every turn with its own voice. Present only on a multi-voice
      // run, so every other request keeps its fingerprint.
      readonly speaker?: string | undefined;
      readonly turn?: number | undefined;
      readonly dialogue?: readonly DialogueLine[] | undefined;
    }
  | {
      readonly kind: "image";
      readonly version: 1;
      readonly provider: string;
      readonly model: string;
      readonly prompt: string;
      readonly aspect: RunConfig["format"];
      // Present when the request animates a still rather than drawing one: an image-to-video
      // model on the same provider, fed the image `image` (its recipe's fingerprint) for a
      // clip of `seconds`. Priced, retried and keyed like an image.
      readonly animate?: { readonly image: string; readonly seconds: number } | undefined;
      // The chosen effort, for a provider that has one (the Codex CLI). Present only when one
      // is chosen, so every request made without it keeps its fingerprint.
      readonly thinking?: ThinkingMode | undefined;
      // The establishing image this one is drawn with as its visual reference: its step's
      // fingerprint and, once it has landed, the asset it made. Present only while the
      // project's Establishing image is on, for the same reason.
      readonly reference?:
        | { readonly fingerprint: string; readonly assetId: string | null }
        | undefined;
      // The channel's cast members the brief mentions, their pictures sent as references too
      // (`recipe-cast.ts`). Present only when one is mentioned, for the same reason.
      readonly cast?: readonly import("./recipe-cast.js").CastInput[] | undefined;
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
  readonly refusal?: string | undefined;
  // Images this step's answer will ask for, which planning cannot list yet: a short's image
  // prompts lead to one image each. The estimate prices them with the step.
  readonly unfoldsImages?:
    | { readonly count: number; readonly provider: string; readonly model: string }
    | undefined;
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
    // The regeneration token itself, when it is not simply the one under a key.
    readonly token?: string | null;
    readonly logicalFingerprint?: string;
    readonly kind?: WorkRecipe["kind"];
    readonly refusal?: string | undefined;
  } = {},
): ResolvedWorkRecipe {
  const requestFingerprint =
    input.kind === "tts" && input.dialogue !== undefined
      ? // One request, several voices: every line's voice and words are what was sent.
        fingerprint([
          "narration-dialogue-v1",
          input.provider,
          input.model,
          input.dialogue.map((line) => [line.voice, line.text]),
          input.segment,
        ])
      : input.kind === "tts"
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
  const token =
    input.kind === "tts"
      ? narrationRegenerationToken(
          context.content.regenerationTokens,
          input.logicalKey,
          input.segment,
        )
      : options.token !== undefined
        ? options.token
        : (context.content.regenerationTokens[options.tokenKey ?? key] ?? null);
  const researchToken =
    stage === "research" ? context.content.regenerationTokens["research:all"] : undefined;
  const workFingerprint = fingerprint([
    requestFingerprint,
    researchToken === undefined ? token : fingerprint([researchToken, token]),
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
    ...(options.refusal === undefined ? {} : { refusal: options.refusal }),
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
