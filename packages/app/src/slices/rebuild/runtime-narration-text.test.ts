import { readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { plainText } from "../article/plain.js";
import { saveRevision } from "../revisions/mutations.js";
import { getRevisionView } from "../revisions/view.js";
import { assetOf } from "../storage/asset-name.js";
import { outputPath } from "../storage/layout.js";
import { admitPendingRevision } from "./legacy-admission.fake.js";
import { revisionTranscript } from "./runtime-export-inputs.js";
import { narrationFixture, preparationCatalogue } from "./runtime-narration.fake.js";
import { joinedNarration, narrationTextParts } from "./runtime-narration-text.js";
import { executionPlan } from "./runtime-plan.js";

const config = {
  narrationPrompt: "Delivery",
  llm: { provider: "openrouter", model: "llm" },
  audio: { provider: "inworld", model: "inworld-tts-2", voice: "voice" },
  rendered: { narration: "Restrained." },
};
const cues = '{"cues":[{"sentence":1,"kind":"instruction","text":"calm"}]}';

it("joins physical slices without inserting spaces inside a word", () => {
  expect(
    joinedNarration([
      { logicalKey: "a", spokenText: "Docu", requestText: "[calm] Docu" },
      {
        logicalKey: "a",
        spokenText: "mentary [literal].",
        requestText: "[calm] mentary [literal].",
      },
      { logicalKey: "b", spokenText: "An upload's transcript.", requestText: null },
    ]),
  ).toBe("Documentary [literal].\nAn upload's transcript.");
});

it("publishes separate clean and exact request scripts for all three segments", async () => {
  const markdown = "**Documentary** [literal] words.\n\nSecond paragraph.";
  const h = await narrationFixture(markdown, {
    config: {
      ...config,
      intro: { name: "Intro", mode: "text" },
      outro: { name: "Outro", mode: "text" },
      rendered: { ...config.rendered, intro: "Welcome.", outro: "Goodbye." },
    },
    catalogue: preparationCatalogue,
    answer: () => cues,
  });
  try {
    await h.pump();
    const view = h.view();
    const plan = executionPlan(h.deps, view, preparationCatalogue);
    expect(view.articleMarkdown).toBe(markdown);
    const files = view.outputs.filter(
      (row) => row.selected && ["narration_txt", "tts_script"].includes(row.output.role),
    );
    expect(files).toHaveLength(6);
    expect(new Set(files.map((row) => row.slot)).size).toBe(6);
    expect(new Set(files.map((row) => assetOf(row.output))).size).toBe(6);
    for (const segment of ["intro", "body", "outro"] as const) {
      const read = (role: string) => {
        const row = files.find(
          (row) => row.output.role === role && row.output.meta.segment === segment,
        );
        if (row === undefined) throw new Error("Missing file");
        return readFileSync(outputPath(h.deps.paths, h.projectId, row.output.path), "utf8");
      };
      const transcript = revisionTranscript(h.deps, { view, plan }, segment);
      expect(read("narration_txt")).toBe(transcript);
      expect(transcript).not.toContain("[calm]");
      const concat = plan.recipes.find(
        (row) => row.key === (segment === "body" ? "audio:body:concat" : `audio:${segment}`),
      );
      expect(read("tts_script")).toBe(
        concat?.dependsOn
          .map((key) => h.calls.find((call) => call.kind === "tts" && call.key === key)?.text)
          .join("\n\n"),
      );
    }
    expect(revisionTranscript(h.deps, { view, plan }, "body")).toBe(
      plainText(markdown).trim().replace("\n\n", "\n"),
    );
  } finally {
    h.close();
  }
}, 30_000);

it("repairs missing text locally while retaining audio and historical downloads", async () => {
  const h = await narrationFixture("Exact narration.", {
    config,
    catalogue: preparationCatalogue,
    answer: () => cues,
  });
  try {
    await h.pump();
    const old = h.view();
    const text = old.outputs.find((row) => row.selected && row.output.role === "narration_txt");
    const body = old.outputs.find((row) => row.selected && row.output.role === "audio_body");
    if (text === undefined) throw new Error("Missing clean output");
    rmSync(outputPath(h.deps.paths, h.projectId, text.output.path));
    h.calls.length = 0;
    admitPendingRevision(h.deps, h.view(), preparationCatalogue);
    await h.pump();
    expect(h.calls).toEqual([]);
    expect(
      h.view().outputs.find((row) => row.selected && row.output.role === "audio_body")?.assetId,
    ).toBe(body?.assetId);
    expect(
      h.view().outputs.find((row) => row.selected && row.output.role === "narration_txt")
        ?.available,
    ).toBe(true);
    const before = h.view();
    const saved = await saveRevision(h.deps, {
      projectId: h.projectId,
      baseRevisionId: before.revision.id,
      idempotencyKey: "new-words",
      edit: {
        config: before.revision.config,
        content: {
          ...before.revision.content,
          articleMarkdown: "New narration.",
          articleEdited: true,
        },
      },
    });
    if (!saved.ok) throw new Error(JSON.stringify(saved));
    admitPendingRevision(h.deps, saved.view, preparationCatalogue);
    await h.pump();
    const historical = getRevisionView(h.deps, h.projectId, before.revision.id)?.outputs.find(
      (row) => row.selected && row.output.role === "narration_txt",
    );
    if (historical === undefined) throw new Error("Missing history file");
    expect(
      readFileSync(outputPath(h.deps.paths, h.projectId, historical.output.path), "utf8"),
    ).toBe("Exact narration.");
    expect(
      h.view().outputs.find((row) => row.selected && row.output.role === "narration_txt")?.assetId,
    ).not.toBe(historical.assetId);
  } finally {
    h.close();
  }
});

it("refuses missing clean metadata instead of leaking delivery cues into captions", async () => {
  const h = await narrationFixture("Exact narration.", {
    config,
    catalogue: preparationCatalogue,
    answer: () => cues,
  });
  try {
    await h.pump();
    const view = h.view();
    const plan = executionPlan(h.deps, view, preparationCatalogue);
    const incomplete = {
      ...view,
      pieces: view.pieces.map((row) =>
        row.piece.kind === "chunk"
          ? {
              ...row,
              piece: { ...row.piece, payload: JSON.stringify({ text: "[calm] Exact narration." }) },
            }
          : row,
      ),
    };
    expect(() => narrationTextParts(incomplete, plan, "body")).toThrow(
      /no longer matches its prepared text/,
    );
  } finally {
    h.close();
  }
});

it("cleans a failed text bundle publication without regenerating or losing audio", async () => {
  const h = await narrationFixture("Exact narration.", {
    config,
    catalogue: preparationCatalogue,
    answer: () => cues,
  });
  try {
    await h.pump();
    const old = h.view();
    const text = old.outputs.find((row) => row.selected && row.output.role === "narration_txt");
    const audio = old.outputs.find((row) => row.selected && row.output.role === "audio_body");
    if (!text || !audio) throw new Error("Missing outputs");
    rmSync(outputPath(h.deps.paths, h.projectId, text.output.path));
    const directory = join(h.deps.paths.projects, h.projectId, "assets");
    const before = readdirSync(directory).sort();
    h.deps.db.exec(
      "CREATE TRIGGER reject_script BEFORE INSERT ON revision_outputs WHEN json_extract(NEW.descriptor,'$.role')='tts_script' BEGIN SELECT RAISE(ABORT,'script publication failed'); END",
    );
    h.calls.length = 0;
    admitPendingRevision(h.deps, h.view(), preparationCatalogue);
    await expect(h.pump()).rejects.toThrow("script publication failed");
    expect(h.calls).toEqual([]);
    expect(readdirSync(directory).sort()).toEqual(before);
    expect(
      h.view().outputs.find((row) => row.selected && row.output.role === "audio_body")?.assetId,
    ).toBe(audio.assetId);
    expect(
      h.view().outputs.find((row) => row.selected && row.output.role === "audio_body")?.available,
    ).toBe(true);
  } finally {
    h.close();
  }
});
