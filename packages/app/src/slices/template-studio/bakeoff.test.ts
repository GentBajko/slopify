import { randomUUID } from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { attachSamples } from "../../kernel/paths.js";
import { listProjects, projectExists } from "../admission/repo.js";
import { draftFixture } from "../play-drafts/draft.fake.js";
import type { PlayDraftDocument } from "../play-drafts/model.js";
import { templateById } from "../project-templates/repo.js";
import { createTemplate, updateTemplate } from "../project-templates/service.js";
import { currentRevisionId } from "../revisions/repo.js";
import { getRevisionView } from "../revisions/view.js";
import { projectDir } from "../storage/layout.js";
import { bakeoffView, discardBakeoff, quoteBakeoff, startBakeoff, withModel } from "./bakeoff.js";
import { makeBakeoff } from "./bakeoff-make.js";
import { bakeoffOf, clonesOf } from "./bakeoff-repo.js";
import { spentToday, writeStudioSettings } from "./budget.js";
import { enqueueJob, queuedJob, type SampleJob } from "./jobs.js";
import { makePaidSample } from "./paid.js";
import { isTemplateSample, sampleOf, sampleProjects } from "./repo.js";
import { paidDocument, paidSampleDeps } from "./studio.fake.js";

const open: (() => void)[] = [];
afterEach(() => {
  for (const close of open.splice(0)) close();
});

const signal = new AbortController().signal;

async function harness(options: { readonly fail?: string } = {}) {
  const h = draftFixture();
  open.push(h.close);
  attachSamples(h.deps.paths, sampleProjects(h.deps.db, h.deps.paths.dataDir));
  const { review, paid, ticks } = paidSampleDeps(h.deps, options);
  const document = paidDocument(review);
  const id = randomUUID();
  const created = createTemplate(h.deps, { id, name: "Show", document });
  if (!created.ok) throw new Error(created.reason);
  const other =
    review.catalogue
      .read()
      .llm.find(
        (row) => row.provider === "openrouter" && row.enabled && row.id !== document.form.llm.model,
      )?.id ?? "";
  // The priciest text model, whose sample costs more than the five cents a sample may go over.
  const pricey =
    review.catalogue
      .read()
      .llm.filter(
        (row) =>
          row.provider === "openrouter" &&
          row.enabled &&
          !row.deprecated &&
          row.id !== document.form.llm.model,
      )
      .toSorted(
        (a, b) => (b.pricing.outputPerMillionTokens ?? 0) - (a.pricing.outputPerMillionTokens ?? 0),
      )[0]?.id ?? "";
  const deps = { db: h.deps.db, clock: h.deps.clock, review, paths: h.deps.paths, log: h.deps.log };
  const sample = async () => {
    await makePaidSample(
      paid,
      {
        templateId: id,
        templateVersion: 1,
        ackHigh: 5,
        kind: "save",
        requestedAt: "2026-09-12T00:00:00.000Z",
      },
      signal,
    );
  };
  const job = (): SampleJob => ({
    templateId: id,
    templateVersion: 1,
    ackHigh: 5,
    kind: "bakeoff",
    requestedAt: "2026-09-12T00:00:01.000Z",
  });
  return { h, deps, paid, ticks, review, document, id, other, pricey, sample, job };
}

const scriptOn = (model: string) => ({
  section: "script" as const,
  models: [{ provider: "openrouter", model }],
});

