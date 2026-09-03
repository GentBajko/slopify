import type { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { fixedClock } from "../../kernel/clock.fake.js";
import { openDb } from "../../kernel/db/index.js";
import { migrate } from "../../kernel/db/migrate.js";
import type { Ids } from "../../kernel/ids.js";
import type { VoicesDeps } from "./voices.js";
import { addVoice, removeVoice, voiceIdMax, voiceNameMax, voices } from "./voices.js";

const clock = fixedClock("2026-09-02T10:00:00.000Z");

function deps(): VoicesDeps {
  const db: DatabaseSync = openDb(":memory:");
  migrate(db, clock);
  let n = 0;
  const ids: Ids = {
    next: (): string => {
      n += 1;
      return `v${String(n)}`;
    },
  };
  return { db, ids };
}

describe("addVoice", () => {
  it("stores a trimmed name and voice ID", () => {
    const settings = deps();

    const result = addVoice(settings, {
      provider: "elevenlabs",
      name: "  Narrator M  ",
      voiceId: "  abc123  ",
    });

    expect(result).toEqual({
      ok: true,
      voice: { id: "v1", provider: "elevenlabs", name: "Narrator M", voiceId: "abc123" },
    });
    expect(voices(settings)).toEqual([
      { id: "v1", provider: "elevenlabs", name: "Narrator M", voiceId: "abc123" },
    ]);
  });

  // logic/02 §Q14: a voice may be added before any key exists, and nothing is checked
  // against the provider.
  it("does not require a key for the provider", () => {
    const settings = deps();

    expect(addVoice(settings, { provider: "cartesia", name: "N", voiceId: "x" }).ok).toBe(true);
  });

  // The schema's UNIQUE(provider, voice_id) is the rule. It reaches the caller as a
  // result, never as a SQLite exception.
  it("rejects a voice ID already used for that provider", () => {
    const settings = deps();
    addVoice(settings, { provider: "elevenlabs", name: "Narrator M", voiceId: "abc123" });

    const again = addVoice(settings, {
      provider: "elevenlabs",
      name: "Someone else",
      voiceId: "abc123",
    });

    expect(again).toEqual({ ok: false, reason: "duplicate-voice-id" });
    expect(voices(settings)).toHaveLength(1);
  });

  it("allows the same voice ID under a different provider", () => {
    const settings = deps();
    addVoice(settings, { provider: "elevenlabs", name: "Narrator M", voiceId: "abc123" });

    expect(
      addVoice(settings, { provider: "cartesia", name: "Narrator M", voiceId: "abc123" }).ok,
    ).toBe(true);
  });

  it("allows a repeated name under the same provider", () => {
    const settings = deps();
    addVoice(settings, { provider: "elevenlabs", name: "Narrator M", voiceId: "abc123" });

    expect(
      addVoice(settings, { provider: "elevenlabs", name: "Narrator M", voiceId: "def456" }).ok,
    ).toBe(true);
  });

  it("rejects a blank name", () => {
    expect(addVoice(deps(), { provider: "elevenlabs", name: "   ", voiceId: "abc" })).toEqual({
      ok: false,
      reason: "blank-name",
    });
  });

  it("rejects a blank voice ID", () => {
    expect(addVoice(deps(), { provider: "elevenlabs", name: "N", voiceId: " " })).toEqual({
      ok: false,
      reason: "blank-voice-id",
    });
  });

  it("rejects an over-long name", () => {
    expect(
      addVoice(deps(), {
        provider: "elevenlabs",
        name: "n".repeat(voiceNameMax + 1),
        voiceId: "a",
      }),
    ).toEqual({ ok: false, reason: "name-too-long" });
  });

  it("rejects an over-long voice ID", () => {
    expect(
      addVoice(deps(), { provider: "elevenlabs", name: "N", voiceId: "a".repeat(voiceIdMax + 1) }),
    ).toEqual({ ok: false, reason: "voice-id-too-long" });
  });

  it("rejects a provider that does not speak", () => {
    expect(addVoice(deps(), { provider: "openrouter", name: "N", voiceId: "a" })).toEqual({
      ok: false,
      reason: "not-a-tts-provider",
    });
  });
});

describe("removeVoice", () => {
  it("deletes the entry", () => {
    const settings = deps();
    addVoice(settings, { provider: "elevenlabs", name: "N", voiceId: "a" });

    expect(removeVoice(settings, "v1")).toEqual({ ok: true });
    expect(voices(settings)).toEqual([]);
  });

  it("says so when no voice has that id", () => {
    expect(removeVoice(deps(), "nope")).toEqual({ ok: false });
  });

  it("frees the voice ID for a new entry", () => {
    const settings = deps();
    addVoice(settings, { provider: "elevenlabs", name: "N", voiceId: "a" });
    removeVoice(settings, "v1");

    expect(addVoice(settings, { provider: "elevenlabs", name: "N2", voiceId: "a" }).ok).toBe(true);
  });
});
