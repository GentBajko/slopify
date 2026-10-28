import { describe, expect, it } from "vitest";
import type { ModelInfo } from "../../kernel/ports/model.js";
import type { ModelCheckRow, ModelStandingView } from "./model.js";
import {
  ago,
  badgeOf,
  costPhrase,
  dollarsText,
  mergeVerdict,
  newForYou,
  pickerEntries,
  standingOf,
} from "./rules.js";

const row = (over: Partial<ModelCheckRow> = {}): ModelCheckRow => ({
  provider: "openrouter",
  family: "llm",
  model: "a",
  account: "acct",
  listed: null,
  listedAt: null,
  verdict: null,
  verdictSource: null,
  sentence: null,
  checkedAt: null,
  cost: 0,
  firstWorksAt: null,
  noticeSeen: false,
  ...over,
});
const view = (standing: ModelStandingView["standing"]): ModelStandingView => ({
  standing,
  checkedAt: null,
  sentence: null,
  source: null,
});
const model = (id: string): ModelInfo => ({ id, name: id.toUpperCase() });

describe("mergeVerdict", () => {
  const works = {
    verdict: "works",
    verdictSource: "check",
    sentence: null,
    checkedAt: "2026-10-01T00:00:00Z",
  } as const;

  it("takes the first answer", () => {
    expect(
      mergeVerdict(undefined, {
        verdict: "no-access",
        source: "run",
        sentence: "Nope.",
        at: "2026-10-01T00:00:00Z",
      }),
    ).toEqual({
      verdict: "no-access",
      verdictSource: "run",
      sentence: "Nope.",
      checkedAt: "2026-10-01T00:00:00Z",
    });
  });

  it("lets a newer no-access beat an older works, and the other way round", () => {
    const denied = mergeVerdict(works, {
      verdict: "no-access",
      source: "run",
      sentence: "No.",
      at: "2026-10-02T00:00:00Z",
    });
    expect(denied.verdict).toBe("no-access");
    expect(
      mergeVerdict(denied, {
        verdict: "works",
        source: "check",
        sentence: null,
        at: "2026-10-03T00:00:00Z",
      }).verdict,
    ).toBe("works");
  });

  it("ignores an answer older than the stored one", () => {
    expect(
      mergeVerdict(works, {
        verdict: "no-access",
        source: "run",
        sentence: "No.",
        at: "2026-09-30T00:00:00Z",
      }),
    ).toBe(works);
  });

  it("keeps a decisive verdict when a later check failed", () => {
    expect(
      mergeVerdict(works, {
        verdict: "failed",
        source: "check",
        sentence: "Busy.",
        at: "2026-10-05T00:00:00Z",
      }),
    ).toBe(works);
  });

  it("records a failure when nothing decisive is known", () => {
    expect(
      mergeVerdict(undefined, {
        verdict: "failed",
        source: "check",
        sentence: "Busy.",
        at: "2026-10-05T00:00:00Z",
      }).verdict,
    ).toBe("failed");
  });
});

describe("standingOf", () => {
  it("is known without a row, without an account, or for another account", () => {
    expect(standingOf(undefined, "acct").standing).toBe("known");
    expect(standingOf(row({ verdict: "works" }), undefined).standing).toBe("known");
    expect(standingOf(row({ verdict: "works" }), "other").standing).toBe("known");
  });

  it("reads works, no-access, listed and a failure that keeps it listed or known", () => {
    expect(
      standingOf(row({ verdict: "works", verdictSource: "run", checkedAt: "x" }), "acct"),
    ).toEqual({
      standing: "works",
      checkedAt: "x",
      sentence: null,
      source: "run",
    });
    expect(standingOf(row({ verdict: "no-access", sentence: "No." }), "acct").standing).toBe(
      "no-access",
    );
    expect(standingOf(row({ listed: true }), "acct").standing).toBe("listed");
    expect(standingOf(row({ listed: true, verdict: "failed" }), "acct").standing).toBe("listed");
    expect(standingOf(row({ listed: false, verdict: "failed" }), "acct").standing).toBe("known");
  });

  it("attaches a retirement", () => {
    const retiring = { on: "2026-11-30", replacement: { id: "b", name: "B" } };
    expect(standingOf(undefined, "acct", retiring).retiring).toEqual(retiring);
    expect(standingOf(row({ verdict: "works" }), "acct", retiring).retiring).toEqual(retiring);
  });
});

