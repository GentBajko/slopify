import { afterEach, describe, expect, it } from "vitest";
import { designCatalogue, designHarness, type Harness, pngOf } from "./designs.fake.js";
import { poster } from "./document.fake.js";
import { createDesignRunner } from "./runner.js";
import { designView } from "./service.js";
import { validDate } from "./template-checks.js";
import { makeFromTemplate, quoteTemplate } from "./template-make.js";
import {
  createTemplate,
  getTemplate,
  listTemplates,
  markTemplateReady,
  saveTemplate,
} from "./templates.js";

let h: Harness;
afterEach(() => h.cleanup());

function setup(doc = poster()) {
  h = designHarness();
  const runner = createDesignRunner({
    ...h.deps,
    catalogue: () => designCatalogue,
    generate: async () => ({ bytes: pngOf(1080, 1920, 4), mime: "image/png" }),
  });
  const made = createTemplate(h.deps, {
    id: "t1",
    mutationId: "mutation-0001",
    name: "Gig poster",
    document: doc,
  });
  if (!made.ok) throw new Error(made.message);
  return { runner, make: { service: h.deps, runner, catalogue: () => designCatalogue } };
}

const values = { Event: "Late Set", Date: "2026-11-14", Venue: "The Cellar", Price: "€12" };

describe("design templates", () => {
  it("keeps every Save as a new version and refuses one made on an older version", () => {
    setup();
    const second = saveTemplate(h.deps, "t1", {
      baseVersion: 1,
      name: "Gig poster",
      document: poster({ text: { ...poster().text, preset: "centered" } }),
    });
    expect(second.ok && [second.value.saved, second.value.template.headVersion]).toEqual([true, 2]);
    const unchanged = saveTemplate(h.deps, "t1", {
      baseVersion: 1,
      name: "Gig poster",
      document: poster({ text: { ...poster().text, preset: "centered" } }),
    });
    expect(unchanged.ok && [unchanged.value.saved, unchanged.value.template.headVersion]).toEqual([
      false,
      2,
    ]);
    const stale = saveTemplate(h.deps, "t1", {
      baseVersion: 1,
      name: "Renamed",
      document: poster(),
    });
    expect(
      stale.ok ? "saved" : [stale.reason, (stale.current as { headVersion: number }).headVersion],
    ).toEqual(["changed", 2]);
    expect(getTemplate(h.db, "t1")?.versions.map((one) => [one.version, one.gate])).toEqual([
      [1, "unchecked"],
      [2, "unchecked"],
    ]);
    expect(saveTemplate(h.deps, "gone", { baseVersion: 1, name: "x", document: poster() }).ok).toBe(
      false,
    );
    expect(saveTemplate(h.deps, "t1", { baseVersion: 1, name: "", document: poster() }).ok).toBe(
      false,
    );
  });

  it("answers a repeated create with the same template and refuses its id reused", () => {
    setup();
    expect(
      createTemplate(h.deps, {
        id: "t1",
        mutationId: "mutation-0001",
        name: "Gig poster",
        document: poster(),
      }).ok,
    ).toBe(true);
    const reused = createTemplate(h.deps, {
      id: "t2",
      mutationId: "mutation-0001",
      name: "Other",
      document: poster(),
    });
    expect(reused.ok ? "made" : reused.reason).toBe("mutation-reused");
    expect(listTemplates(h.db).map((one) => one.id)).toEqual(["t1"]);
  });

  it("marks a version ready only when its checks pass, listing those that don't", async () => {
    setup(
      poster({
        samples: { Event: "Late Set", Date: "14 Nov", Venue: "" },
        schedule: { dateField: "Date", daysBefore: 7, time: "09:00" },
      }),
    );
    const refused = await markTemplateReady(h.deps, "t1", { version: 1 });
    expect(
      refused.ok
        ? "ready"
        : [refused.reason, (refused.current as { id: string }[]).map((check) => check.id)],
    ).toEqual(["not-ready", ["samples", "dates"]]);
    expect(refused.ok ? "" : refused.message).toBe(
      "Version 1 can't be approved for schedules yet: {{Venue}}, {{Price}} have no sample value. Fill them in under Text → Sample values. The sample {{Date}} \"14 Nov\" isn't a date written YYYY-MM-DD (for example 2026-11-14). Write it that way under Text → Sample values.",
    );
    expect(getTemplate(h.db, "t1")?.checks.filter((check) => !check.ok)).toHaveLength(2);
    saveTemplate(h.deps, "t1", {
      baseVersion: 1,
      name: "Gig poster",
      document: poster({ schedule: { dateField: "Date", daysBefore: 7, time: "09:00" } }),
    });
    const extra = await markTemplateReady(h.deps, "t1", { version: 2 }, async () => [
      { id: "fonts", ok: false, sentence: "The font has no €.", fix: null },
    ]);
    expect(extra.ok ? "ready" : extra.message).toBe(
      "Version 2 can't be approved for schedules yet: The font has no €.",
    );
    const ready = await markTemplateReady(h.deps, "t1", { version: 2 });
    expect(ready.ok && [ready.value.gate, ready.value.readyVersion]).toEqual(["ready", 2]);
    expect((await markTemplateReady(h.deps, "t1", { version: 9 })).ok).toBe(false);
    expect((await markTemplateReady(h.deps, "t1", {})).ok).toBe(false);
  });

  it("reads only real dates written YYYY-MM-DD", () => {
    h = designHarness();
    expect(["2026-11-14", " 2028-02-29 "].map(validDate)).toEqual([true, true]);
    expect(["2026-02-30", "14/11/2026", "2026-1-4", ""].map(validDate)).toEqual([
      false,
      false,
      false,
      false,
    ]);
  });
});

