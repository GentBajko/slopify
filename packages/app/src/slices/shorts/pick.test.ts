import { describe, expect, it } from "vitest";
import type { TranscriptSentence } from "../youtube/transcript.js";
import { checkPicks, noPicksMessage, pickMessages, pickRetryMessages } from "./pick.js";

// Ten sentences of 9.5 s each, half a second apart: sentence n runs (n-1)*10 to (n-1)*10+9.5.
const sentences: readonly TranscriptSentence[] = Array.from({ length: 10 }, (_value, at) => ({
  number: at + 1,
  start: at * 10,
  end: at * 10 + 9.5,
  text: `Sentence ${String(at + 1)}.`,
  firstWord: at * 2,
  lastWord: at * 2 + 1,
}));
const limits = { count: 2, minSeconds: 20, maxSeconds: 40, durationSeconds: 100 };
const clip = (first: number, last: number, title = `Clip ${String(first)}`) => ({
  first,
  last,
  title,
  description: "One line\nabout it.",
  hashtags: ["history", "#Harbor", "#Harbor", "not one"],
  why: "Stands alone.",
});

describe("checkPicks", () => {
  it("snaps each clip to its sentences' times, with a little room either side", () => {
    const checked = checkPicks(JSON.stringify([clip(2, 3)]), sentences, {
      ...limits,
      count: 1,
    });
    expect(checked).toEqual({
      ok: true,
      problems: [],
      picks: [
        {
          number: 1,
          first: 2,
          last: 3,
          // A quarter second before its first word and never past halfway to the sentence
          // before; the same after its last.
          start: 9.75,
          end: 29.75,
          title: "Clip 2",
          description: "One line about it.",
          hashtags: ["#history", "#Harbor"],
          why: "Stands alone.",
          text: "Sentence 2. Sentence 3.",
        },
      ],
    });
  });

  it("drops clips of the wrong length, out of range, or overlapping one already kept", () => {
    const checked = checkPicks(
      `Here you go:\n\`\`\`json\n${JSON.stringify([
        clip(1, 1),
        clip(4, 5),
        clip(5, 6),
        clip(9, 12),
        clip(7, 6),
        clip(8, 9, "x".repeat(61)),
      ])}\n\`\`\``,
      sentences,
      limits,
    );
    if (!checked.ok) throw new Error(checked.reason);
    expect(checked.picks.map((pick) => [pick.first, pick.last])).toEqual([[4, 5]]);
    expect(checked.problems).toEqual([
      "Clip 1 (sentences 1-1) lasts 10 seconds, and each clip must last 20-40 seconds.",
      "Clip 3 (sentences 5-6) shares sentences with the clip of sentences 4-5.",
      "Clip 4 runs from sentence 9 to 12, but the transcript has sentences 1 to 10 and the first must not come after the last.",
      "Clip 5 runs from sentence 7 to 6, but the transcript has sentences 1 to 10 and the first must not come after the last.",
      "Clip 6's title is 61 characters; keep it to 60.",
    ]);
  });

  it("keeps the best clips up to the number asked for, then orders them as they play", () => {
    const checked = checkPicks(
      JSON.stringify([clip(7, 8), clip(1, 3), clip(4, 5)]),
      sentences,
      limits,
    );
    if (!checked.ok) throw new Error(checked.reason);
    expect(checked.picks.map((pick) => [pick.number, pick.first])).toEqual([
      [1, 1],
      [2, 7],
    ]);
    expect(checked.problems).toEqual([]);
  });

  it("says when the answer lists fewer clips than were asked for", () => {
    const checked = checkPicks(JSON.stringify([clip(1, 3)]), sentences, limits);
    if (!checked.ok) throw new Error(checked.reason);
    expect(checked.problems).toEqual(["The answer lists 1 clip, and 2 were asked for."]);
  });

  it("fails an answer that isn't a JSON list of clips", () => {
    for (const text of ["No clips today.", JSON.stringify({ first: 1 }), '[{"first": 1}]'])
      expect(checkPicks(text, sentences, limits)).toEqual({
        ok: false,
        reason:
          "The AI model's choice of shorts didn't come back in the expected format (a JSON list of clips, each with first and last sentence numbers, a title, a description and hashtags). Retry stage, or choose another model in Edit project → Providers.",
      });
  });
});

describe("the pick's messages", () => {
  const brief = {
    instruction: "Pick hooks.",
    title: "Harbors",
    durationSeconds: 100,
    count: 2,
    minSeconds: 20,
    maxSeconds: 40,
    sentences: "[1] (0:00-0:09) Sentence 1.",
  };

  it("asks for strict JSON by sentence number, within the length range", () => {
    const [system, user] = pickMessages(brief);
    expect(system?.content).toContain("Answer with one JSON array and nothing else");
    expect(system?.content).toContain("Exactly 2 shorts");
    expect(system?.content).toContain("Each clip lasts between 20 and 40 seconds");
    expect(user?.content).toContain("Pick hooks.");
    expect(user?.content).toContain("Video length: 1:40");
    expect(user?.content).toContain("[1] (0:00-0:09) Sentence 1.");
  });

  it("asks once more with the first answer and what was wrong with it", () => {
    const messages = pickRetryMessages(brief, "[first answer]", ["Clip 1 is too short."]);
    expect(messages.slice(-2)).toEqual([
      { role: "assistant", content: "[first answer]" },
      {
        role: "user",
        content:
          "Some of those clips can't be used:\n- Clip 1 is too short.\n\nAnswer again with the whole list of 2 clips as one JSON array, following every rule.",
      },
    ]);
  });

  it("says what to change when nothing usable came back", () => {
    expect(noPicksMessage(["Clip 1 is too short."], limits)).toBe(
      "The AI model didn't pick any clip Slopify could use as a short, twice (Clip 1 is too short.). Retry stage; if it keeps happening, widen the length range in Edit project → Prompts → Shorts, or choose another model in Edit project → Providers.",
    );
    expect(noPicksMessage([], { ...limits, durationSeconds: 12 })).toBe(
      "The narration is 12 seconds long, shorter than the 20-second minimum for a short, so there is nothing to cut. Lower the shortest length in Edit project → Prompts → Shorts, then Retry stage.",
    );
  });
});
