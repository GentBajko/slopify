import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { draftFixture } from "../play-drafts/draft.fake.js";
import { createTemplate } from "../project-templates/service.js";
import { sampleProjects } from "./repo.js";

const open: (() => void)[] = [];
afterEach(() => {
  for (const close of open.splice(0)) close();
});

it("names a template's sample project, and a project whose folder is already among the samples", () => {
  const h = draftFixture();
  open.push(h.close);
  const dataDir = mkdtempSync(join(tmpdir(), "slopify-samples-"));
  open.push(() => rmSync(dataDir, { recursive: true, force: true }));
  const id = randomUUID();
  const created = createTemplate(h.deps, { id, name: "Show", document: h.document });
  if (!created.ok) throw new Error(created.reason);
  h.deps.db
    .prepare(
      "INSERT INTO template_samples (template_id,project_id,topic,topic_source,full_script,created_at) VALUES (?,?,?,?,0,?)",
    )
    .run(id, "SAMPLEPROJECT", "Lighthouses", "fixed", "2026-10-18T00:00:00Z");
  mkdirSync(join(dataDir, "template-studio", "samples", "ORPHANED"), { recursive: true });

  const samples = sampleProjects(h.deps.db, dataDir);
  expect(samples.has("SAMPLEPROJECT")).toBe(true);
  expect(samples.has("ORPHANED")).toBe(true);
  expect(samples.has("SOMEOTHERPROJECT")).toBe(false);
  expect(samples.has("../..")).toBe(false);
});
