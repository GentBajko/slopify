import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import type { Catalogue } from "../../catalog/schema.js";
import type { RevisionDeps, RevisionView } from "../revisions/model.js";
import { saveRevision } from "../revisions/mutations.js";
import { outputPath } from "../storage/layout.js";
import { revisionTranscript } from "./runtime-export-inputs.js";
import { narrationFixture, preparationCatalogue } from "./runtime-narration.fake.js";
import { executionPlan } from "./runtime-plan.js";
import { createRebuildDeps } from "./service.fake.js";
import { previewRebuild, startRebuild } from "./service.js";

const audio = { provider: "inworld", model: "inworld-tts-2", voice: "voice" };
const subtitles = {
  mode: "files" as const,
  language: "en" as const,
  fontId: "default",
  fontSize: 48,
  position: "bottom" as const,
};

it("rebinds clean metadata for an unchanged request when IPA is enabled", async () => {
  const catalogue = {
    ...preparationCatalogue,
    tts: preparationCatalogue.tts.map((row) => ({
      ...row,
      tts: { ...row.tts, maxCharacters: 16 },
    })),
  };
  const h = await narrationFixture(
    "Ordinary words. John reads.\n\n## Pronunciation Glossary\nJohn: /dʒɑn/",
    { config: { audio, subtitles }, catalogue },
  );
  try {
    await h.pump();
    const old = h.view();
    const first = old.pieces.find(
      (row) => row.selected && row.piece.kind === "chunk" && row.piece.idx === 1,
    );
    if (!first?.assetId) throw new Error("Missing initial narration");
    h.calls.length = 0;
    const saved = await saveRevision(h.deps, {
      projectId: h.projectId,
      baseRevisionId: old.revision.id,
      idempotencyKey: "enable-glossary",
      edit: {
        config: { ...old.revision.config, audio: { ...audio, usePronunciationGlossary: true } },
        content: old.revision.content,
      },
    });
    if (!saved.ok) throw new Error(JSON.stringify(saved));
    await admit(h.deps, saved.view, catalogue);
    await h.pump();
    const view = h.view();
    const plan = executionPlan(h.deps, view, catalogue);
    expect(revisionTranscript(h.deps, { view, plan }, "body")).toBe("Ordinary words. John reads.");
    expect(h.calls.filter((call) => call.kind === "tts").map((call) => call.text)).toEqual([
      "/dʒɑn/ reads.",
    ]);
    const rebound = view.pieces.find((row) => row.selected && row.key === first.key);
    expect(rebound?.assetId).toBe(first.assetId);
    expect(JSON.parse(rebound?.piece.payload ?? "{}").spokenText).toBe("Ordinary words. ");
    expect(JSON.parse(first.piece.payload ?? "{}").spokenText).toBeUndefined();
  } finally {
    h.close();
  }
});

