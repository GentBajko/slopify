import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { narrationCatalogue, narrationFixture } from "../rebuild/runtime-narration.fake.js";
import { createRebuildDeps } from "../rebuild/service.fake.js";
import { previewRebuild, startRebuild } from "../rebuild/service.js";
import { insertVoice } from "../settings/repo.js";
import { addOutput, previewAddedOutput } from "./service.js";

const articleOnly = {
  sources: {
    research: "off",
    article: "provide",
    audio: "off",
    images: "off",
    thumbnail: "off",
    video: "off",
  },
} as const;

it("adds narration to an article project as a new revision that reuses the accepted article", async () => {
  const h = await narrationFixture("abcdefgh", { config: articleOnly });
  try {
    await h.pump();
    const before = h.view();
    const articleOutputs = before.outputs.filter((row) => row.selected).map((row) => row.assetId);
    const deps = {
      ...h.deps,
      catalogue: createRebuildDeps(h.deps, narrationCatalogue).deps.catalogue,
    };
    const shown = previewAddedOutput(deps, {
      projectId: h.projectId,
      baseRevisionId: before.revision.id,
      kind: "narration",
    });
    if (!shown.ok) throw new Error(JSON.stringify(shown));
    expect(shown.value.reused).toContain("Accepted article text");
    expect(shown.value.created).toContain("Narration of the text");
    expect(shown.value.problems).toEqual([]);
    // Only the narration is priced: the article is supplied, so no text request is.
    expect(shown.value.estimate.rows.find((row) => row.stage === "Article")?.high).toBe(0);

    const added = await addOutput(deps, {
      projectId: h.projectId,
      baseRevisionId: before.revision.id,
      kind: "narration",
      idempotencyKey: randomUUID(),
    });
    if (!added.ok) throw new Error(JSON.stringify(added));
    expect(added.view.revision.parentId).toBe(before.revision.id);
    expect(added.view.revision.config.sources.audio).toBe("generate");
    expect(added.workKeys.length).toBeGreaterThan(0);
    expect(added.workKeys.every((key) => !key.startsWith("article"))).toBe(true);
    // The accepted article's files are carried into the new revision unchanged.
    const kept = added.view.outputs.filter((row) => row.selected).map((row) => row.assetId);
    for (const asset of articleOutputs) expect(kept).toContain(asset);

    // The narration voice is one of Settings → Voices, as a real run checks before starting.
    insertVoice(h.deps.db, { id: "v1", provider: "openai-tts", name: "Voice", voiceId: "voice" });
    const helper = createRebuildDeps(h.deps, narrationCatalogue);
    const preview = await previewRebuild(helper.deps, {
      projectId: h.projectId,
      baseRevisionId: added.view.revision.id,
      request: { kind: "selected", workKeys: added.workKeys },
    });
    if (!preview.ok) throw new Error(JSON.stringify(preview));
    const made = preview.value.work.filter((row) => row.disposition !== "reuse");
    expect(made.length).toBeGreaterThan(0);
    expect(made.every((row) => row.stage === "audio" || row.stage === "video")).toBe(true);

    const calls = h.calls.length;
    const started = await startRebuild(helper.deps, {
      projectId: h.projectId,
      baseRevisionId: added.view.revision.id,
      idempotencyKey: randomUUID(),
      previewId: preview.value.id,
      acknowledgeUnknownCosts: true,
      confirmedProvidedWorkKeys: [],
    });
    expect(started).toMatchObject({ ok: true });
    await h.pump();
    const after = h.calls.slice(calls);
    // Only narration requests ran: nothing asked the text model to write the article again.
    expect(after.length).toBeGreaterThan(0);
    expect(after.every((call) => call.kind === "tts")).toBe(true);
    expect(h.view().outputs.some((row) => row.selected && row.output.role === "audio_body")).toBe(
      true,
    );
    for (const asset of articleOutputs)
      expect(h.view().outputs.some((row) => row.selected && row.assetId === asset)).toBe(true);
  } finally {
    h.close();
  }
});

it("refuses to add an output the project already makes, and a podcast over its narration", async () => {
  const h = await narrationFixture("abcdefgh");
  try {
    await h.pump();
    const base = h.view().revision.id;
    const deps = {
      ...h.deps,
      catalogue: createRebuildDeps(h.deps, narrationCatalogue).deps.catalogue,
    };
    const again = previewAddedOutput(deps, {
      projectId: h.projectId,
      baseRevisionId: base,
      kind: "narration",
    });
    expect(again).toMatchObject({ ok: false, reason: "already" });
    const podcast = await addOutput(deps, {
      projectId: h.projectId,
      baseRevisionId: base,
      kind: "podcast",
      idempotencyKey: randomUUID(),
    });
    expect(podcast).toMatchObject({ ok: false, reason: "narration-taken" });
    expect(h.view().revision.id).toBe(base);
  } finally {
    h.close();
  }
});

it("names the choices a new output still needs instead of saving a revision that cannot run", async () => {
  const h = await narrationFixture("abcdefgh", { config: { ...articleOnly, audio: undefined } });
  try {
    await h.pump();
    const base = h.view().revision.id;
    const deps = {
      ...h.deps,
      catalogue: createRebuildDeps(h.deps, narrationCatalogue).deps.catalogue,
    };
    const added = await addOutput(deps, {
      projectId: h.projectId,
      baseRevisionId: base,
      kind: "narration",
      idempotencyKey: randomUUID(),
    });
    expect(added).toMatchObject({ ok: false, reason: "invalid-edit" });
    if (added.ok) return;
    expect(added.fields?.[0]?.field).toBe("audio");
    expect(added.fields?.[0]?.message).toMatch(/Settings/);
    expect(h.view().revision.id).toBe(base);
  } finally {
    h.close();
  }
});

it("adds a podcast only when the adaptation is accepted, and names the second host's voice as missing", async () => {
  const h = await narrationFixture("abcdefgh", { config: articleOnly });
  try {
    await h.pump();
    const base = h.view().revision.id;
    const deps = {
      ...h.deps,
      catalogue: createRebuildDeps(h.deps, narrationCatalogue).deps.catalogue,
    };
    const shown = previewAddedOutput(deps, {
      projectId: h.projectId,
      baseRevisionId: base,
      kind: "podcast",
    });
    if (!shown.ok) throw new Error(JSON.stringify(shown));
    expect(shown.value.adapts).toBe(true);
    expect(shown.value.estimate.rows.map((row) => row.stage)).toContain("Conversation script");
    expect(shown.value.problems.length).toBeGreaterThan(0);
    const unaccepted = await addOutput(deps, {
      projectId: h.projectId,
      baseRevisionId: base,
      kind: "podcast",
      idempotencyKey: randomUUID(),
    });
    expect(unaccepted).toMatchObject({ ok: false, reason: "adaptation-not-accepted" });
    const accepted = await addOutput(deps, {
      projectId: h.projectId,
      baseRevisionId: base,
      kind: "podcast",
      idempotencyKey: randomUUID(),
      adapt: true,
    });
    expect(accepted).toMatchObject({ ok: false, reason: "invalid-edit" });
    expect(h.view().revision.id).toBe(base);
  } finally {
    h.close();
  }
});