describe("pickerEntries", () => {
  const models = [model("k"), model("n"), model("w"), model("l")];
  const standings = { w: view("works"), n: view("no-access"), l: view("listed") };

  it("shows only working models by default, with the hidden count", () => {
    const list = pickerEntries(models, standings, "", false);
    expect(list.entries.map((e) => e.model.id)).toEqual(["w"]);
    expect(list.hidden).toBe(3);
    expect(list.fallback).toBe(false);
  });

  it("keeps the chosen model even when it is not on the plan", () => {
    const list = pickerEntries(models, standings, "n", false);
    expect(list.entries.map((e) => e.model.id)).toEqual(["w", "n"]);
  });

  it("shows everything, sorted works, listed, known, no-access, with Show all", () => {
    const list = pickerEntries(models, standings, "", true);
    expect(list.entries.map((e) => e.model.id)).toEqual(["w", "l", "k", "n"]);
    expect(list.hidden).toBe(0);
  });

  it("falls back to listed models when nothing works yet", () => {
    const list = pickerEntries(models, { l: view("listed"), n: view("no-access") }, "", false);
    expect(list.entries.map((e) => e.model.id)).toEqual(["l"]);
    expect(list.fallback).toBe(true);
  });

  it("falls back to every known model before any check, never empty", () => {
    const list = pickerEntries(models, undefined, "", false);
    expect(list.entries.map((e) => e.model.id)).toEqual(["k", "n", "w", "l"]);
    expect(list.fallback).toBe(true);
    expect(list.hidden).toBe(0);
  });

  it("hides known models once something works", () => {
    const list = pickerEntries(models, { w: view("works") }, "", false);
    expect(list.entries.map((e) => e.model.id)).toEqual(["w"]);
  });
});

describe("badgeOf", () => {
  const now = new Date("2026-10-18T12:00:00Z");
  it("names each standing", () => {
    expect(
      badgeOf({ ...view("works"), checkedAt: "2026-10-18T10:00:00Z", source: "check" }, now),
    ).toBe("✓ works · checked 2 h ago");
    expect(
      badgeOf({ ...view("works"), checkedAt: "2026-10-18T11:55:00Z", source: "run" }, now),
    ).toBe("✓ works · used 5 min ago");
    expect(badgeOf(view("works"), now)).toBe("✓ works");
    expect(badgeOf(view("no-access"), now)).toBe("✕ not on your plan");
    expect(badgeOf(view("listed"), now)).toBe("? listed for you · not checked");
    expect(badgeOf(view("known"), now)).toBe("? not checked");
    expect(badgeOf(undefined, now)).toBe("? not checked");
  });

  it("puts a retirement first", () => {
    expect(
      badgeOf(
        {
          ...view("works"),
          retiring: { on: "2026-11-30", replacement: { id: "b", name: "Model B" } },
        },
        now,
      ),
    ).toBe("⚠ retiring 30 Nov → Model B");
    expect(
      badgeOf({ ...view("known"), retiring: { on: "2026-11-30", replacement: null } }, now),
    ).toBe("⚠ retiring 30 Nov");
  });

  it("says how long ago in words", () => {
    expect(ago("2026-10-18T12:00:20Z", now)).toBe("just now");
    expect(ago("2026-10-17T12:00:00Z", now)).toBe("yesterday");
    expect(ago("2026-10-14T12:00:00Z", now)).toBe("4 days ago");
  });
});

describe("newForYou", () => {
  it("lists unseen models that started working, newest first", () => {
    const rows = [
      row({ model: "a", verdict: "works", firstWorksAt: "2026-10-01" }),
      row({ model: "b", verdict: "works", firstWorksAt: "2026-10-03" }),
      row({ model: "c", verdict: "works", firstWorksAt: "2026-10-02", noticeSeen: true }),
      row({ model: "d", verdict: "no-access", firstWorksAt: "2026-10-02" }),
      row({ model: "e", verdict: "works", firstWorksAt: null }),
    ];
    expect(newForYou(rows).map((r) => r.model)).toEqual(["b", "a"]);
  });
});

describe("costPhrase", () => {
  it("finishes a sentence 'this costs …' whatever is priced", () => {
    expect(costPhrase(0)).toBe("nothing");
    expect(costPhrase(0.0004)).toBe("less than a cent at list price");
    expect(costPhrase(0.0412)).toBe("about $0.04 at list price");
    expect(costPhrase(0, 3)).toBe("an unknown amount: 3 models have no listed price");
    expect(costPhrase(0, 1)).toBe("an unknown amount: 1 model has no listed price");
    expect(costPhrase(0.05, 2)).toBe(
      "about $0.05 at list price, plus an unknown amount for 2 models with no listed price",
    );
  });
});

describe("dollarsText", () => {
  it("says what a check costs in words", () => {
    expect(dollarsText(0)).toBe("free");
    expect(dollarsText(0.0004)).toBe("less than a cent");
    expect(dollarsText(0.0412)).toBe("about $0.04");
    expect(dollarsText(0, 1)).toBe("1 model with no listed price (price unknown)");
    expect(dollarsText(0.05, 2)).toBe("about $0.05, plus 2 models with no listed price");
  });
});