describe("quoteBakeoff", () => {
  it("refuses to compare before the template's version has a current sample", async () => {
    const { deps, id, other } = await harness();
    expect(await quoteBakeoff(deps, id, scriptOn(other))).toMatchObject({
      ok: false,
      reason: "not-ready",
      message:
        "Compare models runs on the template's current sample, and version 1 has none yet. Press Save (or Make sample) in the studio, wait for it, then compare.",
    });
  });

  it("refuses the model in use now, one picked twice, and a voice model of another provider", async () => {
    const { deps, id, other, document, sample } = await harness();
    await sample();
    expect(await quoteBakeoff(deps, id, scriptOn(document.form.llm.model))).toMatchObject({
      ok: false,
      reason: "invalid-input",
      message: expect.stringContaining("is the model Script uses now"),
    });
    expect(
      await quoteBakeoff(deps, id, {
        section: "script",
        models: [
          { provider: "openrouter", model: other },
          { provider: "openrouter", model: other },
        ],
      }),
    ).toMatchObject({ ok: false, message: `${other} is picked twice. Pick each model once.` });
    expect(
      await quoteBakeoff(deps, id, {
        section: "voice",
        models: [{ provider: "openai-tts", model: "tts-1" }],
      }),
    ).toMatchObject({
      ok: false,
      message: expect.stringContaining(
        "voice models are compared within the template's voice provider",
      ),
    });
    expect(
      await quoteBakeoff(deps, id, {
        section: "pictures",
        models: [{ provider: "fal", model: "x" }],
      }),
    ).toMatchObject({
      ok: false,
      message: expect.stringContaining("No model makes Pictures in this template"),
    });
  });

  it("prices only the section's work on each other model, against today's budget", async () => {
    const { deps, id, other, sample } = await harness();
    await sample();
    const quote = await quoteBakeoff(deps, id, scriptOn(other));
    if (!quote.ok) throw new Error(quote.message);
    expect(quote.value).toMatchObject({
      version: 1,
      section: "script",
      current: { provider: "openrouter" },
      models: [{ provider: "openrouter", model: other, problem: null }],
      problem: null,
      fits: true,
    });
    expect(quote.value.high).toBeGreaterThan(0);
    expect(quote.value.high).toBe(quote.value.models[0]?.high);
  });
});

describe("startBakeoff", () => {
  it("queues the bake-off at the price shown, refusing a higher one or one past the budget with the new quote", async () => {
    const { deps, id, other, pricey, sample } = await harness();
    await sample();
    const uuid = { ...deps, uuid: randomUUID };
    const higher = await startBakeoff(uuid, id, { ...scriptOn(pricey), acknowledgedHigh: 0 });
    expect(higher).toMatchObject({
      ok: false,
      reason: "cost-changed",
      quote: { section: "script" },
    });
    expect(bakeoffOf(deps.db, id)).toBeUndefined();
    writeStudioSettings(deps.db, { dailyBudget: 0 });
    const broke = await startBakeoff(uuid, id, { ...scriptOn(other), acknowledgedHigh: 5 });
    expect(broke).toMatchObject({
      ok: false,
      reason: "over-budget",
      message: expect.stringContaining("Raise the budget in Settings → Template studio"),
    });
    expect(queuedJob(deps.db, id)).toBeUndefined();
    writeStudioSettings(deps.db, { dailyBudget: 2 });
    const started = await startBakeoff(uuid, id, { ...scriptOn(other), acknowledgedHigh: 5 });
    if (!started.ok) throw new Error(started.message);
    expect(queuedJob(deps.db, id)).toMatchObject({ kind: "bakeoff", templateVersion: 1 });
    expect(bakeoffOf(deps.db, id)).toMatchObject({ state: "queued", section: "script" });
    expect(await startBakeoff(uuid, id, { ...scriptOn(other), acknowledgedHigh: 5 })).toMatchObject(
      {
        ok: false,
        reason: "conflict",
      },
    );
  });

  it("holds the bake-off to the price the person saw, not to the new one", async () => {
    const { deps, id, other, sample } = await harness();
    await sample();
    const quoted = await quoteBakeoff(deps, id, scriptOn(other));
    if (!quoted.ok) throw new Error(quoted.message);
    const seen = quoted.value.high / 1.2;
    const started = await startBakeoff({ ...deps, uuid: randomUUID }, id, {
      ...scriptOn(other),
      acknowledgedHigh: seen,
      acknowledgedUnknown: true,
    });
    if (!started.ok) throw new Error(started.message);
    expect(bakeoffOf(deps.db, id)?.ackHigh).toBeCloseTo(seen, 6);
    expect(queuedJob(deps.db, id)?.ackHigh).toBeCloseTo(seen, 6);
  });

  it("is dropped, saying so, when a newer Save takes its place before it starts", async () => {
    const { deps, id, other, sample } = await harness();
    await sample();
    const started = await startBakeoff({ ...deps, uuid: randomUUID }, id, {
      ...scriptOn(other),
      acknowledgedHigh: 5,
    });
    expect(started.ok).toBe(true);
    // The free samples the page asks for never push it out.
    enqueueJob(deps.db, {
      templateId: id,
      templateVersion: 1,
      ackHigh: 0,
      kind: "free",
      requestedAt: "2026-09-12T00:01:00.000Z",
    });
    expect(queuedJob(deps.db, id)?.kind).toBe("bakeoff");
    enqueueJob(deps.db, {
      templateId: id,
      templateVersion: 2,
      ackHigh: 1,
      kind: "save",
      requestedAt: "2026-09-12T00:02:00.000Z",
    });
    expect(queuedJob(deps.db, id)?.kind).toBe("save");
    expect(bakeoffOf(deps.db, id)).toMatchObject({
      state: "failed",
      sentence: expect.stringContaining("A newer Save took its place before it started"),
    });
  });
});

