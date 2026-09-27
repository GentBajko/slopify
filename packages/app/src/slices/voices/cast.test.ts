import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { fixedClock } from "../../kernel/clock.fake.js";
import { openDb } from "../../kernel/db/index.js";
import { migrate } from "../../kernel/db/migrate.js";
import { defaultChannelId } from "../channels/model.js";
import { castOfChannel } from "../channels/repo.js";
import { createCastMember, updateCastMember } from "../channels/service.js";
import { castSpeakers, withCastVoices } from "./cast.js";
import { defaultVoicesSettings } from "./model.js";

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
});
