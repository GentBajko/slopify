import { describe, expect, it } from "vitest";
import { lookupDue, lookupStart } from "./links.js";
import { noProgress } from "./state.js";

const now = new Date("2026-10-18T10:00:00.000Z");
const ago = (minutes: number) => new Date(now.getTime() - minutes * 60_000).toISOString();

describe("lookupDue", () => {
  it("looks up a filled post ten minutes after it was filled", () => {
    const filled = { ...noProgress, state: "filled", filledAt: ago(11) } as const;
    expect(lookupDue(filled, null, now)).toBe(true);
    expect(lookupDue({ ...filled, filledAt: ago(5) }, null, now)).toBe(false);
  });

  it("looks up a scheduled post ten minutes after its release", () => {
    const scheduled = { ...noProgress, state: "scheduled", filledAt: ago(100) } as const;
    expect(lookupDue(scheduled, ago(5), now)).toBe(false);
    expect(lookupDue(scheduled, ago(15), now)).toBe(true);
  });

  it("stops looking after a week, and never for a post with its link or not filled", () => {
    const filled = { ...noProgress, state: "filled", filledAt: ago(8 * 24 * 60) } as const;
    expect(lookupDue(filled, null, now)).toBe(false);
    expect(lookupDue({ ...filled, filledAt: ago(20), url: "u" }, null, now)).toBe(false);
    expect(lookupDue({ ...noProgress, state: "waiting", filledAt: ago(20) }, null, now)).toBe(
      false,
    );
    expect(lookupDue({ ...noProgress, state: "filled" }, null, now)).toBe(false);
  });
});

describe("lookupStart", () => {
  it("takes the first 40 characters with the spaces as the site shows them", () => {
    expect(lookupStart("  A  story\nabout the sea, told slowly for sleeping tonight.")).toBe(
      "A story about the sea, told slowly for s",
    );
  });
});
