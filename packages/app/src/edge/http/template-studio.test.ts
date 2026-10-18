import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { unzipSync } from "fflate";
import { afterEach, expect, it } from "vitest";
import { dailySampleBudget } from "../../slices/designs/budget.js";
import { defaultLoudness } from "../../slices/loudness/model.js";
import { draftFixture } from "../../slices/play-drafts/draft.fake.js";
import { createTemplate } from "../../slices/project-templates/service.js";
import { createFreeSamples } from "../../slices/template-studio/free.js";
import { queuedJob } from "../../slices/template-studio/jobs.js";
import { writeGate } from "../../slices/template-studio/repo.js";
import {
  anatomyViewSchema,
  sampleQuoteSchema,
  studioChecksSchema,
  studioViewSchema,
} from "../../slices/template-studio/schema.js";
import { createPriceCache } from "../../slices/template-studio/service.js";
import { paidDocument, reviewOver } from "../../slices/template-studio/studio.fake.js";
import { mcpFixture } from "../mcp/mcp.fake.js";
import type { TemplateStudioService } from "./template-studio.js";

const open: { readonly close: () => void }[] = [];
afterEach(() => {
  for (const fixture of open.splice(0)) fixture.close();
});

const missing =
  "This template no longer exists; it may have been deleted. Go to Library → Templates to see your templates.";

function studio(service?: TemplateStudioService) {
  const h = mcpFixture(service === undefined ? {} : { templateStudio: service });
  open.push(h);
  const drafts = draftFixture();
  open.push(drafts);
  const id = randomUUID();
  const document = {
    ...drafts.document,
    form: {
      ...drafts.document.form,
      sources: { ...drafts.document.form.sources, document: "generate" as const },
    },
  };
  const created = createTemplate({ ...h.deps, uuid: randomUUID }, { id, name: "Show", document });
  if (!created.ok) throw new Error(created.reason);
  return { ...h, id };
}

it("answers a template's studio, and a plain 404 for one that doesn't exist", async () => {
  const h = studio();
  const reply = await h.app.request(`/api/template-studio/${h.id}`);
  expect(reply.status).toBe(200);
  const view = studioViewSchema.parse(await reply.json());
  expect(view.template.name).toBe("Show");
  expect(view.gate).toBe("unchecked");

  const gone = await h.app.request(`/api/template-studio/${randomUUID()}`);
  expect(gone.status).toBe(404);
  expect(await gone.json()).toMatchObject({ reason: "not-found", detail: missing });
  expect((await h.app.request("/api/template-studio/not-a-uuid")).status).toBe(400);
});

it("answers a template's checks on their own, and a 404 for one that doesn't exist", async () => {
  const h = studio();
  const reply = await h.app.request(`/api/template-studio/${h.id}/checks`);
  expect(reply.status).toBe(200);
  const body = studioChecksSchema.parse(await reply.json());
  expect(body.version).toBe(1);
  expect(body.checks.map((check) => check.id)).toContain("providers");
  const gone = await h.app.request(`/api/template-studio/${randomUUID()}/checks`);
  expect(gone.status).toBe(404);
  expect(await gone.json()).toMatchObject({ reason: "not-found", detail: missing });
});

