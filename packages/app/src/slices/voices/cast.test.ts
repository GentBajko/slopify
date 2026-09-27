import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { fixedClock } from "../../kernel/clock.fake.js";
import { openDb } from "../../kernel/db/index.js";
import { migrate } from "../../kernel/db/migrate.js";
import { uploadCastImage } from "../channels/cast-images.js";
import { defaultChannelId } from "../channels/model.js";
import { castOfChannel } from "../channels/repo.js";
import { createCastMember, updateCastMember } from "../channels/service.js";
import { castSpeakers, withCastVoices } from "./cast.js";
import { defaultVoicesSettings, type Speaker } from "./model.js";
import { panelPortraits } from "./portraits.js";

const clock = fixedClock("2026-09-27T10:00:00.000Z");
function deps() {
  const db = openDb(":memory:");
  migrate(db, clock);
  return { db, clock, uuid: randomUUID };
}
const voice = { provider: "elevenlabs", model: "eleven_v3", voice: "host-voice" };

describe("cast voices", () => {
  it("keeps a member's voice, leaves it on an edit that does not send one, and removes it on null", () => {
    const d = deps();
    const id = randomUUID();
    const made = createCastMember(d, defaultChannelId, {
      id,
      kind: "character",
      name: "Ada",
      voice: { ...voice, pace: 1.1 },
    });
    expect(made.ok && made.value.voice).toEqual({ ...voice, pace: 1.1 });
    const renamed = updateCastMember(d, id, {
      kind: "character",
      name: "Ada Vale",
      baseVersion: 1,
    });
    expect(renamed.ok && renamed.value.voice).toEqual({ ...voice, pace: 1.1 });
    const cleared = updateCastMember(d, id, {
      kind: "character",
      name: "Ada Vale",
      voice: null,
      baseVersion: 2,
    });
    expect(cleared.ok && cleared.value.voice).toBeUndefined();
  });

  it("refuses a pace that is not on the list", () => {
    const refused = createCastMember(deps(), defaultChannelId, {
      id: randomUUID(),
      kind: "character",
      name: "Ada",
      voice: { ...voice, pace: 3 },
    });
    expect(refused).toMatchObject({ ok: false, message: "Pick a pace from the list." });
  });

  it("offers the members with a voice as speakers and refreshes cast speakers when a run starts", () => {
    const d = deps();
    const host = randomUUID();
    createCastMember(d, defaultChannelId, { id: host, kind: "character", name: "Ada", voice });
    createCastMember(d, defaultChannelId, { id: randomUUID(), kind: "place", name: "Harbor" });
    const members = castOfChannel(d.db, defaultChannelId);
    const offered = castSpeakers(members).speakers();
    expect(offered.map((one) => [one.name, one.castId, one.voice.voice])).toEqual([
      ["Ada", host, "host-voice"],
    ]);

    const [ada] = offered;
    if (ada === undefined) throw new Error("Ada has a voice");
    const settings = {
      ...defaultVoicesSettings("podcast"),
      speakers: [
        { ...ada, role: "host" as const },
        {
          id: "sam",
          name: "Sam",
          role: "host" as const,
          voice: { provider: "openai-tts", model: "tts-1", voice: "alloy" },
        },
      ],
    };
    expect(withCastVoices(settings, members)).toBe(settings);
    updateCastMember(d, host, {
      kind: "character",
      name: "Ada",
      voice: { ...voice, voice: "new-voice", pace: 0.9 },
      baseVersion: 1,
    });
    const refreshed = withCastVoices(settings, castOfChannel(d.db, defaultChannelId));
    expect(
      refreshed.speakers.map((one) => [one.name, one.role, one.voice.voice, one.pace]),
    ).toEqual([
      ["Ada", "host", "new-voice", 0.9],
      ["Sam", "host", "alloy", undefined],
    ]);
  });

  it("gives a cast speaker the member's first picture as their panel portrait", () => {
    const d = deps();
    const host = randomUUID();
    createCastMember(d, defaultChannelId, { id: host, kind: "character", name: "Ada", voice });
    const [ada] = castSpeakers(castOfChannel(d.db, defaultChannelId)).speakers();
    if (ada === undefined) throw new Error("Ada has a voice");
    // No picture: the speaker is exactly what it was before portraits.
    expect(ada).not.toHaveProperty("portrait");
    const settings = {
      ...defaultVoicesSettings("podcast"),
      speakers: [{ ...ada, role: "host" as const }],
    };
    expect(withCastVoices(settings, castOfChannel(d.db, defaultChannelId))).toBe(settings);

    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
    const uploaded = uploadCastImage(d, host, png);
    const later = uploadCastImage(d, host, new Uint8Array([0xff, 0xd8, 0xff, 9]));
    if (!uploaded.ok || !later.ok) throw new Error("Expected the pictures to upload.");
    const refreshed = withCastVoices(settings, castOfChannel(d.db, defaultChannelId));
    expect(refreshed.speakers[0]?.portrait).toBe(uploaded.value.sha256);

    // The panel reads the picture's bytes; an audiobook has no panel to put it in.
    expect(panelPortraits(d.db, refreshed)).toEqual([
      { sha256: uploaded.value.sha256, bytes: png, extension: ".png" },
    ]);
    expect(panelPortraits(d.db, { ...refreshed, format: "audiobook" })).toEqual([]);
    // A picture that is not in this database (a backup from another install) keeps the initials.
    const missing = {
      ...refreshed,
      speakers: [{ ...(refreshed.speakers[0] as Speaker), portrait: "b".repeat(64) }],
    };
    expect(panelPortraits(d.db, missing)).toEqual([undefined]);
  });
});