it.each(["body", "intro", "outro"] as const)(
  "refreshes %s text and captions while respecting whole-entry identity",
  async (segment) => {
    const h = await narrationFixture(
      "John reads.\n\n## Pronunciation Glossary\nJohn: /dʒɑn/\nJon: /dʒɑn/",
      {
        config: {
          audio: { ...audio, usePronunciationGlossary: true },
          subtitles,
          ...(segment === "body"
            ? {}
            : {
                [segment]: { name: segment, mode: "text" },
                rendered: { [segment]: "John reads." },
              }),
        },
        catalogue: preparationCatalogue,
      },
    );
    try {
      await h.pump();
      const old = h.view();
      const before = executionPlan(h.deps, old, preparationCatalogue);
      const request = before.recipes.find(
        (row) => row.input.kind === "tts" && row.input.segment === segment,
      );
      if (request?.input.kind !== "tts") throw new Error("Missing initial request");
      const oldPiece = old.pieces.find((row) => row.selected && row.key === request.key);
      const retained = old.outputs.filter(
        (row) => row.selected && row.output.role === "audio_body",
      );
      const bytes = retained.map((row) => ({
        assetId: row.assetId,
        path: outputPath(h.deps.paths, h.projectId, row.output.path),
        bytes: readFileSync(outputPath(h.deps.paths, h.projectId, row.output.path)),
      }));
      h.calls.length = 0;
      const saved = await saveRevision(h.deps, {
        projectId: h.projectId,
        baseRevisionId: old.revision.id,
        idempotencyKey: "correct-spelling",
        edit: {
          config: old.revision.config,
          content: {
            ...old.revision.content,
            narrationOverrides: {
              [request.input.logicalKey]: { kind: "text", text: "Jon reads." },
            },
          },
        },
      });
      if (!saved.ok) throw new Error(JSON.stringify(saved));
      const after = executionPlan(h.deps, saved.view, preparationCatalogue);
      if (segment === "body") {
        expect(after.recipes.find((row) => row.key === request.key)?.requestFingerprint).toBe(
          request.requestFingerprint,
        );
        expect(after.work.find((row) => row.key === request.key)?.disposition).toBe("reuse");
      }
      for (const key of ["subtitles:timing", "subtitles:cues", "subtitles:files"])
        expect(after.recipes.find((row) => row.key === key)?.fingerprint).not.toBe(
          before.recipes.find((row) => row.key === key)?.fingerprint,
        );
      expect(after.recipes.find((row) => row.key === "audio:body:concat")?.fingerprint).toBe(
        before.recipes.find((row) => row.key === "audio:body:concat")?.fingerprint,
      );
      await admit(h.deps, saved.view, preparationCatalogue);
      await h.pump();
      expect(h.calls.map((call) => call.text)).toEqual(segment === "body" ? [] : ["/dʒɑn/ reads."]);
      const view = h.view();
      const plan = executionPlan(h.deps, view, preparationCatalogue);
      expect(revisionTranscript(h.deps, { view, plan }, segment)).toBe("Jon reads.");
      if (segment === "body")
        expect(view.pieces.find((row) => row.selected && row.key === request.key)?.assetId).toBe(
          oldPiece?.assetId,
        );
      expect(JSON.parse(oldPiece?.piece.payload ?? "{}").spokenText).toBe("John reads.");
      for (const [role, text] of [
        ["narration_txt", "Jon reads."],
        ["tts_script", "/dʒɑn/ reads."],
      ]) {
        const output = view.outputs.find(
          (row) => row.selected && row.output.role === role && row.output.meta.segment === segment,
        );
        if (!output) throw new Error(`Missing ${role}`);
        expect(
          readFileSync(outputPath(h.deps.paths, h.projectId, output.output.path), "utf8"),
        ).toBe(text);
      }
      for (const retained of bytes) {
        expect(readFileSync(retained.path)).toEqual(retained.bytes);
        expect(view.outputs.some((row) => row.selected && row.assetId === retained.assetId)).toBe(
          true,
        );
      }
    } finally {
      h.close();
    }
  },
);

async function admit(deps: RevisionDeps, view: RevisionView, catalogue: Catalogue): Promise<void> {
  deps.db
    .prepare("INSERT OR IGNORE INTO voices(id,provider,name,voice_id) VALUES (?,?,?,?)")
    .run("saved-voice", "inworld", "Saved voice", "voice");
  const helper = createRebuildDeps(deps, catalogue);
  const preview = await previewRebuild(helper.deps, {
    projectId: view.revision.projectId,
    baseRevisionId: view.revision.id,
    request: { kind: "allAffected" },
  });
  if (!preview.ok) throw new Error(JSON.stringify(preview));
  const admitted = await startRebuild(helper.deps, {
    projectId: view.revision.projectId,
    baseRevisionId: view.revision.id,
    previewId: preview.value.id,
    idempotencyKey: randomUUID(),
    acknowledgeUnknownCosts: true,
    confirmedProvidedWorkKeys: preview.value.providedReuseRequired,
  });
  if (!admitted.ok) throw new Error(JSON.stringify(admitted));
}
