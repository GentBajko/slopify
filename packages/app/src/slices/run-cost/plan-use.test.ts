import { describe, expect, it } from "vitest";
import type { LimitWindow } from "../../kernel/ports/plan-limits.js";
import { type CallReading, windowUse } from "./plan-use.js";

const t0 = Date.parse("2026-10-18T10:00:00.000Z");
const at = (minute: number): number => t0 + minute * 60_000;
const iso = (minute: number): string => new Date(at(minute)).toISOString();
const weekReset = "2026-10-20T00:00:00.000Z";

function weekly(usedPercent: number, resetsAt: string | null = weekReset): LimitWindow[] {
  return [{ kind: "weekly", usedPercent, resetsAt }];
}

function call(
  usageId: string | null,
  start: number,
  end: number,
  tokens: number | null,
  limits: { readonly before?: LimitWindow[]; readonly after?: LimitWindow[] },
): CallReading {
  return { usageId, startMs: at(start), endMs: at(end), tokens, ...limits };
}

describe("windowUse", () => {
  it("never charges more than 100% for parallel zig-zag readings with a drifting reset (legacy data)", () => {
    // Six parallel Claude calls stored before each call's own readings were kept: their
    // after-readings interleave, and the reset the CLI reports drifts by 6-10 minutes. The old
    // sum added every rise of the zig-zag and the whole reading on every drift: 119%+.
    const drift = (minutes: number): string =>
      new Date(Date.parse(weekReset) + minutes * 60_000).toISOString();
    const readings = [40, 60, 45, 70, 50, 80].map((used, index) =>
      call(null, index, index, null, { after: weekly(used, drift(index % 2 === 0 ? 0 : 8)) }),
    );
    const [use] = windowUse(readings);
    expect(use).toMatchObject({
      kind: "weekly",
      basis: "approximate",
      fromPercent: 40,
      nowPercent: 80,
      accountPercent: 40,
      rolledOver: false,
    });
    expect(use?.usedPercent).toBe(40);
  });

  it("splits overlapping calls' rises by tokens instead of counting each zig-zag again", () => {
    // The same six calls with their own readings: each overlaps the next.
    const own = [40, 60, 45, 70, 50, 80].map((used, index) =>
      call(`u${index}`, index, index + 2, 1000, {
        before: weekly(used - 5),
        after: weekly(used),
      }),
    );
    const [use] = windowUse(own);
    expect(use?.basis).toBe("split");
    expect(use?.usedPercent ?? 101).toBeLessThanOrEqual(use?.accountPercent ?? 0);
    expect(use?.accountPercent ?? 101).toBeLessThanOrEqual(100);
  });

  it("charges a call measured alone its own rise, not the other use between calls", () => {
    // 12 → 20 happened between the two calls, outside this run.
    const own = [
      call("u1", 0, 2, 500, { before: weekly(10), after: weekly(12) }),
      call("u2", 30, 32, 500, { before: weekly(20), after: weekly(23) }),
    ];
    expect(windowUse(own)).toEqual([
      {
        kind: "weekly",
        usedPercent: 5,
        basis: "measured",
        sharedCalls: 0,
        fromPercent: 10,
        accountPercent: 13,
        rolledOver: false,
        nowPercent: 23,
        resetsAt: weekReset,
      },
    ]);
  });

  it("splits the rise of calls that overlapped by their token share", () => {
    const own = [
      call("u1", 0, 10, 300, { before: weekly(10), after: weekly(16) }),
      call("u2", 5, 15, 100, { before: weekly(12), after: weekly(18) }),
    ];
    const [use] = windowUse(own);
    // 6 × 300/400 + 6 × 100/400.
    expect(use).toMatchObject({ basis: "split", usedPercent: 6, accountPercent: 8 });
  });

  it("says a share is shared when a call of unknown size ran beside it", () => {
    const own = [call("u1", 0, 10, 300, { before: weekly(10), after: weekly(16) })];
    const [use] = windowUse(own, {
      calls: [{ id: "other", startMs: at(2), endMs: at(4), tokens: null }],
      readings: [],
    });
    expect(use).toMatchObject({ basis: "shared", usedPercent: null, sharedCalls: 1 });
  });

  it("measures an after-only call from the account's reading just before it", () => {
    const earlier = call("x1", -3, -1, 100, { after: weekly(30) });
    const own = [call("u1", 0, 2, 100, { after: weekly(33) })];
    const [use] = windowUse(own, {
      calls: [{ id: "x1", startMs: at(-3), endMs: at(-1), tokens: 100 }],
      readings: [earlier],
    });
    expect(use).toMatchObject({ basis: "measured", usedPercent: 3, fromPercent: 30 });
    // A reading long before the call says nothing about what the call alone used.
    const stale = call("x2", -63, -61, 100, { after: weekly(30) });
    const [far] = windowUse(own, { calls: [], readings: [stale] });
    expect(far).toMatchObject({ basis: "shared", usedPercent: null, sharedCalls: 1 });
  });

  it("rolls a window over only when the reading drops or the reset passes", () => {
    const own = [
      // A small drift in the stated reset is the same window: 2 points, not 52.
      call("u1", 0, 1, 100, {
        before: weekly(50),
        after: weekly(52, new Date(Date.parse(weekReset) + 10 * 60_000).toISOString()),
      }),
      // The 5-hour window reset during this call: only what came after the reset counts.
      call("u2", 10, 12, 100, {
        before: [{ kind: "five_hour", usedPercent: 95, resetsAt: iso(11) }],
        after: [{ kind: "five_hour", usedPercent: 3, resetsAt: iso(11 + 300) }],
      }),
    ];
    const uses = windowUse(own);
    expect(uses.map((use) => [use.kind, use.usedPercent, use.rolledOver])).toEqual([
      ["five_hour", 3, true],
      ["weekly", 2, false],
    ]);
  });
});
