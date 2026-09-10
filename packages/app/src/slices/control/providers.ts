import { z } from "zod";
import { thinkingModes } from "../../kernel/ports/llm.js";
import type { ModelInfo, ProviderFamily } from "../../kernel/ports/model.js";
import type { ProviderChoice, VoiceChoice } from "../admission/model.js";
import type { FieldError } from "../admission/rules.js";
import type { Chunking } from "../narration/chunk.js";
import { chunkModes } from "../narration/chunk.js";
import type { ProviderStatus, Voice } from "../settings/model.js";

const choice = z
  .object({
    provider: z.string().trim().min(1).max(200),
    model: z.string().trim().min(1).max(200),
    thinking: z.enum(thinkingModes).optional(),
  })
  .strict();

export const providerChangesSchema = z
  .object({
    llm: choice.optional(),
    audio: choice.extend({ voice: z.string().trim().min(1).max(200) }).optional(),
    images: choice.optional(),
    chunking: z
      .object({ mode: z.enum(chunkModes), words: z.number().int().min(1).max(10000).optional() })
      .strict()
      .optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "Pick at least one provider to update.");

export interface ProviderChanges {
  readonly chunking?: Chunking | undefined;
  readonly llm?: ProviderChoice | undefined;
  readonly audio?: VoiceChoice | undefined;
  readonly images?: ProviderChoice | undefined;
}

export interface ProviderValidation {
  readonly providers: readonly ProviderStatus[];
  readonly voices: readonly Voice[];
  readonly allowsCustomModels?: ((provider: string) => boolean) | undefined;
  readonly modelsFor?: (provider: string, family: ProviderFamily) => Promise<readonly ModelInfo[]>;
}

export function validateLocalProviderChanges(
  changes: ProviderChanges,
  current: ProviderValidation,
): readonly FieldError[] {
  const fields: FieldError[] = [];
  const families = { llm: "llm", audio: "tts", images: "image" } as const;
  for (const key of ["llm", "audio", "images"] as const) {
    const picked = changes[key];
    if (picked === undefined) continue;
    const provider = current.providers.find(
      (one) => one.id === picked.provider && one.family === families[key],
    );
    if (provider === undefined) {
      fields.push({ field: key, message: "Choose a provider for this kind of generation." });
      continue;
    }
    const usable =
      provider.readiness.kind === "cli" ? provider.readiness.installed : provider.readiness.hasKey;
    if (!usable) {
      fields.push({
        field: key,
        message:
          provider.readiness.kind === "cli"
            ? "Install and sign in to this CLI first."
            : "Save this provider's API key in Settings first.",
      });
    }
  }
  if (
    changes.audio !== undefined &&
    !current.voices.some(
      (voice) =>
        voice.provider === changes.audio?.provider && voice.voiceId === changes.audio.voice,
    )
  ) {
    fields.push({ field: "audio.voice", message: "Choose a saved voice for this provider." });
  }
  return fields;
}

export async function validateProviderChanges(
  changes: ProviderChanges,
  current: ProviderValidation,
): Promise<readonly FieldError[]> {
  const fields = [...validateLocalProviderChanges(changes, current)];
  if (current.modelsFor === undefined) return fields;
  const families = { llm: "llm", audio: "tts", images: "image" } as const;
  for (const key of ["llm", "audio", "images"] as const) {
    const picked = changes[key];
    if (picked === undefined || fields.some((field) => field.field === key)) continue;
    if (current.allowsCustomModels?.(picked.provider) === true) continue;
    const models = await current.modelsFor(picked.provider, families[key]);
    const model = models.find((model) => model.id === picked.model);
    if (!model) {
      fields.push({ field: `${key}.model`, message: "Choose a model supported by this provider." });
    } else if (
      key === "llm" &&
      picked.thinking &&
      !model.thinkingModes?.includes(picked.thinking)
    ) {
      fields.push({ field: `${key}.thinking`, message: "Choose a supported thinking setting." });
    }
  }
  return fields;
}
