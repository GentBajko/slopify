import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import type { CheckFont } from "./check-text.js";
import { designHarness, type Harness } from "./designs.fake.js";
import { poster } from "./document.fake.js";
import { type CheckContext, contextChecks, runnableDesignVersion, sampleCheck } from "./gate.js";
import { writeSample } from "./sample-repo.js";
import { createTemplate, markTemplateReady, saveTemplate } from "./templates.js";

const barlow: CheckFont = {
  name: "Barlow Regular",
  bytes: new Uint8Array(
    readFileSync(new URL("../../assets/fonts/Barlow-Regular.ttf", import.meta.url)),
  ),
  faceIndex: 0,
};
const ready: CheckContext = {
  font: async () => barlow,
  providerProblem: async () => null,
};
const byId = (checks: readonly { id: string; ok: boolean; sentence: string }[], id: string) =>
  checks.find((check) => check.id === id);

let h: Harness;
afterEach(() => h?.cleanup());

describe("the version a schedule makes", () => {
  it("is the newest version marked ready, never a newer unchecked one", async () => {
    h = designHarness();
    createTemplate(h.deps, { id: "t1", mutationId: "mutation-1", name: "Gig", document: poster() });
    expect(runnableDesignVersion(h.db, "t1")).toBeUndefined();
    expect((await markTemplateReady(h.deps, "t1", { version: 1 })).ok).toBe(true);
    saveTemplate(h.deps, "t1", {
      baseVersion: 1,
      name: "Gig",
      document: poster({ text: { ...poster().text, preset: "centered" } }),
    });
    const runnable = runnableDesignVersion(h.db, "t1");
    expect(runnable?.version).toBe(1);
    expect(runnable?.document.text.preset).toBe("bottom-band");
    expect((await markTemplateReady(h.deps, "t1", { version: 2 })).ok).toBe(true);
    expect(runnableDesignVersion(h.db, "t1")?.version).toBe(2);
  });

  it("is none for a template in the trash or one that doesn't exist", async () => {
    h = designHarness();
    createTemplate(h.deps, { id: "t1", mutationId: "mutation-1", name: "Gig", document: poster() });
    await markTemplateReady(h.deps, "t1", { version: 1 });
    h.db.exec("UPDATE design_templates SET deleted_at='2026-10-18T10:00:00.000Z'");
    expect(runnableDesignVersion(h.db, "t1")).toBeUndefined();
    expect(runnableDesignVersion(h.db, "nope")).toBeUndefined();
  });
});

describe("the checks that read this computer", () => {
  it("pass for a poster whose fonts, provider and formats are fine", async () => {
    h = designHarness();
    const checks = await contextChecks(
      poster({
        formats: [
          { format: "a4", focus: { x: 0.5, y: 0.5 } },
          { format: "story", focus: { x: 0.5, y: 0.5 } },
        ],
      }),
      "t1",
      ready,
    );
    expect(checks.map((check) => [check.id, check.ok])).toEqual([
      ["provider", true],
      ["fonts", true],
      ["formats", true],
    ]);
  });

  it("fail with the provider's own sentence and a link to Providers", async () => {
    h = designHarness();
    const checks = await contextChecks(poster(), "t1", {
      ...ready,
      providerProblem: async () => "fal.ai has no API key. Add one in Settings → Providers.",
    });
    expect(byId(checks, "provider")).toMatchObject({
      ok: false,
      sentence: "fal.ai has no API key. Add one in Settings → Providers.",
      fix: { label: "Open Providers", href: "/settings?section=providers" },
    });
  });

  it("fail for a template that keeps its own picture but has none saved", async () => {
    h = designHarness();
    const own = poster({ picture: { ...poster().picture, source: "picture" } });
    expect(byId(await contextChecks(own, "t1", ready), "provider")?.ok).toBe(false);
  });

  it("name the letters a font lacks and a font no longer here", async () => {
    h = designHarness();
    const checks = await contextChecks(
      poster({ samples: { ...poster().samples, Venue: "東京" } }),
      "t1",
      ready,
    );
    expect(byId(checks, "fonts")?.sentence).toBe(
      "The font Barlow Regular has no “東” “京” for the sample of text block 2. Choose another font for it under Text layout, or upload one that has them.",
    );
    const gone = await contextChecks(poster(), "t1", { ...ready, font: async () => undefined });
    expect(byId(gone, "fonts")?.sentence).toBe(
      "The font chosen for text block 1 is no longer on this computer. Choose another font for it under Text layout.",
    );
  });

  it("say which formats the sample text doesn't fit on", async () => {
    h = designHarness();
    const checks = await contextChecks(
      poster({
        formats: [
          { format: "a4", focus: { x: 0.5, y: 0.5 } },
          { format: "wide", focus: { x: 0.5, y: 0.5 } },
        ],
        samples: { ...poster().samples, Venue: "word ".repeat(900).trim() },
      }),
      "t1",
      ready,
    );
    expect(byId(checks, "formats")).toMatchObject({ ok: false });
    expect(byId(checks, "formats")?.sentence).toContain("Poster A4, Wide 16:9");
  });

  it("check the schedule's date field is one the template uses", async () => {
    h = designHarness();
    const schedule = { dateField: "When", daysBefore: 7, time: "09:00" };
    const checks = await contextChecks(poster({ schedule }), "t1", ready);
    expect(byId(checks, "date-field")).toMatchObject({ ok: false });
    const fine = await contextChecks(
      poster({ schedule: { ...schedule, dateField: "Date" } }),
      "t1",
      ready,
    );
    expect(byId(fine, "date-field")?.ok).toBe(true);
  });

  it("skip fonts and formats when the AI draws the text", async () => {
    h = designHarness();
    const checks = await contextChecks(
      poster({ picture: { ...poster().picture, aiText: true } }),
      "t1",
      { ...ready, font: async () => undefined },
    );
    expect(checks.map((check) => check.id)).toEqual(["provider"]);
  });
});

describe("the sample Mark ready asks for", () => {
  it("passes only when the version's own sample is made, like a project template's studio", async () => {
    h = designHarness();
    createTemplate(h.deps, { id: "t1", mutationId: "mutation-1", name: "Gig", document: poster() });
    expect(sampleCheck(h.db, "t1", 1)).toEqual({
      id: "sample",
      ok: false,
      sentence:
        "Version 1 has no sample yet. Make its sample, look it over beside the settings, then press Mark ready.",
      fix: { label: "Open Picture", href: "/library/design-templates/t1#picture" },
    });
    const row = {
      templateId: "t1",
      designId: null,
      version: 1,
      state: "held" as const,
      heldReason: "Waiting.",
      quotedHigh: 0.04,
      updatedAt: "2026-10-18T09:00:00.000Z",
    };
    writeSample(h.db, row);
    expect(sampleCheck(h.db, "t1", 1).ok).toBe(false);
    writeSample(h.db, { ...row, state: "done", heldReason: null });
    expect(sampleCheck(h.db, "t1", 1)).toMatchObject({ ok: true });
    expect(sampleCheck(h.db, "t1", 2)).toMatchObject({
      ok: false,
      sentence:
        "Version 2 has no sample yet: the one shown is of version 1. Make its sample, look it over beside the settings, then press Mark ready.",
    });
  });
});