describe("making a piece from a template", () => {
  it("quotes it, makes the design from the version with the values, and starts the artwork", async () => {
    const { runner, make } = setup();
    const quote = quoteTemplate(make, "t1");
    expect(quote.ok && quote.value.high).toBe(0.04);
    const made = makeFromTemplate(make, "t1", {
      mutationId: "make-000001",
      values,
      acknowledgedHigh: 0.04,
    });
    expect(made.ok).toBe(true);
    if (!made.ok) return;
    await runner.idle();
    const view = designView(h.db, made.value.id);
    expect([
      view?.name,
      view?.templateId,
      view?.templateVersion,
      view?.kind,
      view?.steps.map((step) => step.state),
    ]).toEqual(["Late Set", "t1", 1, "design", ["ready"]]);
    const again = makeFromTemplate(make, "t1", {
      mutationId: "make-000001",
      values,
      acknowledgedHigh: 0.04,
    });
    expect(again.ok && again.value.id).toBe(made.value.id);
  });

  it("names a missing value, a risen price and a missing template", () => {
    const { make } = setup();
    const reason = (input: object, id = "t1") => {
      const result = makeFromTemplate(make, id, {
        mutationId: "make-000002",
        values,
        acknowledgedHigh: 0.04,
        ...input,
      });
      return result.ok ? "made" : result.message;
    };
    expect(reason({ values: { ...values, Price: " " } })).toBe(
      "{{Price}} has no value. Fill it in under Keywords, then press Make.",
    );
    expect(reason({ acknowledgedHigh: 0.01 })).toBe(
      "The price changed since you looked: this poster now costs up to $0.04. Check the new price on the button and press it again.",
    );
    expect(reason({}, "gone")).toMatch(/^This design template no longer exists/);
    expect(reason({ version: 7 })).toMatch(/^That version of the template doesn't exist/);
    expect(reason({ mutationId: "x" })).toMatch(/^The poster can't be made: /);
    expect(h.db.prepare("SELECT count(*) AS n FROM designs").get()).toEqual({ n: 0 });
  });

  it("makes a piece from the template's own picture without a paid call", () => {
    h = designHarness();
    const sha = "b".repeat(64);
    h.db
      .prepare(
        "INSERT INTO image_blobs (sha256,mime,bytes,created_at) VALUES (?,'image/png',?,'a')",
      )
      .run(sha, pngOf(500, 700));
    let asked = 0;
    const runner = createDesignRunner({
      ...h.deps,
      catalogue: () => designCatalogue,
      generate: async () => {
        asked += 1;
        return { bytes: pngOf(1, 1), mime: "image/png" };
      },
    });
    createTemplate(h.deps, {
      id: "t1",
      mutationId: "mutation-0001",
      name: "Own",
      document: poster({ picture: { ...poster().picture, source: "picture", sha256: sha } }),
    });
    const made = makeFromTemplate(
      { service: h.deps, runner, catalogue: () => designCatalogue },
      "t1",
      { mutationId: "make-000003", values, acknowledgedHigh: 0 },
    );
    expect(made.ok && made.value.steps.map((step) => [step.kind, step.width])).toEqual([
      ["upload", 500],
    ]);
    expect(asked).toBe(0);
    createTemplate(h.deps, {
      id: "t2",
      mutationId: "mutation-0002",
      name: "None",
      document: poster({ picture: { ...poster().picture, source: "picture" } }),
    });
    const none = makeFromTemplate(
      { service: h.deps, runner, catalogue: () => designCatalogue },
      "t2",
      { mutationId: "make-000004", values, acknowledgedHigh: 0 },
    );
    expect(none.ok ? "made" : none.message).toMatch(
      /^This template uses its own picture, but none is saved/,
    );
  });
});