it("prices a Save's sample without changing anything, and says why it can't when Play's review is missing", async () => {
  const h = mcpFixture({
    templateStudio: (deps) => ({
      free: createFreeSamples({ loudnessDefault: () => defaultLoudness }),
      prices: createPriceCache(),
      wake: () => undefined,
      review: reviewOver(deps),
    }),
  });
  open.push(h);
  const document = paidDocument(reviewOver(h.deps));
  const id = randomUUID();
  const created = createTemplate({ ...h.deps, uuid: randomUUID }, { id, name: "Show", document });
  if (!created.ok) throw new Error(created.reason);
  const reply = await h.app.request(`/api/template-studio/${id}/quote`, {
    method: "POST",
    headers: { "x-slopify-client": "test", "content-type": "application/json" },
    body: JSON.stringify({ document }),
  });
  expect(reply.status).toBe(200);
  const quote = sampleQuoteSchema.parse(await reply.json());
  expect(quote).toMatchObject({ version: 1, first: true, problem: null });
  expect(quote.high).toBeGreaterThan(0);
  expect(h.deps.db.prepare("SELECT count(*) AS n FROM template_samples").get()).toEqual({ n: 0 });
  const bad = await h.app.request(`/api/template-studio/${id}/quote`, {
    method: "POST",
    headers: { "x-slopify-client": "test", "content-type": "application/json" },
    body: JSON.stringify({ document: { nope: true } }),
  });
  expect(bad.status).toBe(400);

  const bare = studio();
  const refused = await bare.app.request(`/api/template-studio/${bare.id}/quote`, {
    method: "POST",
    headers: { "x-slopify-client": "test", "content-type": "application/json" },
    body: JSON.stringify({ document }),
  });
  expect(refused.status).toBe(503);
  expect(await refused.json()).toMatchObject({
    detail: expect.stringContaining("can't price or make paid samples"),
  });
});

