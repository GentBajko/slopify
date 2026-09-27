import type { CastMember } from "../channels/model.js";
import type { Speaker, SpeakerRole, SpeakerSource, VoicesSettings } from "./model.js";

// The cast library as a source of speakers: every member of the channel with a voice can be
// cast in a run. A speaker picked from the cast keeps the member's id, and every run started
// later takes the member's voice as it is then, so a character or a host sounds the same in
// every episode; editing the cast later changes no project already made.

export function castSpeakers(members: readonly CastMember[]): SpeakerSource {
  return {
    speakers: () =>
      members.flatMap((member) =>
        member.voice === undefined ? [] : [speakerFromCast(member, "character")],
      ),
  };
}

export function speakerFromCast(member: CastMember, role: SpeakerRole): Speaker {
  const voice = member.voice;
  return {
    id: `cast-${member.id
      .slice(0, 8)
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "")}`,
    name: member.name.slice(0, 40),
    role,
    voice:
      voice === undefined
        ? { provider: "", model: "", voice: "" }
        : { provider: voice.provider, model: voice.model, voice: voice.voice },
    ...(voice?.pace === undefined || voice.pace === 1 ? {} : { pace: voice.pace }),
    ...(voice?.pronunciations?.trim() ? { pronunciations: voice.pronunciations } : {}),
    castId: member.id,
  };
}

// A run's speakers with each cast speaker's voice, pace and pronunciations taken from the cast
// as it is now. A member since deleted, or without a voice, leaves the speaker as saved.
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
    const { pace: _pace, pronunciations: _pronunciations, ...rest } = speaker;
    const next: Speaker = {
      ...rest,
      voice: fresh.voice,
      ...(fresh.pace === undefined ? {} : { pace: fresh.pace }),
      ...(fresh.pronunciations === undefined ? {} : { pronunciations: fresh.pronunciations }),
    };
    if (JSON.stringify(next) !== JSON.stringify(speaker)) changed = true;
    return next;
  });
  return changed ? { ...settings, speakers } : settings;
}
