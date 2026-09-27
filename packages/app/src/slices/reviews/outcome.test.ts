import { describe, expect, it } from "vitest";
import { nextAttempt, reviewOutcome } from "./outcome.js";

describe("reviewOutcome", () => {
  it("passes a pass whatever the mode", () => {
    expect(reviewOutcome({ passed: true, mode: "redo", attempt: 9, retries: 2 })).toBe("passed");
    expect(reviewOutcome({ passed: true, mode: "flag", attempt: 1, retries: 2 })).toBe("passed");
  });

  it("only flags a failed item in Flag only", () => {
    expect(reviewOutcome({ passed: false, mode: "flag", attempt: 1, retries: 2 })).toBe("flagged");
  });

  it("sends a failed item back while its retries last, then keeps and flags it", () => {
    const tries = [1, 2, 3, 4].map((attempt) =>
      reviewOutcome({ passed: false, mode: "redo", attempt, retries: 2 }),
    );
    expect(tries).toEqual(["redo", "redo", "flagged", "flagged"]);
    expect(reviewOutcome({ passed: false, mode: "redo", attempt: 1, retries: 0 })).toBe("flagged");
  });
});

describe("nextAttempt", () => {
  const redo = {
    attempt: 1,
    outcome: "redo" as const,
    itemFingerprint: "old",
    action: null,
    redoState: "started" as const,
  };

  it("starts at one and counts the automatic redos, so the limit ends the loop", () => {
    expect(nextAttempt(undefined, "a")).toBe(1);
    expect(nextAttempt(redo, "new")).toBe(2);
    expect(nextAttempt({ ...redo, attempt: 2 }, "newer")).toBe(3);
    // Three failed tries with two retries: the third is flagged and nothing is redone again.
    expect(reviewOutcome({ passed: false, mode: "redo", attempt: 3, retries: 2 })).toBe("flagged");
  });

  it("keeps the number when the same output is reviewed again", () => {
    expect(nextAttempt({ ...redo, attempt: 2 }, "old")).toBe(2);
  });

  it("starts again after a person acted, or when the redo never started", () => {
    expect(nextAttempt({ ...redo, action: "redone" }, "new")).toBe(1);
    expect(nextAttempt({ ...redo, action: "overruled" }, "new")).toBe(1);
    expect(nextAttempt({ ...redo, redoState: "failed" }, "new")).toBe(1);
    expect(nextAttempt({ ...redo, outcome: "flagged" }, "new")).toBe(1);
  });
});
