import { describe, expect, it } from "vitest";
import { savedClips } from "./runtime-shorts.js";

// A short's render reads its clip from the version's pick. On a project from before an
// older fingerprint scheme the pick is kept under another fingerprint than the plan's.
const clip = {
  number: 1,
  first: 1,
  last: 2,
  start: 0,
  end: 60,
  title: "A title",
  description: "A description",
  hashtags: [],
  why: "Why",
  text: "Some words.",
};
const snapshot = (fingerprint: string, planned: readonly string[]) =>
  ({
    plan: {
      recipes: [
        { key: "shorts:pick", fingerprint: "plan-fp" },
        ...planned.map((key) => ({ key, fingerprint: `fp-${key}` })),
      ],
    },
    view: {
      revision: {
        config: { shorts: { count: 1, minSeconds: 30, maxSeconds: 120 } },
        content: {},
      },
      pieces: [
        {
          key: "shorts:pick",
          fingerprint,
          selected: true,
          piece: { state: "done", payload: JSON.stringify({ shorts: [clip] }) },
        },
      ],
    },
  }) as unknown as Parameters<typeof savedClips>[0];

describe("the clips a short's render reads", () => {
  it("are the pick's when it carries the plan's fingerprint", () => {
    expect(savedClips(snapshot("plan-fp", [])).map((one) => one.number)).toEqual([1]);
  });
  it("are the version's one pick when the plan planned its clips from it", () => {
    expect(savedClips(snapshot("older-fp", ["shorts:1:render"])).map((one) => one.number)).toEqual([
      1,
    ]);
  });
  it("are none when the plan did not plan clips from that pick", () => {
    expect(savedClips(snapshot("older-fp", []))).toEqual([]);
  });
});
