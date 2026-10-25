import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { insertProject } from "../admission/repo.js";
import { draftFixture } from "../play-drafts/draft.fake.js";
import { createTemplate } from "../project-templates/service.js";
import { writeStudioSettings } from "./budget.js";
import { fieldSentence, quoteSave } from "./quote.js";
import { paidDocument, reviewOver } from "./studio.fake.js";

const open: (() => void)[] = [];
afterEach(() => {
  for (const close of open.splice(0)) close();
});

function harness() {
  const h = draftFixture();
  open.push(h.close);
  const review = reviewOver(h.deps);
  const document = paidDocument(review);
  const id = randomUUID();
  const created = createTemplate(h.deps, { id, name: "Show", document });
  if (!created.ok) throw new Error(created.reason);
  const deps = { db: h.deps.db, clock: h.deps.clock, review, timeZone: "UTC" };
  return { h, deps, id, document };
}

function giveSample(h: ReturnType<typeof harness>["h"], templateId: string): void {
  insertProject(h.deps.db, {
    id: "SAMPLE",
    title: "Sample",
    format: "16:9",
    config: {
      title: "Sample",
      format: "16:9",
      sources: {
        research: "off",
        article: "off",
        audio: "off",
        images: "off",
        thumbnail: "off",
        video: "off",
      },
      imagePrompts: [],
      values: {},
      provided: {},
      silenceGapSeconds: 0,
      imageSeconds: 15,
      zoomPercent: 22.5,
      motionStyle: "zoom",
      edgeSilenceSeconds: 0,
      rendered: {},
    },
    createdAt: "2026-09-12T00:00:00Z",
    updatedAt: "2026-09-12T00:00:00Z",
  });
  h.deps.db
    .prepare(
      "INSERT INTO template_samples (template_id,project_id,topic,topic_source,full_script,created_at) VALUES (?,'SAMPLE','Lighthouses','fixed',0,'2026-09-12T00:00:00Z')",
    )
    .run(templateId);
}

describe("quoteSave", () => {
  it("prices a template's first sample as the whole short run, within today's budget", async () => {
    const { deps, id, document } = harness();
    const quote = await quoteSave(deps, id, document);
    if (!quote.ok) throw new Error(quote.message);
    expect(quote.value.first).toBe(true);
    expect(quote.value.problem, quote.value.problem ?? "").toBeNull();
    expect(quote.value.rows.map((row) => row.stage)).toEqual(
      expect.arrayContaining(["Article", "Narration"]),
    );
    expect(quote.value.high).toBeGreaterThan(0);
    expect(quote.value.budget).toEqual({ budget: 2, spent: 0, unpriced: 0, left: 2, plans: false });
    expect(quote.value.fits).toBe(quote.value.high <= 2);
  });

  it("prices only the sections a change outdates once a sample exists", async () => {
    const { h, deps, id, document } = harness();
    giveSample(h, id);
    const unchanged = await quoteSave(deps, id, document);
    if (!unchanged.ok) throw new Error(unchanged.message);
    expect(unchanged.value.first).toBe(false);
    expect(unchanged.value.sections).toEqual([]);
    expect(unchanged.value.high).toBe(0);
    const voiced = await quoteSave(deps, id, {
      ...document,
      form: { ...document.form, audio: { ...document.form.audio, voice: "other" } },
    });
    if (!voiced.ok) throw new Error(voiced.message);
    expect(voiced.value.sections).toEqual(["voice", "video", "shorts", "reviews", "upload"]);
    expect(voiced.value.rows.map((row) => row.stage)).not.toContain("Article");
    expect(voiced.value.rows.map((row) => row.stage)).toContain("Narration");
  });

  it("prices a post prompt as the Posts line when a site's text turns to one", async () => {
    const { h, deps, id, document } = harness();
    giveSample(h, id);
    const prompted = await quoteSave(deps, id, {
      ...document,
      form: {
        ...document.form,
        social: { x: { text: "prompt", media: {}, hashtags: 2, link: false } },
      },
    });
    if (!prompted.ok) throw new Error(prompted.message);
    expect(prompted.value.sections).toContain("upload");
    const posts = prompted.value.rows.find((row) => row.stage === "Posts");
    expect(posts?.high ?? 0).toBeGreaterThan(0);
    expect(posts?.onPlan).toBeFalsy();
    expect(prompted.value.high).toBeGreaterThan(0);
    // A free text source costs nothing.
    const free = await quoteSave(deps, id, {
      ...document,
      form: {
        ...document.form,
        social: { x: { text: "summary", media: {}, hashtags: 2, link: false } },
      },
    });
    if (!free.ok) throw new Error(free.message);
    expect(free.value.rows.map((row) => row.stage)).not.toContain("Posts");
  });

  it("shows a post prompt on a CLI model as plan usage", async () => {
    const { h, deps: base, id, document } = harness();
    giveSample(h, id);
    const deps = {
      ...base,
      review: {
        ...base.review,
        modelsFor: async (provider: string, family: Parameters<typeof base.review.modelsFor>[1]) =>
          provider === "claude-code"
            ? [{ id: "sonnet", name: "Sonnet" }]
            : base.review.modelsFor(provider as never, family),
      },
    };
    const quote = await quoteSave(deps, id, {
      ...document,
      form: {
        ...document.form,
        llm: { provider: "claude-code", model: "sonnet" },
        social: { linkedin: { text: "prompt", media: {}, hashtags: 3, link: false } },
      },
    });
    if (!quote.ok) throw new Error(quote.message);
    expect(quote.value.problem, quote.value.problem ?? "").toBeNull();
    const posts = quote.value.rows.find((row) => row.stage === "Posts");
    expect(posts?.onPlan).toBe(true);
    expect(posts?.high).toBe(0);
    expect(quote.value.usesPlan).toBe(true);
  });

  it("says it doesn't fit when today's budget is spent", async () => {
    const { h, deps, id, document } = harness();
    writeStudioSettings(h.deps.db, { dailyBudget: 0 });
    const quote = await quoteSave(deps, id, document);
    expect(quote.ok && quote.value.fits).toBe(false);
  });

  it("says why no sample can be made when Create's review refuses the setup", async () => {
    const { deps, id, document } = harness();
    const quote = await quoteSave(deps, id, {
      ...document,
      form: { ...document.form, llm: { provider: "openrouter", model: "gone/model" } },
    });
    if (!quote.ok) throw new Error(quote.message);
    expect(quote.value.problem).toContain("No sample can be made of this setup");
    expect(quote.value.problem).toContain("Choose another model.");
    expect(quote.value.fits).toBe(false);
  });

  it("refuses a template that doesn't exist, saying where to look", async () => {
    const { deps, document } = harness();
    expect(await quoteSave(deps, randomUUID(), document)).toMatchObject({
      ok: false,
      reason: "not-found",
    });
  });
});

describe("fieldSentence", () => {
  it("names an empty keyword and where it is filled, and keeps every other message", () => {
    expect(fieldSentence({ field: "values.topic", message: "Fill in this field." })).toBe(
      "The keyword {{topic}} is empty. Fill it in Title and keywords.",
    );
    expect(
      fieldSentence({ field: "audio.voice", message: "Choose a voice for the narration." }),
    ).toBe("Choose a voice for the narration.");
  });
});
