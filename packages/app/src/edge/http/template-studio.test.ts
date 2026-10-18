import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { defaultLoudness } from "../../slices/loudness/model.js";
import { draftFixture } from "../../slices/play-drafts/draft.fake.js";
import { createTemplate } from "../../slices/project-templates/service.js";
import { createFreeSamples } from "../../slices/template-studio/free.js";
import { queuedJob } from "../../slices/template-studio/jobs.js";
import { studioChecksSchema, studioViewSchema } from "../../slices/template-studio/schema.js";
import { createPriceCache } from "../../slices/template-studio/service.js";
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
  });
  expect(reply.status).toBe(202);
  expect(await reply.json()).toEqual({ queued: true, version: 1 });
  expect(queuedJob(h.deps.db, h.id)).toMatchObject({ kind: "free", templateVersion: 1 });
  expect(woken).toBe(1);
  const gone = await h.app.request(`/api/template-studio/${randomUUID()}/free-samples`, {
    method: "POST",
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
