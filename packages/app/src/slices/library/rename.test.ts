import { randomUUID } from "node:crypto";
import { strFromU8, unzipSync } from "fflate";
import { afterEach, describe, expect, it } from "vitest";
import { draftFixture } from "../play-drafts/draft.fake.js";
import type { PlayDraftDocument } from "../play-drafts/schema.js";
import { templateById } from "../project-templates/repo.js";
import { createTemplate, updateTemplate } from "../project-templates/service.js";
import { templateSetup } from "../project-templates/setup.js";
import { exportPack } from "../template-studio/pack.js";
import { setSampleVersion, writeGate } from "../template-studio/repo.js";
import { runnableTemplate } from "../template-studio/schedule-gate.js";
import { paidStatuses } from "../template-studio/status.js";
import { createPrompt, updatePrompt } from "./save.js";

const open: (() => void)[] = [];
afterEach(() => {
  for (const close of open.splice(0)) close();
});

function install() {
  const h = draftFixture();
  open.push(h.close);
  return h;
}

// Versions differ only in the voice's preview line, which outdates no script sample.
function documentOf(h: ReturnType<typeof install>, previewText: string): PlayDraftDocument {
  return {
    ...h.document,
    previewText,
    form: { ...h.document.form, articlePrompt: "Storyteller" },
  };
}

// A gated template: version 2 is marked ready and is what its schedules run; version 3, the
// head, waits for Mark ready. Every version names the Library prompt "Storyteller".
function gatedTemplate(h: ReturnType<typeof install>) {
  const made = createPrompt(h.deps, { kind: "article", name: "Storyteller", body: "Old words." });
  if (!made.ok) throw new Error(made.reason);
  const id = randomUUID();
  const created = createTemplate(h.deps, { id, name: "Weekly", document: documentOf(h, "One") });
  if (!created.ok) throw new Error(created.reason);
  for (const [base, title] of [
    [1, "Two"],
    [2, "Three"],
  ] as const) {
    const saved = updateTemplate(h.deps, {
      id,
      baseVersion: base,
      mutationId: randomUUID(),
      name: "Weekly",
      document: documentOf(h, title),
    });
    if (!saved.ok) throw new Error(saved.reason);
  }
  writeGate(h.deps.db, id, { version: 2, state: "ready", carriedFrom: null });
  return { templateId: id, promptId: made.value.id };
}

describe("renaming a Library prompt a gated template names", () => {
  it("keeps the version a schedule runs, its pack and its samples on the renamed prompt", async () => {
    const h = install();
    const { templateId, promptId } = gatedTemplate(h);
    setSampleVersion(h.deps.db, templateId, 2, { state: "done", at: "2026-09-12T00:00:00.000Z" });

    const renamed = updatePrompt(h.deps, promptId, {
      kind: "article",
      name: "Narrator",
      body: "New words.",
    });
    expect(renamed.ok).toBe(true);

    // The schedule runs version 2, which reads the Library's prompt as it is now.
    const runs = runnableTemplate(h.deps.db, templateId);
    expect(runs?.version).toBe(2);
    expect(runs?.document.form.articlePrompt).toBe("Narrator");
    const setup = runs === undefined ? undefined : templateSetup(h.deps, runs.document);
    expect(setup?.ok).toBe(true);
    if (setup?.ok)
      expect(setup.value.librarySnapshot?.prompts).toMatchObject([
        { kind: "article", name: "Narrator", body: "New words." },
      ]);

    // Export pack carries version 2 with the prompt's current name and text.
    const pack = await exportPack({ ...h.deps, version: "4.0.0" }, templateId, () => []);
    if (!pack.ok) throw new Error(pack.message);
    const manifest = JSON.parse(
      strFromU8(unzipSync(pack.value.bytes)["manifest.json"] ?? new Uint8Array()),
    );
    expect(manifest.template.version).toBe(2);
    expect(manifest.template.document.form.articlePrompt).toBe("Narrator");
    expect(manifest.template.document.librarySnapshot.prompts).toMatchObject([
      { name: "Narrator", body: "New words." },
    ]);

    // The script sample made for version 2 isn't outdated by the rename.
    const head = templateById(h.deps.db, templateId);
    if (head === undefined) throw new Error("template gone");
    const statuses = paidStatuses({
      headVersion: head.version,
      headDocument: head.document,
      versions: [
        {
          templateVersion: 2,
          revisionId: null,
          state: "done",
          quotedHigh: null,
          heldReason: null,
          updatedAt: "2026-09-12T00:00:00.000Z",
        },
      ],
      documentOf: (version) => templateById(h.deps.db, templateId, version)?.document,
      running: false,
      busyElsewhere: false,
    });
    expect(statuses.script?.state).toBe("current");
  });

  it("renames a trashed template's versions too, so restoring it still finds the prompt", () => {
    const h = install();
    const { templateId, promptId } = gatedTemplate(h);
    h.deps.db
      .prepare("UPDATE project_templates SET deleted_at=? WHERE id=?")
      .run("2026-09-12T00:00:00.000Z", templateId);
    updatePrompt(h.deps, promptId, { kind: "article", name: "Narrator", body: "Old words." });
    const names = h.deps.db
      .prepare("SELECT document_json FROM project_template_revisions WHERE template_id=?")
      .all(templateId)
      .map((row) => JSON.parse(String(row.document_json)).form.articlePrompt);
    expect(names).toEqual(["Narrator", "Narrator", "Narrator"]);
  });
});