function paidStudio(wake: () => void = () => undefined) {
  const h = mcpFixture({
    templateStudio: (deps) => ({
      free: createFreeSamples({ loudnessDefault: () => defaultLoudness }),
      prices: createPriceCache(),
      wake,
      review: reviewOver(deps),
    }),
  });
  open.push(h);
  const document = paidDocument(reviewOver(h.deps));
  const id = randomUUID();
  const created = createTemplate({ ...h.deps, uuid: randomUUID }, { id, name: "Show", document });
  if (!created.ok) throw new Error(created.reason);
  const post = (path: string, body: unknown) =>
    h.app.request(`/api/template-studio/${id}${path}`, {
      method: "POST",
      headers: { "x-slopify-client": "test", "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  return { ...h, id, document, post };
}

it("saves in the studio with the sample's price, refusing a higher one with the new quote", async () => {
  let woken = 0;
  const h = paidStudio(() => {
    woken += 1;
  });
  const changed = {
    ...h.document,
    form: { ...h.document.form, audio: { ...h.document.form.audio, voice: "other" } },
  };
  const quote = sampleQuoteSchema.parse(
    await (await h.post("/quote", { document: changed })).json(),
  );
  const save = (acknowledgedHigh: number, mutationId = randomUUID()) =>
    h.post("/save", {
      mutationId,
      baseVersion: 1,
      name: "Show",
      document: changed,
      sample: "make",
      acknowledgedHigh,
    });
  const higher = await save(0);
  expect(higher.status).toBe(409);
  const refusal = await higher.json();
  expect(refusal).toMatchObject({ reason: "cost-changed", quote: { high: quote.high } });
  expect(woken).toBe(0);
  const saved = await save(quote.high);
  expect(saved.status).toBe(200);
  expect(await saved.json()).toMatchObject({ sample: "queued", template: { version: 2 } });
  expect(queuedJob(h.deps.db, h.id)).toMatchObject({ kind: "save", templateVersion: 2 });
  expect(woken).toBe(1);
  const stale = await save(quote.high);
  expect(stale.status).toBe(409);
  expect(await stale.json()).toMatchObject({ reason: "conflict" });
});

it("asks for the current version's paid sample again at the price shown, and refuses an older version", async () => {
  let woken = 0;
  const h = paidStudio(() => {
    woken += 1;
  });
  const again = await h.post("/samples/make", { version: 1, acknowledgedHigh: 0.42 });
  expect(again.status).toBe(202);
  expect(await again.json()).toEqual({ queued: true, version: 1 });
  expect(queuedJob(h.deps.db, h.id)).toMatchObject({ kind: "save", ackHigh: 0.42 });
  expect(woken).toBe(1);
  const old = await h.post("/samples/make", { version: 7, acknowledgedHigh: 0.42 });
  expect(old.status).toBe(409);
  expect(await old.json()).toMatchObject({
    reason: "conflict",
    detail:
      "This template is now version 1, not the version 7 you saw. Reload the studio, then press Make sample.",
  });
  expect((await h.post("/samples/make", { version: 1 })).status).toBe(400);
});

it("cuts a section's prompt into who wrote each part, and refuses an unknown section", async () => {
  const h = paidStudio();
  const reply = await h.app.request(`/api/template-studio/${h.id}/anatomy?section=script`);
  expect(reply.status).toBe(200);
  const anatomy = anatomyViewSchema.parse(await reply.json());
  expect(anatomy.items).toEqual([{ key: "article", label: "Article prompt" }]);
  expect(anatomy.segments).toEqual([
    { origin: "yours", text: "Write a 1500-word documentary script about " },
    { origin: "keyword", name: "Topic", text: "The history of the lighthouse" },
    { origin: "yours", text: "." },
    {
      origin: "slopify",
      text: "\n\nThis is a short sample of the script: write the outline and only chapter 1, then stop.",
    },
  ]);
  expect(anatomy.fromSample).toBe(false);
  expect((await h.app.request(`/api/template-studio/${h.id}/anatomy?section=nowhere`)).status).toBe(
    400,
  );
});

it("prices and changes the sample topic and the full script, with the new quote on a refusal", async () => {
  const h = paidStudio();
  const topicQuote = sampleQuoteSchema.parse(
    await (await h.post("/quote", { topic: "Salt roads" })).json(),
  );
  expect(topicQuote.first).toBe(true);
  expect((await h.post("/quote", { topic: "next-queued" })).status).toBe(400);
  expect((await h.post("/quote", {})).status).toBe(400);
  const put = (body: unknown) =>
    h.app.request(`/api/template-studio/${h.id}/topic`, {
      method: "PUT",
      headers: { "x-slopify-client": "test", "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  const refused = await put({ topic: "Salt roads", acknowledgedHigh: 0 });
  expect(refused.status).toBe(409);
  expect(await refused.json()).toMatchObject({
    reason: "cost-changed",
    quote: { high: topicQuote.high },
  });
  const changed = await put({ topic: "Salt roads", acknowledgedHigh: topicQuote.high });
  expect(changed.status).toBe(200);
  expect(await changed.json()).toMatchObject({ topic: "Salt roads", topicSource: "fixed" });
  const fullQuote = sampleQuoteSchema.parse(
    await (await h.post("/quote", { fullScript: true })).json(),
  );
  const full = await h.post("/full-script", {
    fullScript: true,
    acknowledgedHigh: fullQuote.high,
  });
  expect(full.status).toBe(200);
  expect(await full.json()).toMatchObject({ fullScript: true, topic: "Salt roads" });
});

it("reads and sets the studio's daily budget, refusing one out of range", async () => {
  const h = studio();
  const read = await h.app.request("/api/template-studio/settings");
  expect(await read.json()).toEqual({
    dailyBudget: 2,
    samplesUsePlans: false,
    designDailyBudget: 1,
    today: { budget: 2, spent: 0, unpriced: 0, left: 2, plans: false },
    designToday: { budget: 1, spent: 0, left: 1 },
  });
  const put = (body: unknown) =>
    h.app.request("/api/template-studio/settings", {
      method: "PUT",
      headers: { "x-slopify-client": "test", "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  expect(await (await put({ dailyBudget: 0.5 })).json()).toMatchObject({ dailyBudget: 0.5 });
  expect(await (await put({ dailyBudget: 0, samplesUsePlans: true })).json()).toMatchObject({
    dailyBudget: 0,
    samplesUsePlans: true,
    today: { plans: true },
  });
  expect((await put({ dailyBudget: -1 })).status).toBe(400);
  expect((await put({ dailyBudget: 5000 })).status).toBe(400);
});

it("sets the designed pieces' daily sample budget on its own, keeping the studio's", async () => {
  const h = studio();
  const put = (body: unknown) =>
    h.app.request("/api/template-studio/settings", {
      method: "PUT",
      headers: { "x-slopify-client": "test", "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  expect(await (await put({ designDailyBudget: 3.456 })).json()).toMatchObject({
    dailyBudget: 2,
    designDailyBudget: 3.46,
    designToday: { budget: 3.46, spent: 0, left: 3.46 },
  });
  expect(dailySampleBudget(h.deps.db)).toBe(3.46);
  expect((await put({ designDailyBudget: -1 })).status).toBe(400);
  expect((await put({ designDailyBudget: 5000 })).status).toBe(400);
});

it("queues the free samples of the current version and wakes the sample loop", async () => {
  let woken = 0;
  const h = studio({
    free: createFreeSamples({ loudnessDefault: () => defaultLoudness }),
    prices: createPriceCache(),
    wake: () => {
      woken += 1;
    },
  });
  const reply = await h.app.request(`/api/template-studio/${h.id}/free-samples`, {
    method: "POST",
    headers: { "x-slopify-client": "test" },
  });
  expect(reply.status).toBe(202);
  expect(await reply.json()).toEqual({ queued: true, version: 1 });
  expect(queuedJob(h.deps.db, h.id)).toMatchObject({ kind: "free", templateVersion: 1 });
  expect(woken).toBe(1);
  const gone = await h.app.request(`/api/template-studio/${randomUUID()}/free-samples`, {
    method: "POST",
    headers: { "x-slopify-client": "test" },
  });
  expect(gone.status).toBe(404);
  expect(await gone.json()).toMatchObject({ detail: missing });
});

it("plays the loudness before and after, and says what to press while one isn't made", async () => {
  const dir = mkdtempSync(join(tmpdir(), "slopify-studio-media-"));
  open.push({ close: () => rmSync(dir, { recursive: true, force: true }) });
  const before = join(dir, "before.mp3");
  const after = join(dir, "after.mp3");
  writeFileSync(before, "ID3 before");
  writeFileSync(after, "ID3 after");
  const free = createFreeSamples({ loudnessDefault: () => defaultLoudness });
  let made = false;
  const h = studio({
    free,
    prices: createPriceCache(),
    wake: () => undefined,
    loudnessSource: before,
    loudnessFile: () => (made ? { path: after, bytes: 9 } : undefined),
  });
  const first = await h.app.request(`/api/template-studio/${h.id}/loudness/before.mp3`);
  expect(first.status).toBe(200);
  expect(first.headers.get("content-type")).toBe("audio/mpeg");
  expect(await first.text()).toBe("ID3 before");
  const notYet = await h.app.request(`/api/template-studio/${h.id}/loudness/after.mp3`);
  expect(notYet.status).toBe(404);
  expect(await notYet.json()).toMatchObject({
    detail:
      "This loudness sample isn't made yet. Open the template's studio and press Make samples.",
  });
  made = true;
  const levelled = await h.app.request(`/api/template-studio/${h.id}/loudness/after.mp3`);
  expect(await levelled.text()).toBe("ID3 after");
  expect((await h.app.request(`/api/template-studio/${h.id}/loudness/other.mp3`)).status).toBe(400);
});

it("serves the PDF sample once it is made", async () => {
  const dir = mkdtempSync(join(tmpdir(), "slopify-studio-pdf-"));
  open.push({ close: () => rmSync(dir, { recursive: true, force: true }) });
  const pdf = join(dir, "sample.pdf");
  writeFileSync(pdf, "%PDF-1.7");
  let made = false;
  const h = studio({
    free: createFreeSamples({ loudnessDefault: () => defaultLoudness }),
    prices: createPriceCache(),
    wake: () => undefined,
    documentFile: () => (made ? { path: pdf, bytes: 8 } : undefined),
  });
  const notYet = await h.app.request(`/api/template-studio/${h.id}/document.pdf`);
  expect(notYet.status).toBe(404);
  made = true;
  const reply = await h.app.request(`/api/template-studio/${h.id}/document.pdf`);
  expect(reply.headers.get("content-type")).toBe("application/pdf");
  expect(await reply.text()).toBe("%PDF-1.7");
});

it("refuses Mark ready with each thing to fix, and only for the newest version", async () => {
  const h = studio();
  const refused = await h.app.request(`/api/template-studio/${h.id}/ready`, {
    method: "POST",
    headers: { "x-slopify-client": "test", "content-type": "application/json" },
    body: JSON.stringify({ version: 1 }),
  });
  expect(refused.status).toBe(409);
  const body = (await refused.json()) as {
    reason: string;
    detail: string;
    problems: { label: string }[];
  };
  expect(body.reason).toBe("not-ready");
  expect(body.detail).toMatch(/^Version 1 can't be marked ready yet\. /u);
  expect(body.problems.length).toBeGreaterThan(0);

  const older = await h.app.request(`/api/template-studio/${h.id}/ready`, {
    method: "POST",
    headers: { "x-slopify-client": "test", "content-type": "application/json" },
    body: JSON.stringify({ version: 4 }),
  });
  expect(older.status).toBe(409);
  expect(await older.json()).toMatchObject({ reason: "conflict" });

  const bad = await h.app.request(`/api/template-studio/${h.id}/ready`, {
    method: "POST",
    headers: { "x-slopify-client": "test", "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  expect(bad.status).toBe(400);
});

it("answers Mark ready again for a version already ready", async () => {
  const h = studio();
  h.deps.db
    .prepare("INSERT INTO template_gates (template_id,version,state) VALUES (?,1,'ready')")
    .run(h.id);
  const reply = await h.app.request(`/api/template-studio/${h.id}/ready`, {
    method: "POST",
    headers: { "x-slopify-client": "test", "content-type": "application/json" },
    body: JSON.stringify({ version: 1 }),
  });
  expect(reply.status).toBe(200);
  expect(await reply.json()).toEqual({ version: 1, gate: "ready", replayed: true });
});

it("prices the samples of every template, and queues them at the total shown", async () => {
  let woken = 0;
  const h = paidStudio(() => {
    woken += 1;
  });
  const post = (path: string, body?: unknown) =>
    h.app.request(`/api/template-studio${path}`, {
      method: "POST",
      headers: { "x-slopify-client": "test", "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  const reply = await post("/samples-for-all/quote");
  expect(reply.status).toBe(200);
  const quote = (await reply.json()) as { total: number; items: { templateId: string }[] };
  expect(quote.items.map((item) => item.templateId)).toEqual([h.id]);
  const higher = await post("/samples-for-all", { acknowledgedTotal: 0 });
  expect(higher.status).toBe(409);
  expect(await higher.json()).toMatchObject({
    reason: "cost-changed",
    quote: { total: quote.total },
  });
  expect(queuedJob(h.deps.db, h.id)).toBeUndefined();
  const made = await post("/samples-for-all", { acknowledgedTotal: quote.total });
  expect(made.status).toBe(202);
  expect(await made.json()).toMatchObject({ queued: [h.id], held: [] });
  expect(queuedJob(h.deps.db, h.id)).toMatchObject({ kind: "save" });
  expect(woken).toBe(1);
  expect((await post("/samples-for-all", { acknowledgedTotal: -1 })).status).toBe(400);
});

it("lists the names to check, prices a Say it as, and refuses one that would change nothing", async () => {
  const h = paidStudio();
  const names = await h.app.request(`/api/template-studio/${h.id}/pronunciations`);
  expect(names.status).toBe(200);
  expect(await names.json()).toMatchObject({
    names: [],
    problem:
      "The names to check come from the sample's script. Press Save or Make sample to make one.",
  });
  expect((await h.app.request(`/api/template-studio/${randomUUID()}/pronunciations`)).status).toBe(
    404,
  );
  const quote = await h.post("/say-it-as/quote", { written: "Kish", spoken: "Keesh" });
  expect(quote.status).toBe(200);
  expect(await quote.json()).toMatchObject({ lines: 0, high: 0 });
  // The paid fixture's voice doesn't use Library → Narration aliases.
  const refused = await h.post("/say-it-as", {
    written: "Kish",
    spoken: "Keesh",
    acknowledgedHigh: 0,
  });
  expect(refused.status).toBe(400);
  expect(await refused.json()).toMatchObject({
    detail: expect.stringContaining("Turn on Use narration aliases in Voice → Fine-tune"),
  });
  expect(
    (await h.post("/say-it-as", { written: "", spoken: "x", acknowledgedHigh: 0 })).status,
  ).toBe(400);
});

it("exports the ready version as a pack and imports it as a new, unchecked template", async () => {
  const h = paidStudio();
  const notReady = await h.app.request(`/api/template-studio/${h.id}/pack`);
  expect(notReady.status).toBe(409);
  expect(await notReady.json()).toMatchObject({
    reason: "not-ready",
    detail: expect.stringContaining("Press Mark ready in the studio, then Export pack."),
  });
  writeGate(h.deps.db, h.id, { version: 1, state: "ready", carriedFrom: null });
  const pack = await h.app.request(`/api/template-studio/${h.id}/pack`);
  expect(pack.status).toBe(200);
  expect(pack.headers.get("content-type")).toBe("application/zip");
  expect(pack.headers.get("content-disposition")).toBe(
    'attachment; filename="show.slopify-pack.zip"',
  );
  const bytes = new Uint8Array(await pack.arrayBuffer());
  expect(Object.keys(unzipSync(bytes))).toEqual(["manifest.json"]);

  const form = new FormData();
  form.append("file", new File([bytes], "show.slopify-pack.zip", { type: "application/zip" }));
  const imported = await h.app.request("/api/template-studio/packs/import", {
    method: "POST",
    headers: { "x-slopify-client": "test" },
    body: form,
  });
  expect(imported.status).toBe(201);
  const body = (await imported.json()) as { templateId: string; name: string };
  expect(body.name).toBe("Show (2)");
  const studioOf = await h.app.request(`/api/template-studio/${body.templateId}`);
  expect(studioViewSchema.parse(await studioOf.json()).gate).toBe("unchecked");
  const samples = await h.app.request(`/api/template-studio/${body.templateId}/pack-samples`);
  expect(await samples.json()).toEqual({ samples: [] });
  const none = await h.app.request(
    `/api/template-studio/${body.templateId}/pack-samples/thumbnail-1.png`,
  );
  expect(none.status).toBe(404);
});

it("refuses an import that isn't a pack, and one with no file, saying what to choose", async () => {
  const h = paidStudio();
  const form = new FormData();
  form.append("file", new File([new TextEncoder().encode("hello")], "notes.txt"));
  const refused = await h.app.request("/api/template-studio/packs/import", {
    method: "POST",
    headers: { "x-slopify-client": "test" },
    body: form,
  });
  expect(refused.status).toBe(400);
  expect(await refused.json()).toMatchObject({
    reason: "invalid-input",
    detail: expect.stringContaining("Choose the .zip that Export pack"),
  });
  const empty = await h.app.request("/api/template-studio/packs/import", {
    method: "POST",
    headers: { "x-slopify-client": "test" },
    body: new FormData(),
  });
  expect(empty.status).toBe(400);
  expect(await empty.json()).toMatchObject({
    detail: "No pack arrived with the upload. Choose the pack's .zip file again.",
  });
  expect(h.deps.db.prepare("SELECT count(*) AS n FROM project_templates").get()).toEqual({ n: 1 });
});

it("answers no bake-off, refuses one before the template has a sample, and discards nothing", async () => {
  const h = paidStudio();
  const none = await h.app.request(`/api/template-studio/${h.id}/bakeoff`);
  expect(await none.json()).toEqual({ bakeoff: null });
  const quote = await h.post("/bakeoff/quote", {
    section: "script",
    models: [{ provider: "openrouter", model: "another" }],
  });
  expect(quote.status).toBe(409);
  expect(await quote.json()).toMatchObject({
    reason: "not-ready",
    detail: expect.stringContaining("Press Save (or Make sample) in the studio"),
  });
  const start = await h.post("/bakeoff", {
    section: "script",
    models: [{ provider: "openrouter", model: "another" }],
    acknowledgedHigh: 1,
  });
  expect(start.status).toBe(409);
  const bad = await h.post("/bakeoff/quote", { section: "shorts", models: [] });
  expect(bad.status).toBe(400);
  const discard = await h.app.request(`/api/template-studio/${h.id}/bakeoff`, {
    method: "DELETE",
    headers: { "x-slopify-client": "test" },
  });
  expect(await discard.json()).toEqual({ removed: 0 });
  const gone = await h.app.request(`/api/template-studio/${randomUUID()}/bakeoff`);
  expect(gone.status).toBe(404);
});
