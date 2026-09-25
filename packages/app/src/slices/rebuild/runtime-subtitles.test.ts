import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { resolveFont } from "../fonts/index.js";
import { saveRevision } from "../revisions/mutations.js";
import { outputPath } from "../storage/layout.js";
import { exportFixture } from "./runtime-export.fake.js";
import { describeMismatch, executeSubtitleRecipe } from "./runtime-subtitles.js";

vi.mock("../fonts/index.js", () => ({
  resolveFont: vi.fn(async (paths: { dataDir: string }) => {
    const path = join(paths.dataDir, "font.ttf");
    writeFileSync(path, "font");
    return { id: "default", name: "Test", assName: "Test", extension: ".ttf", path };
  }),
}));
it("publishes manual captions without alignment or regenerating narration", async () => {
  const h = await exportFixture();
  try {
    const alignSubtitles = vi.fn(async () => {
      throw new Error("Must not align manual cues");
    });
    const audio = h.view().outputs.find((row) => row.output.role === "audio_body");
    for (const key of ["subtitles:cues", "subtitles:files"]) {
      const { context, piece } = h.grant(key);
      expect(await executeSubtitleRecipe({ ...h.deps, alignSubtitles }, context, piece)).toBe(
        "done",
      );
    }
    expect(alignSubtitles).not.toHaveBeenCalled();
    const srt = h.view().outputs.find((row) => row.selected && row.output.role === "subtitles_srt");
    expect(srt).toBeDefined();
    if (srt === undefined) throw new Error("No captions");
    expect(readFileSync(outputPath(h.deps.paths, h.projectId, srt.output.path), "utf8")).toContain(
      "Edited caption.",
    );
    expect(h.view().outputs.find((row) => row.output.role === "audio_body")?.assetId).toBe(
      audio?.assetId,
    );
  } finally {
    h.close();
  }
});
it("holds a revoked timing invocation before alignment", async () => {
  const h = await exportFixture(false);
  try {
    const { context, piece } = h.grant("subtitles:timing");
    const alignSubtitles = vi.fn(async () => []);
    expect(
      await executeSubtitleRecipe(
        { ...h.deps, alignSubtitles },
        { ...context, maySubmit: () => false },
        piece,
      ),
    ).toBe("held");
    expect(alignSubtitles).not.toHaveBeenCalled();
  } finally {
    h.close();
  }
});
it("keeps an accepted alignment in its origin when the transcript changes", async () => {
  const h = await exportFixture(false);
  try {
    let release = (): void => undefined;
    let started = (): void => undefined;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const entered = new Promise<void>((resolve) => {
      started = resolve;
    });
    const alignSubtitles = vi.fn(async (input: { text: string }) => {
      started();
      await pending;
      expect(input.text.trim()).toBe("Saved article.");
      return [
        { text: "Saved", start: 0, end: 1 },
        { text: "article.", start: 1, end: 2 },
      ];
    });
    const { context, piece } = h.grant("subtitles:timing");
    const running = executeSubtitleRecipe({ ...h.deps, alignSubtitles }, context, piece);
    await entered;
    const old = h.view();
    const saved = await saveRevision(h.deps, {
      projectId: h.projectId,
      baseRevisionId: old.revision.id,
      idempotencyKey: "transcript",
      edit: {
        config: old.revision.config,
        content: {
          ...old.revision.content,
          articleMarkdown: "Different article.",
          articleEdited: true,
        },
      },
    });
    if (!saved.ok) throw new Error(JSON.stringify(saved));
    release();
    expect(await running).toBe("done");
    expect(
      h.view().outputs.some((row) => row.output.role === "subtitle_words" && row.available),
    ).toBe(true);
    expect(
      h
        .view(saved.view.revision.id)
        .outputs.some((row) => row.output.role === "subtitle_words" && row.selected),
    ).toBe(false);
  } finally {
    h.close();
  }
});
it("prepares automatic cues and sidecars from the completed timing asset", async () => {
  const h = await exportFixture(false);
  try {
    const alignSubtitles = vi.fn(async () => [
      { text: "Saved", start: 0, end: 1 },
      { text: "article.", start: 1, end: 2 },
    ]);
    for (const key of ["subtitles:timing", "subtitles:cues", "subtitles:files"]) {
      const { context, piece } = h.grant(key);
      expect(await executeSubtitleRecipe({ ...h.deps, alignSubtitles }, context, piece)).toBe(
        "done",
      );
    }
    expect(alignSubtitles).toHaveBeenCalledTimes(1);
    const outputs = h.view().outputs.filter((row) => row.selected);
    expect(outputs.map((row) => row.output.role)).toEqual(
      expect.arrayContaining([
        "subtitle_words",
        "subtitles_srt",
        "subtitles_vtt",
        "subtitle_ass",
        "subtitle_font",
      ]),
    );
  } finally {
    h.close();
  }
});
it("times captions after the silence that opens the export", async () => {
  const h = await exportFixture(false);
  try {
    const old = h.view();
    const saved = await saveRevision(h.deps, {
      projectId: h.projectId,
      baseRevisionId: old.revision.id,
      idempotencyKey: "edge",
      edit: {
        config: { ...old.revision.config, edgeSilenceSeconds: 2 },
        content: old.revision.content,
      },
    });
    if (!saved.ok) throw new Error(JSON.stringify(saved));
    const alignSubtitles = vi.fn(async () => [
      { text: "Saved", start: 0, end: 1 },
      { text: "article.", start: 1, end: 2 },
    ]);
    const part = h.grant("subtitles:timing", saved.view.revision.id);
    expect(
      await executeSubtitleRecipe({ ...h.deps, alignSubtitles }, part.context, part.piece),
    ).toBe("done");
    const words = h
      .view(saved.view.revision.id)
      .outputs.find((row) => row.selected && row.output.role === "subtitle_words");
    if (words === undefined) throw new Error("No timed words");
    const timed = JSON.parse(
      readFileSync(outputPath(h.deps.paths, h.projectId, words.output.path), "utf8"),
    );
    expect(
      timed.words.map((word: { start: number; end: number }) => [word.start, word.end]),
    ).toEqual([
      [2, 3],
      [3, 4],
    ]);
  } finally {
    h.close();
  }
});
it("reuses the saved font when changing caption size after the system font is unavailable", async () => {
  const h = await exportFixture();
  try {
    for (const key of ["subtitles:cues", "subtitles:files"]) {
      const part = h.grant(key);
      await executeSubtitleRecipe(h.deps, part.context, part.piece);
    }
    const old = h.view();
    const style = old.revision.config.subtitles;
    if (style === undefined) throw new Error("Missing subtitle style");
    const saved = await saveRevision(h.deps, {
      projectId: h.projectId,
      baseRevisionId: old.revision.id,
      idempotencyKey: "font-size",
      edit: {
        config: { ...old.revision.config, subtitles: { ...style, fontSize: 64, position: "top" } },
        content: old.revision.content,
      },
    });
    if (!saved.ok) throw new Error(JSON.stringify(saved));
    vi.mocked(resolveFont).mockRejectedValueOnce(new Error("System font was removed"));
    const part = h.grant("subtitles:files", saved.view.revision.id);
    expect(await executeSubtitleRecipe(h.deps, part.context, part.piece)).toBe("done");
    const ass = h
      .view(saved.view.revision.id)
      .outputs.find((row) => row.selected && row.output.role === "subtitle_ass");
    if (ass === undefined) throw new Error("Missing styled captions");
    expect(readFileSync(outputPath(h.deps.paths, h.projectId, ass.output.path), "utf8")).toContain(
      "Style: Default,Test,64",
    );
  } finally {
    vi.mocked(resolveFont).mockReset();
    h.close();
  }
}, 30_000);

