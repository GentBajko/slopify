import { describe, expect, it } from "vitest";
import { groupTurns } from "./grouping.js";
import type { Speaker } from "./model.js";
import type { ScriptTurn } from "./script.js";

const eleven = (id: string, voice: string, pace?: number): Speaker => ({
  id,
  name: id,
  role: "host",
  voice: { provider: "elevenlabs", model: "eleven_v3", voice },
  ...(pace === undefined ? {} : { pace }),
});
const turn = (index: number, speaker: string, text = `Line ${String(index)}.`): ScriptTurn => ({
  index,
  speaker,
  text,
  section: -1,
});
const shape = (groups: ReturnType<typeof groupTurns>) =>
  groups.map((group) => [group.native, group.turns.map((one) => one.index)]);

describe("groupTurns", () => {
  it("puts consecutive turns of a native multi-speaker model in one request", () => {
    const speakers = [eleven("a", "va"), eleven("b", "vb")];
    const groups = groupTurns([turn(1, "a"), turn(2, "b"), turn(3, "a")], speakers, true);
    expect(shape(groups)).toEqual([[true, [1, 2, 3]]]);
  });

  it("speaks every turn on its own with native requests turned off", () => {
    const speakers = [eleven("a", "va"), eleven("b", "vb")];
    const groups = groupTurns([turn(1, "a"), turn(2, "b")], speakers, false);
    expect(shape(groups)).toEqual([
      [false, [1]],
      [false, [2]],
    ]);
  });

  it("falls back per turn for a model without native dialogue and splits the runs around it", () => {
    const other: Speaker = {
      id: "c",
      name: "c",
      role: "guest",
      voice: { provider: "openai", model: "tts-1", voice: "alloy" },
    };
    const speakers = [eleven("a", "va"), eleven("b", "vb"), other];
    const groups = groupTurns(
      [turn(1, "a"), turn(2, "b"), turn(3, "c"), turn(4, "a"), turn(5, "b")],
      speakers,
      true,
    );
    expect(shape(groups)).toEqual([
      [true, [1, 2]],
      [false, [3]],
      [true, [4, 5]],
    ]);
  });

  it("closes a request at the character limit and at a change of pace", () => {
    const speakers = [eleven("a", "va"), eleven("b", "vb"), eleven("slow", "vs", 0.8)];
    const long = "x".repeat(1200);
    const groups = groupTurns(
      [turn(1, "a", long), turn(2, "b", long), turn(3, "a"), turn(4, "slow"), turn(5, "slow")],
      speakers,
      true,
    );
    expect(shape(groups)).toEqual([
      [false, [1]],
      [true, [2, 3]],
      [true, [4, 5]],
    ]);
  });

  it("measures the limit on the text the voice gets, after narration aliases", () => {
    const speakers = [eleven("a", "va"), eleven("b", "vb")];
    const turns = [turn(1, "a", "x".repeat(900)), turn(2, "b", "x".repeat(900))];
    expect(shape(groupTurns(turns, speakers, true))).toEqual([[true, [1, 2]]]);
    // An alias that doubles the text pushes the pair past the 2,000-character request.
    expect(shape(groupTurns(turns, speakers, true, (text) => text.length * 2))).toEqual([
      [false, [1]],
      [false, [2]],
    ]);
  });

  it("keeps a turn longer than one request on its own", () => {
    const speakers = [eleven("a", "va")];
    const groups = groupTurns([turn(1, "a", "y".repeat(2500)), turn(2, "a")], speakers, true);
    expect(shape(groups)).toEqual([
      [false, [1]],
      [false, [2]],
    ]);
  });

  it("gives Gemini at most two voices per request, splitting where a third would join", () => {
    const gemini = (id: string, voice: string): Speaker => ({
      id,
      name: id,
      role: "host",
      voice: { provider: "google-tts", model: "gemini-2.5-flash-preview-tts", voice },
    });
    const speakers = [gemini("a", "Kore"), gemini("b", "Puck"), gemini("c", "Leda")];
    const groups = groupTurns(
      [turn(1, "a"), turn(2, "b"), turn(3, "a"), turn(4, "c"), turn(5, "a")],
      speakers,
      true,
    );
    expect(shape(groups)).toEqual([
      [true, [1, 2, 3]],
      [true, [4, 5]],
    ]);
    // A model Gemini has no two-speaker mode for is spoken turn by turn.
    const other = speakers.map((one) => ({ ...one, voice: { ...one.voice, model: "other" } }));
    expect(shape(groupTurns([turn(1, "a"), turn(2, "b")], other, true))).toEqual([
      [false, [1]],
      [false, [2]],
    ]);
  });
});
