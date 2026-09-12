import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { parseCatalogue } from "../../catalog/store.js";
import { ensureBaseline } from "../revisions/adopt.js";
import { saveRevision } from "../revisions/mutations.js";
import { revisionFixture } from "../revisions/revision.fake.js";
import { planPreview } from "./preview-plan.js";

it("identifies the original narration chunk and changed voice in a selected rebuild", async () => {
  const h = revisionFixture();
  try {
    const catalogue = parseCatalogue(
      readFileSync(new URL("../../assets/models.yaml", import.meta.url), "utf8"),
    );
    const config = {
      ...h.config,
      sources: { ...h.config.sources, audio: "generate" as const },
      audio: { provider: "inworld", model: "inworld-tts-2", voice: "previous-voice" },
      chunking: { mode: "paragraph" as const },
      provided: { article: "First paragraph.\n\nSecond paragraph." },
    };
    h.deps.db
      .prepare("UPDATE projects SET config=? WHERE id=?")
      .run(JSON.stringify(config), h.projectId);
    const baseline = await ensureBaseline(h.deps, h.projectId);
    if (!baseline.ok) throw new Error(JSON.stringify(baseline));
    const saved = await saveRevision(h.deps, {
      projectId: h.projectId,
      baseRevisionId: baseline.view.revision.id,
      idempotencyKey: "voice-change",
      edit: {
        config: { ...config, audio: { ...config.audio, voice: "new-voice" } },
        content: baseline.view.revision.content,
      },
    });
    if (!saved.ok) throw new Error(JSON.stringify(saved));
    const full = planPreview(h.deps, saved.view, catalogue, { kind: "allAffected" }, "full");
    if (!full.ok) throw new Error(JSON.stringify(full));
    const second = full.value.execution.recipes.find(
      (row) => row.input.kind === "tts" && row.input.text === "Second paragraph.",
    );
    if (second === undefined) throw new Error("Second narration request missing");
    const selected = planPreview(
      h.deps,
      saved.view,
      catalogue,
      { kind: "selected", workKeys: [second.key] },
      "selected",
    );
    if (!selected.ok) throw new Error(JSON.stringify(selected));
    expect(selected.value.preview.review?.inputChanges).toContainEqual({
      label: "Narration voice",
      before: "previous-voice",
      after: "new-voice",
    });
    expect(selected.value.preview.review?.requests).toContainEqual({
      key: second.key,
      label: "Body narration chunk 2 · request 1",
      text: "Second paragraph.",
      settings: "inworld · inworld-tts-2 · new-voice",
    });
    expect(h.deps.db.prepare("SELECT count(*) AS n FROM rebuild_admissions").get()?.n).toBe(0);
    expect(h.deps.db.prepare("SELECT count(*) AS n FROM attempts").get()?.n).toBe(0);
  } finally {
    h.close();
  }
});