it("names the time, the chunk and the words when the audio stops matching", () => {
  const chunks = [
    { key: "audio:body:a-1", spokenText: "Richard Lee Byers wrote the novels. " },
    {
      key: "audio:body:b-1",
      spokenText:
        "Around its March 2023 release, Collider ran explainers. Early reviews disagreed with each other. Wargamer's headline was \"I tested D&D's new Deadfall adventure.\"",
    },
  ];
  expect(
    describeMismatch(chunks, "body", {
      at: 6022.7,
      expected: "Early reviews disagreed with each other. Wargamer's headline was",
      heard: "WARGAMER'S HEADLINE WAS I TESTED D AND D'S",
    }),
  ).toBe(
    'Subtitles stopped matching the audio at 1:40:22 into the body narration, in narration chunk 2 of 2 (it starts "Around its March 2023 release, Collider"). The text expected "Early reviews disagreed with each other. Wargamer\'s headline was…" but the audio has "wargamer\'s headline was i tested d and d\'s…" The recording there probably skips or changes words. In Edit project → Narration, regenerate narration chunk 2, then Resume.',
  );
});

it("still gives the time when no chunk holds the expected words", () => {
  expect(
    describeMismatch([], "outro", { at: 75, expected: "", heard: "THANKS FOR LISTENING" }),
  ).toContain("at 1:15 into the outro narration. The text expected the end of the text");
});
