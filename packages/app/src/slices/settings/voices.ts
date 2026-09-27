import type { DatabaseSync } from "node:sqlite";
import { isUniqueConstraint } from "../../kernel/db/index.js";
import type { Ids } from "../../kernel/ids.js";
import type { ProviderId, Voice } from "./model.js";
import { providerById } from "./model.js";
import { deleteVoice, insertVoice, listVoices, updateVoiceLanguages } from "./repo.js";

export interface VoicesDeps {
  readonly db: DatabaseSync;
  readonly ids: Ids;
}

export interface VoiceDraft {
  readonly provider: ProviderId;
  readonly name: string;
  readonly voiceId: string;
  // Typed in Settings → Voices, or what the provider said (`edge/http/settings.ts`).
  readonly languages?: readonly string[] | undefined;
}

export const voiceNameMax = 200;
export const voiceIdMax = 200;

export type AddVoiceReason =
  | "blank-name"
  | "blank-voice-id"
  | "name-too-long"
  | "voice-id-too-long"
  | "not-a-tts-provider"
  | "duplicate-voice-id"
  | "unknown-language";

export type AddVoiceResult =
  | { readonly ok: true; readonly voice: Voice }
  | { readonly ok: false; readonly reason: AddVoiceReason };

export type RemoveVoiceResult = { readonly ok: true } | { readonly ok: false };

// A non-empty name and a non-empty voice ID, the ID unique within its provider, names free to
// repeat. Nothing is verified against the provider - a wrong ID is discovered when the audio
// stage uses it, which is why a key is not required here either.
export function addVoice(deps: VoicesDeps, draft: VoiceDraft): AddVoiceResult {
  if (providerById(draft.provider).family !== "tts") {
    return { ok: false, reason: "not-a-tts-provider" };
  }
  const name = draft.name.trim();
  const voiceId = draft.voiceId.trim();
  if (name === "") {
    return { ok: false, reason: "blank-name" };
  }
  if (name.length > voiceNameMax) {
    return { ok: false, reason: "name-too-long" };
  }
  if (voiceId === "") {
    return { ok: false, reason: "blank-voice-id" };
  }
  if (voiceId.length > voiceIdMax) {
    return { ok: false, reason: "voice-id-too-long" };
  }

  const languages = voiceLanguagesOf(draft.languages);
  if (languages === null) return { ok: false, reason: "unknown-language" };
  const voice: Voice = {
    id: deps.ids.next(),
    provider: draft.provider,
    name,
    voiceId,
    ...(languages === undefined ? {} : { languages }),
  };
  try {
    insertVoice(deps.db, voice);
  } catch (error) {
    // UNIQUE(provider, voice_id) is the rule, so the schema is what enforces it: a
    // read-then-write check would answer from a row that a second writer could delete
    // between the two statements. The raw SQLite error never leaves this function.
    if (isUniqueConstraint(error)) {
      return { ok: false, reason: "duplicate-voice-id" };
    }
    throw error;
  }
  return { ok: true, voice };
}

// Lower-case primary codes, each once; an empty list is unknown. Null when one is not a
// language code at all.
export function voiceLanguagesOf(
  raw: readonly string[] | undefined,
): readonly string[] | undefined | null {
  if (raw === undefined) return undefined;
  const codes = raw.map((one) => one.trim().toLowerCase()).filter((one) => one !== "");
  if (codes.some((one) => !/^[a-z]{2,3}$/.test(one))) return null;
  return codes.length === 0 ? undefined : [...new Set(codes)];
}

export function setVoiceLanguages(
  deps: VoicesDeps,
  id: string,
  raw: readonly string[],
): { readonly ok: true } | { readonly ok: false; readonly reason: "unknown-language" | "missing" } {
  const languages = voiceLanguagesOf(raw);
  if (languages === null) return { ok: false, reason: "unknown-language" };
  return updateVoiceLanguages(deps.db, id, languages)
    ? { ok: true }
    : { ok: false, reason: "missing" };
}

export function removeVoice(deps: VoicesDeps, id: string): RemoveVoiceResult {
  return deleteVoice(deps.db, id) ? { ok: true } : { ok: false };
}

export function voices(deps: VoicesDeps): readonly Voice[] {
  return listVoices(deps.db);
}
