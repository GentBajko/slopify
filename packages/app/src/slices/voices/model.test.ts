import { describe, expect, it } from "vitest";
import { defaultVoicesSettings, type Speaker, usesVoices, voicesProblems } from "./model.js";

const voiced = (id: string, name: string, role: Speaker["role"]): Speaker => ({
  id,
  name,
  role,
  voice: { provider: "openai", model: "tts-1", voice: "alloy" },
});

describe("voicesProblems", () => {
  it("passes a complete podcast", () => {
    expect(
      voicesProblems({
        ...defaultVoicesSettings("podcast"),
        speakers: [voiced("a", "Alex", "host"), voiced("b", "Sam", "host")],
      }),
    ).toEqual([]);
  });

  it("names every speaker that is missing a voice, a name or a unique name", () => {
    const fields = voicesProblems({
      ...defaultVoicesSettings("podcast"),
      speakers: [
        { ...voiced("a", "Alex", "host"), voice: { provider: "", model: "", voice: "" } },
        voiced("b", "alex", "host"),
        { ...voiced("c", "", "guest"), voice: { provider: "openai", model: "tts-1", voice: "" } },
      ],
    }).map((problem) => problem.field);
    expect(fields).toEqual([
      "voices.speakers.0.voice",
      "voices.speakers.1.name",
      "voices.speakers.2.name",
      "voices.speakers.2.voice.voice",
    ]);
  });

  it("asks an audiobook for a narrator and a podcast for two speakers", () => {
    expect(
      voicesProblems({
        ...defaultVoicesSettings("audiobook"),
        speakers: [voiced("m", "Mara", "character")],
      }).map((problem) => problem.message),
    ).toEqual([
      "An audiobook needs a narrator. Set one speaker's role to Narrator under Speakers (Play → Narration, or Edit project → Providers).",
    ]);
    expect(
      voicesProblems({
        ...defaultVoicesSettings("interview"),
        speakers: [voiced("h", "Host", "host")],
      }).map((problem) => problem.field),
    ).toEqual(["voices.speakers"]);
  });

  it("allows the speaker split for audiobooks only, and gaps and paces from the lists", () => {
    const fields = voicesProblems({
      ...defaultVoicesSettings("podcast"),
      source: "attribute",
      turnGapSeconds: 0.3,
      speakers: [{ ...voiced("a", "Alex", "host"), pace: 1.7 }, voiced("b", "Sam", "host")],
    }).map((problem) => problem.field);
    expect(fields).toEqual(["voices.source", "voices.speakers.0.pace", "voices.turnGapSeconds"]);
  });
});

it("counts voices only while narration is generated", () => {
  const voices = defaultVoicesSettings("drama");
  expect(usesVoices({ sources: { audio: "generate" }, voices })).toBe(true);
  expect(usesVoices({ sources: { audio: "provide" }, voices })).toBe(false);
  expect(usesVoices({ sources: { audio: "generate" } })).toBe(false);
});