describe("makeBakeoff", () => {
  it("makes a hidden copy per model and starts only the section's work, leaving the template as it was", async () => {
    const { h, deps, paid, id, other, sample, job } = await harness();
    await sample();
    const original = sampleOf(deps.db, id)?.projectId ?? "";
    const started = await startBakeoff({ ...deps, uuid: randomUUID }, id, {
      ...scriptOn(other),
      acknowledgedHigh: 5,
      acknowledgedUnknown: true,
    });
    if (!started.ok) throw new Error(started.message);
    await makeBakeoff(paid, job(), signal);
    const row = bakeoffOf(deps.db, id);
    expect(row).toMatchObject({ state: "done", sentence: null });
    const [clone] = clonesOf(deps.db, row?.id ?? "");
    expect(clone).toMatchObject({ slot: 0, provider: "openrouter", model: other, state: "done" });
    const copy = clone?.projectId ?? "";
    expect(projectExists(deps.db, copy)).toBe(true);
    // Hidden like the sample: in no list, its folder in the data dir.
    expect(isTemplateSample(deps.db, copy)).toBe(true);
    expect(listProjects(deps.db).map((one) => one.id)).not.toContain(copy);
    expect(projectDir(h.deps.paths, copy).startsWith(h.deps.paths.projects)).toBe(false);
    expect(readdirSync(h.deps.paths.projects)).toEqual([]);
    // The copy runs the other model; the template and its own sample don't.
    const view = getRevisionView(paid.rebuild, copy, currentRevisionId(deps.db, copy) ?? "");
    expect(view?.revision.config.llm?.model).toBe(other);
    expect(templateById(deps.db, id)?.version).toBe(1);
    expect(templateById(deps.db, id)?.document.form.llm.model).not.toBe(other);
    expect(sampleOf(deps.db, id)?.projectId).toBe(original);
    // Only Script's work was admitted on the copy.
    const admitted = deps.db
      .prepare(
        "SELECT DISTINCT kind AS stage FROM revision_work WHERE project_id=? AND revision_id=? AND dispatch_state='allowed'",
      )
      .all(copy, currentRevisionId(deps.db, copy) ?? "")
      .map((one) => one.stage);
    expect(admitted).toEqual(["article"]);
    const shown = bakeoffView(deps, id);
    expect(shown?.entries.map((one) => [one.state, one.model])).toEqual([
      ["current", templateById(deps.db, id)?.document.form.llm.model],
      ["done", other],
    ]);
    expect(shown?.entries[1]?.seconds).not.toBeNull();
    expect(shown?.stale).toBe(false);
  });

  it("waits, spending nothing and removing its copies, when it now costs more than the person saw", async () => {
    const { deps, paid, id, pricey, sample, job, ticks } = await harness();
    await sample();
    const started = await startBakeoff({ ...deps, uuid: randomUUID }, id, {
      ...scriptOn(pricey),
      acknowledgedHigh: 50,
      acknowledgedUnknown: true,
    });
    if (!started.ok) throw new Error(started.message);
    deps.db.prepare("UPDATE template_bakeoffs SET ack_high=0").run();
    deps.db.prepare("UPDATE template_bakeoff_clones SET quoted_high=0").run();
    const before = ticks.length;
    await makeBakeoff(paid, job(), signal);
    expect(bakeoffOf(deps.db, id)).toMatchObject({
      state: "held",
      sentence: expect.stringMatching(
        /^Waiting: comparing now costs about \$\d+\.\d\d, more than the \$0\.00 you saw\./,
      ),
    });
    expect(ticks.length).toBe(before);
    expect(clonesOf(deps.db, bakeoffOf(deps.db, id)?.id ?? "")).toMatchObject([
      { state: "queued", projectId: null },
    ]);
    expect(listProjects(deps.db)).toEqual([]);
    // Only the sample itself is left: the copy was removed.
    expect(deps.db.prepare("SELECT count(*) AS n FROM projects").get()).toEqual({ n: 1 });
  });

  it("keeps a copy it couldn't remove while waiting hidden and failed, never a visible project", async () => {
    const { deps, paid, id, pricey, sample, job } = await harness();
    await sample();
    const started = await startBakeoff({ ...deps, uuid: randomUUID }, id, {
      ...scriptOn(pricey),
      acknowledgedHigh: 50,
      acknowledgedUnknown: true,
    });
    if (!started.ok) throw new Error(started.message);
    deps.db.prepare("UPDATE template_bakeoffs SET ack_high=0").run();
    deps.db.prepare("UPDATE template_bakeoff_clones SET quoted_high=0").run();
    const sampleId = sampleOf(deps.db, id)?.projectId;
    // The copy is busy, so it cannot be removed now.
    const busy = {
      ...paid,
      rebuild: { ...paid.rebuild, hasInflight: (one: string) => one !== sampleId },
    };
    await makeBakeoff(busy, job(), signal);
    const [copy] = clonesOf(deps.db, bakeoffOf(deps.db, id)?.id ?? "");
    expect(copy).toMatchObject({
      state: "failed",
      failure: expect.stringContaining("couldn't be removed"),
    });
    expect(copy?.projectId).not.toBeNull();
    expect(isTemplateSample(deps.db, copy?.projectId ?? "")).toBe(true);
    expect(listProjects(deps.db)).toEqual([]);
  });

  it("waits on today's budget, spending nothing", async () => {
    const { deps, paid, id, other, sample, job, ticks } = await harness();
    await sample();
    const started = await startBakeoff({ ...deps, uuid: randomUUID }, id, {
      ...scriptOn(other),
      acknowledgedHigh: 5,
      acknowledgedUnknown: true,
    });
    if (!started.ok) throw new Error(started.message);
    writeStudioSettings(deps.db, { dailyBudget: 0 });
    const before = ticks.length;
    await makeBakeoff(paid, job(), signal);
    expect(bakeoffOf(deps.db, id)).toMatchObject({
      state: "held",
      sentence: expect.stringContaining("of today's $0.00 sample budget is left"),
    });
    expect(ticks.length).toBe(before);
  });

  it("fails, spending nothing, when the template was saved again since it was priced", async () => {
    const { h, deps, paid, id, other, sample, job, document } = await harness();
    await sample();
    const started = await startBakeoff({ ...deps, uuid: randomUUID }, id, {
      ...scriptOn(other),
      acknowledgedHigh: 5,
    });
    if (!started.ok) throw new Error(started.message);
    const saved = updateTemplate(h.deps, {
      id,
      baseVersion: 1,
      mutationId: randomUUID(),
      name: "Show",
      document: { ...document, form: { ...document.form, title: "New: {{Topic}}" } },
    });
    expect(saved.ok).toBe(true);
    await makeBakeoff(paid, job(), signal);
    expect(bakeoffOf(deps.db, id)).toMatchObject({
      state: "failed",
      sentence: expect.stringContaining("saved again since the bake-off was priced"),
    });
    expect(clonesOf(deps.db, bakeoffOf(deps.db, id)?.id ?? "")[0]?.projectId).toBeNull();
  });

  it.each([
    ["The model refused the prompt.", "The model refused the prompt."],
    [
      "Fix the key, then use Try again on Images. Or Try again later.",
      "Fix the key, then press Compare again. Or press Compare again later.",
    ],
    [
      "The AI model didn't answer. Use Try again; if it keeps happening, choose another model in the Providers section of Edit project.",
      "The AI model didn't answer. Press Compare again; if it keeps happening, choose another model with Change on that section's “Made with …” line.",
    ],
  ])("says each model's own failure (%s), naming Compare again", async (reason, said) => {
    const { deps, paid, id, other, sample, job } = await harness();
    await sample();
    const started = await startBakeoff({ ...deps, uuid: randomUUID }, id, {
      ...scriptOn(other),
      acknowledgedHigh: 5,
      acknowledgedUnknown: true,
    });
    if (!started.ok) throw new Error(started.message);
    // From here on the provider refuses every step the runner is ticked for.
    const runner = {
      ...paid.start.runner,
      tick: (projectId: string) => {
        deps.db
          .prepare(
            "UPDATE revision_work SET state='failed' WHERE project_id=? AND state IN ('pending','running')",
          )
          .run(projectId);
        deps.db
          .prepare(
            "UPDATE stages SET state=CASE WHEN state IN ('pending','running') THEN 'failed' ELSE state END, failure_reason=? WHERE project_id=?",
          )
          .run(reason, projectId);
      },
    };
    await makeBakeoff(
      { ...paid, start: { ...paid.start, runner }, rebuild: { ...paid.rebuild, runner } },
      job(),
      signal,
    );
    const row = bakeoffOf(deps.db, id);
    expect(row).toMatchObject({
      state: "failed",
      sentence: expect.stringContaining("each one says why"),
    });
    expect(clonesOf(deps.db, row?.id ?? "")[0]).toMatchObject({
      state: "failed",
      failure: said,
    });
  });
});

