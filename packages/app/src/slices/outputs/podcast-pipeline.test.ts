import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import type { RunConfig } from "../admission/model.js";
import { narrationCatalogue, narrationFixture } from "../rebuild/runtime-narration.fake.js";
import { createRebuildDeps } from "../rebuild/service.fake.js";
import { previewRebuild, startRebuild } from "../rebuild/service.js";
import { saveRevision } from "../revisions/mutations.js";
import { insertVoice } from "../settings/repo.js";
import { planAddedOutput } from "./add.js";

// The podcast added to an article project, through the real pipeline: the text model rewrites the
// article as a conversation once, the two hosts read it, and the article is never rewritten.
it("narrates a conversation adapted from the article while the article stays as written", async () => {
  const conversation =
    "# Tides\n\nAlex: The sea rises twice a day.\n\nSam: Because the moon pulls it.";
  const h = await narrationFixture("The sea rises twice a day because the moon pulls it.", {
    config: {
      sources: {
        research: "off",
        article: "provide",
        audio: "off",
        images: "off",
        thumbnail: "off",
        video: "off",
      },
      llm: { provider: "openrouter", model: "llm" },
    },
    answer: (key) => (key === "script:attribute" ? conversation : "unexpected"),
  });
  try {
    await h.pump();
    const before = h.view();
    const article = before.outputs.filter((row) => row.selected).map((row) => row.assetId);
    const planned = planAddedOutput(before.revision.config, "podcast");
    if (!planned.ok) throw new Error(planned.message);
    // The second host's voice, as the person picks it in Settings.
    const voice = { provider: "openai-tts", model: "tts", voice: "voice" };
    const config: RunConfig = {
      ...planned.plan.config,
      voices: planned.plan.config.voices && {
        ...planned.plan.config.voices,
        nativeDialogue: false,
        speakers: planned.plan.config.voices.speakers.map((speaker) => ({ ...speaker, voice })),
      },
    };
    const saved = await saveRevision(h.deps, {
      projectId: h.projectId,
      baseRevisionId: before.revision.id,
      idempotencyKey: randomUUID(),
      edit: { config, content: before.revision.content },
    });
    if (!saved.ok) throw new Error(JSON.stringify(saved));
    insertVoice(h.deps.db, { id: "v1", provider: "openai-tts", name: "Voice", voiceId: "voice" });
    const helper = createRebuildDeps(h.deps, narrationCatalogue);
    const preview = await previewRebuild(helper.deps, {
      projectId: h.projectId,
      baseRevisionId: saved.view.revision.id,
      request: { kind: "allAffected" },
    });
    if (!preview.ok) throw new Error(JSON.stringify(preview));
    expect(
      preview.value.work.some((row) => row.key === "article:body" && row.disposition !== "reuse"),
    ).toBe(false);
    const started = await startRebuild(helper.deps, {
      projectId: h.projectId,
      baseRevisionId: saved.view.revision.id,
      idempotencyKey: randomUUID(),
      previewId: preview.value.id,
      acknowledgeUnknownCosts: true,
      confirmedProvidedWorkKeys: preview.value.providedReuseRequired,
    });
    expect(started).toMatchObject({ ok: true });
    const calls = h.calls.length;
    await h.pump();
    const after = h.calls.slice(calls);
    const llm = after.filter((call) => call.kind === "llm");
    expect(llm.map((call) => call.key)).toEqual(["script:attribute"]);
    expect(llm[0]?.text).toMatch(/Turn the text you are given into this conversation/);
    const spoken = after
      .filter((call) => call.kind === "tts")
      .map((call) => call.text)
      .join(" ");
    // The conversation is what is spoken: Sam's own "Because …" line, not the article's prose.
    expect(spoken.replace(/\s+/g, "")).toContain("Becausethemoonpullsit");
    const now = h.view();
    for (const asset of article)
      expect(now.outputs.some((row) => row.selected && row.assetId === asset)).toBe(true);
    expect(now.outputs.some((row) => row.selected && row.output.role === "script_md")).toBe(true);
    expect(now.articleMarkdown).toBe("The sea rises twice a day because the moon pulls it.");
  } finally {
    h.close();
  }
});
