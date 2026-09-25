import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { saveRevision } from "../revisions/mutations.js";
import { outputPath } from "../storage/layout.js";
import { admitPendingRevision } from "./legacy-admission.fake.js";
import { narrationFixture, preparationCatalogue } from "./runtime-narration.fake.js";
import { executionPlan } from "./runtime-plan.js";

const audio = {
  provider: "inworld",
  model: "inworld-tts-2",
  voice: "voice",
  usePronunciationGlossary: true,
};
const article = (ipa: string, extra = "") =>
  `John reads.\n\nQuiet words.\n\n## Pronunciation Glossary\nJohn: /${ipa}/\n${extra}`;
const cues = '{"cues":[{"sentence":1,"kind":"instruction","text":"calm"}]}';

it.each([
  { prepared: false, used: false },
  { prepared: false, used: true },
  { prepared: true, used: false },
  { prepared: true, used: true },
])(
  "Save is inert and explicit admission reuses compatible work (%j)",
  async ({ prepared, used }) => {
    const h = await narrationFixture(article("dʒɑn"), {
      config: {
        audio,
        ...(prepared
          ? {
              narrationPrompt: "Delivery",
              llm: { provider: "openrouter", model: "llm" },
              rendered: { narration: "Restrained." },
            }
          : {}),
        subtitles: {
          mode: "files",
          language: "en",
          fontId: "default",
          fontSize: 48,
          position: "bottom",
        },
      },
      catalogue: preparationCatalogue,
      answer: () => cues,
    });
    try {
      await h.pump();
      const old = h.view();
      const before = executionPlan(h.deps, old, preparationCatalogue);
      const retained = old.outputs.filter(
        (row) => row.selected && row.output.stageKind === "audio",
      );
      expect(retained.length).toBeGreaterThan(0);
      const bytes = retained.map((row) => ({
        assetId: row.assetId,
        path: outputPath(h.deps.paths, h.projectId, row.output.path),
        value: readFileSync(outputPath(h.deps.paths, h.projectId, row.output.path)),
      }));
      const body = retained.find((row) => row.output.role === "audio_body");
      if (!body) throw new Error("Missing completed audio");
      h.calls.length = 0;
      const saved = await saveRevision(h.deps, {
        projectId: h.projectId,
        baseRevisionId: old.revision.id,
        idempotencyKey: "glossary-edit",
        edit: {
          config: old.revision.config,
          content: {
            ...old.revision.content,
            articleEdited: true,
            articleMarkdown: used ? article("dʒɒn") : article("dʒɑn", "Jane: /dʒeɪn/"),
          },
        },
      });
      if (!saved.ok) throw new Error(JSON.stringify(saved));
      expect(h.calls).toEqual([]);
      await h.pump();
      expect(h.calls).toEqual([]);
      for (const oldFile of bytes) {
        expect(readFileSync(oldFile.path)).toEqual(oldFile.value);
        expect(
          h.view().outputs.some((row) => row.assetId === oldFile.assetId && row.available),
        ).toBe(true);
      }
      const after = executionPlan(h.deps, h.view(), preparationCatalogue);
      for (const key of [
        "audio:body:concat",
        "narration:files:body",
        "export:wav",
        "subtitles:timing",
      ]) {
        const oldRecipe = before.recipes.find((row) => row.key === key);
        const newRecipe = after.recipes.find((row) => row.key === key);
        if (!oldRecipe || !newRecipe) throw new Error(`Missing ${key}`);
        if (used) expect(newRecipe.fingerprint).not.toBe(oldRecipe.fingerprint);
        else expect(newRecipe.fingerprint).toBe(oldRecipe.fingerprint);
      }
      expect(
        h.view().outputs.find((row) => row.selected && row.output.role === "audio_body")?.state,
      ).toBe(used ? "outdated" : "ready");
      const preparations = before.recipes.filter(
        (row) => row.input.kind === "llm" && row.input.preparation,
      );
      expect(preparations).toHaveLength(prepared ? 2 : 0);
      for (const preparation of preparations) {
        expect(after.recipes.find((row) => row.key === preparation.key)?.fingerprint).toBe(
          preparation.fingerprint,
        );
        expect(after.work.find((row) => row.key === preparation.key)?.disposition).toBe("reuse");
      }
      const oldQuiet = before.recipes.find(
        (row) => row.input.kind === "tts" && row.input.logicalText === "Quiet words.",
      );
      if (!oldQuiet) throw new Error("Missing unaffected request");
      expect(after.recipes.find((row) => row.key === oldQuiet.key)?.requestFingerprint).toBe(
        oldQuiet.requestFingerprint,
      );
      expect(after.work.find((row) => row.key === oldQuiet.key)?.disposition).toBe("reuse");
      admitPendingRevision(h.deps, h.view(), preparationCatalogue);
      await h.pump();
      expect(h.calls.filter((call) => call.kind === "llm")).toEqual([]);
      expect(h.calls.filter((call) => call.kind === "tts").map((call) => call.text)).toEqual(
        used ? [`${prepared ? "[calm] " : ""}/dʒɒn/ reads.`] : [],
      );
      const rebuilt = h
        .view()
        .outputs.find((row) => row.selected && row.output.role === "audio_body");
      expect(rebuilt?.state).toBe("ready");
      if (used) expect(rebuilt?.assetId).not.toBe(body.assetId);
      else expect(rebuilt?.assetId).toBe(body.assetId);
      for (const oldFile of bytes) expect(readFileSync(oldFile.path)).toEqual(oldFile.value);
    } finally {
      h.close();
    }
  },
  30_000,
);

it("keeps a supplied logical chunk usable even after the glossary becomes invalid", async () => {
  const h = await narrationFixture("John reads.\n\n## Pronunciation Glossary\nJohn: /dʒɑn/", {
    config: { audio },
    catalogue: preparationCatalogue,
  });
  try {
    await h.pump();
    const old = h.view();
    const chunk = old.pieces.find((row) => row.selected && row.piece.kind === "chunk");
    const request = executionPlan(h.deps, old, preparationCatalogue).recipes.find(
      (row) => row.input.kind === "tts",
    );
    if (!chunk?.assetId || request?.input.kind !== "tts") throw new Error("Missing reusable chunk");
    h.calls.length = 0;
    const saved = await saveRevision(h.deps, {
      projectId: h.projectId,
      baseRevisionId: old.revision.id,
      idempotencyKey: "provided-bypass",
      edit: {
        config: old.revision.config,
        content: {
          ...old.revision.content,
          articleMarkdown: "John reads.\n\n## Pronunciation Glossary\nUnused: not IPA",
          narrationOverrides: {
            [request.input.logicalKey]: { kind: "asset", assetId: chunk.assetId },
          },
        },
      },
    });
    if (!saved.ok) throw new Error(JSON.stringify(saved));
    expect(h.calls).toEqual([]);
    admitPendingRevision(h.deps, saved.view, preparationCatalogue);
    await h.pump();
    expect(h.calls).toEqual([]);
    const script = h.view().outputs.find((row) => row.selected && row.output.role === "tts_script");
    const clean = h
      .view()
      .outputs.find((row) => row.selected && row.output.role === "narration_txt");
    if (!script || !clean) throw new Error("Missing supplied-chunk text assets");
    expect(readFileSync(outputPath(h.deps.paths, h.projectId, script.output.path), "utf8")).toBe(
      "",
    );
    expect(readFileSync(outputPath(h.deps.paths, h.projectId, clean.output.path), "utf8")).toBe(
      "John reads.",
    );
  } finally {
    h.close();
  }
});