describe("discardBakeoff", () => {
  it("removes every copy with its files, and today's spend still counts", async () => {
    const { deps, paid, id, other, sample, job } = await harness();
    await sample();
    const started = await startBakeoff({ ...deps, uuid: randomUUID }, id, {
      ...scriptOn(other),
      acknowledgedHigh: 5,
      acknowledgedUnknown: true,
    });
    if (!started.ok) throw new Error(started.message);
    await makeBakeoff(paid, job(), signal);
    const copy = clonesOf(deps.db, bakeoffOf(deps.db, id)?.id ?? "")[0]?.projectId ?? "";
    const folder = projectDir(deps.paths, copy);
    deps.db
      .prepare(
        "INSERT INTO provider_usage (id,project_id,stage,kind,provider,model,wall_ms,on_plan,cost,created_at) VALUES ('u-copy',?,'article','llm','openrouter','m',10,0,0.3,?)",
      )
      .run(copy, deps.clock.now().toISOString());
    const spent = spentToday(deps.db, deps.clock.now(), "UTC");
    expect(discardBakeoff(deps, id)).toEqual({ ok: true, value: { removed: 1 } });
    expect(projectExists(deps.db, copy)).toBe(false);
    expect(existsSync(folder)).toBe(false);
    expect(bakeoffOf(deps.db, id)).toBeUndefined();
    expect(spentToday(deps.db, deps.clock.now(), "UTC")).toBeCloseTo(spent);
    expect(discardBakeoff(deps, id)).toEqual({ ok: true, value: { removed: 0 } });
  });

  it("refuses while the bake-off is still being made", async () => {
    const { deps, id, other, sample } = await harness();
    await sample();
    const started = await startBakeoff({ ...deps, uuid: randomUUID }, id, {
      ...scriptOn(other),
      acknowledgedHigh: 5,
    });
    if (!started.ok) throw new Error(started.message);
    deps.db.prepare("UPDATE template_bakeoffs SET state='making'").run();
    expect(discardBakeoff(deps, id)).toMatchObject({
      ok: false,
      reason: "conflict",
      message: expect.stringContaining("Discard it once it finishes"),
    });
  });
});

describe("withModel", () => {
  it("switches only the section's model", async () => {
    const { review, document } = await harness();
    const catalogue = review.catalogue.read();
    const next: PlayDraftDocument = withModel(
      document,
      "voice",
      { provider: "elevenlabs", model: "eleven_v3" },
      catalogue,
    );
    expect(next.form.audio).toEqual({ ...document.form.audio, model: "eleven_v3" });
    expect(next.form.llm).toEqual(document.form.llm);
    const pictures = withModel(document, "pictures", { provider: "fal", model: "flux" }, catalogue);
    expect(pictures.form.images).toMatchObject({ provider: "fal", model: "flux" });
  });
});
