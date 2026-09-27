import type { CastMember } from "../channels/model.js";
import type { Speaker, SpeakerRole, VoicesSettings } from "./model.js";

// The cast library as a source of speakers: every member of the channel with a voice can be
// cast in a run. A speaker picked from the cast keeps the member's id, and every run started
// later takes the member's voice as it is then, so a character or a host sounds the same in
// every episode; editing the cast later changes no project already made.

// The channel's hosts as speakers: every member marked as a host who has a voice, in the cast's
// order. A new podcast or interview starts with them (`defaultVoicesSettings`), so the channel's
// recurring voices are there without adding them each time.
export function castHosts(members: readonly CastMember[]): readonly Speaker[] {
  return members.flatMap((member) =>
    member.host === true && member.voice !== undefined ? [speakerFromCast(member, "host")] : [],
  );
}

// A speaker id no other member can share: the member's whole id (a UUID) rather than its first
// eight characters, which two members may have in common. An id the speaker schema cannot hold
// (never one the app made) falls back to a hash of it. A speaker already saved keeps its id.
export function castSpeakerId(memberId: string): string {
  const lower = memberId.toLowerCase();
  return /^[a-z0-9-]{1,55}$/.test(lower) ? `cast-${lower}` : `cast-h${hashOf(memberId)}`;
}

// cyrb53: 53 bits, the same in the browser and on the server.
function hashOf(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

export function speakerFromCast(member: CastMember, role: SpeakerRole): Speaker {
  const voice = member.voice;
  return {
    id: castSpeakerId(member.id),
    name: member.name.slice(0, 40),
    role,
    voice:
      voice === undefined
        ? { provider: "", model: "", voice: "" }
        : { provider: voice.provider, model: voice.model, voice: voice.voice },
    ...(voice?.pace === undefined || voice.pace === 1 ? {} : { pace: voice.pace }),
    ...(voice?.pronunciations?.trim() ? { pronunciations: voice.pronunciations } : {}),
    castId: member.id,
    ...portraitOf(member),
  };
}

// The member's first finished picture, the one the speaker panel shows. Nothing when they have
// none, so a speaker without a picture is the speaker it always was.
function portraitOf(member: CastMember): { readonly portrait?: string } {
  const sha256 = member.images.find((one) => one.state === "ready" && one.sha256 !== null)?.sha256;
  return sha256 === undefined || sha256 === null ? {} : { portrait: sha256 };
}

// A run's speakers with each cast speaker's voice, pace, pronunciations and portrait taken from
// the cast as it is now. A member since deleted, or without a voice, leaves the speaker as saved.
export function withCastVoices(
  settings: VoicesSettings,
  members: readonly CastMember[],
): VoicesSettings {
  let changed = false;
  const speakers = settings.speakers.map((speaker) => {
    const member =
      speaker.castId === undefined ? undefined : members.find((one) => one.id === speaker.castId);
    if (member?.voice === undefined) return speaker;
    const fresh = speakerFromCast(member, speaker.role);
    const { pace: _pace, pronunciations: _pronunciations, portrait: _portrait, ...rest } = speaker;
    const next: Speaker = {
      ...rest,
      voice: fresh.voice,
      ...(fresh.pace === undefined ? {} : { pace: fresh.pace }),
      ...(fresh.pronunciations === undefined ? {} : { pronunciations: fresh.pronunciations }),
      ...(fresh.portrait === undefined ? {} : { portrait: fresh.portrait }),
    };
    if (JSON.stringify(next) !== JSON.stringify(speaker)) changed = true;
    return next;
  });
  return changed ? { ...settings, speakers } : settings;
}
