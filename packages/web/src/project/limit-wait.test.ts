import { describe, expect, it } from "vitest";
import { limitClock, limitNames, limitWaitLine } from "./limit-wait.js";

// The words a wait for a CLI plan's limits reads in, on the project page, Home, Projects and
// the calendar.
describe("the plan-limit line", () => {
  it("names the CLI and when it resets", () => {
    const resetsAt = new Date(new Date().setHours(14, 0, 0, 0)).toISOString();
    const line = limitWaitLine([
      {
        name: "Codex",
        resetsAt,
        retryAt: new Date(new Date().setHours(14, 2, 0, 0)).toISOString(),
      },
    ]);
    expect(line).toBe(`Waiting for Codex limits (resets at ${limitClock(resetsAt)})`);
    expect(limitWaitLine([])).toBeUndefined();
    expect(limitWaitLine(undefined)).toBeUndefined();
  });

  it("says when it checks again if the CLI gave no reset time", () => {
    expect(
      limitWaitLine(
        [{ name: "Gemini", resetsAt: null, retryAt: "2026-09-27T10:30:00.000Z" }],
        () => "10:30",
      ),
    ).toBe("Waiting for Gemini limits (checking again at 10:30)");
  });

  it("names every plan a run waits on", () => {
    const wait = { resetsAt: null, retryAt: "2026-09-27T10:30:00.000Z" };
    expect(
      limitNames([
        { ...wait, name: "Codex" },
        { ...wait, name: "Codex" },
      ]),
    ).toBe("Codex");
    expect(
      limitNames([
        { ...wait, name: "Codex" },
        { ...wait, name: "Claude" },
        { ...wait, name: "Gemini" },
      ]),
    ).toBe("Codex, Claude and Gemini");
  });
});
