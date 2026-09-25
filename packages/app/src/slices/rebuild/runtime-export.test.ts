import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { saveRevision } from "../revisions/mutations.js";
import { outputPath } from "../storage/layout.js";
import { insertStagedFile } from "../storage/repo.js";
import { runFfmpeg } from "../video/ffmpeg.js";
import { exportFixture } from "./runtime-export.fake.js";
import { executeExportRecipe } from "./runtime-export.js";
import { executeSubtitleRecipe } from "./runtime-subtitles.js";

vi.mock("../video/ffmpeg.js", async (original) => ({
  ...(await original<typeof import("../video/ffmpeg.js")>()),
  runFfmpeg: vi.fn(async (run: { args: readonly string[] }) => {
    const path = run.args.at(-1);
    if (path === undefined) throw new Error("No output");
    writeFileSync(path, "rendered-audio");
  }),
}));
vi.mock("../fonts/index.js", () => ({
  resolveFont: async (paths: { dataDir: string }) => {
    const path = join(paths.dataDir, "font.ttf");
    writeFileSync(path, "font");
    return { id: "default", name: "Test", assName: "Test", extension: ".ttf", path };
  },
}));
it("renders WAV once, then attaches sidecars while retaining its exact audio asset", async () => {
  const h = await exportFixture();
  try {
    vi.mocked(runFfmpeg).mockClear();
    const { context, piece } = h.grant("export:wav");
    const count = vi.fn();
    expect(await executeExportRecipe({ ...h.deps, count }, context, piece)).toBe("done");
    expect(await executeExportRecipe({ ...h.deps, count }, context, piece)).toBe("done");
    expect(count).toHaveBeenCalledExactlyOnceWith("stage.completed", { stage: "video" });
    const wav = h.view().outputs.find((row) => row.selected && row.output.role === "audio_export");
    expect(wav).toBeDefined();
    for (const key of ["subtitles:cues", "subtitles:files"]) {
      const part = h.grant(key);
      await executeSubtitleRecipe(h.deps, part.context, part.piece);
    }
    const current = h.view().outputs.filter((row) => row.selected);
    expect(current.find((row) => row.output.role === "audio_export")?.assetId).toBe(wav?.assetId);
    expect(
      current.find((row) => row.output.role === "audio_export")?.output.meta.subtitlesMode,
    ).toBe("files");
    expect(current.some((row) => row.output.role === "render_params")).toBe(true);
    expect(vi.mocked(runFfmpeg)).toHaveBeenCalledTimes(1);
    if (wav === undefined) throw new Error("No WAV");
    expect(readFileSync(outputPath(h.deps.paths, h.projectId, wav.output.path), "utf8")).toBe(
      "rendered-audio",
    );
  } finally {
    h.close();
  }
});
it("keeps the previous complete export when a new render fails", async () => {
  const h = await exportFixture();
  try {
    const first = h.grant("export:wav");
    await executeExportRecipe(h.deps, first.context, first.piece);
    const old = h.view().outputs.find((row) => row.selected && row.output.role === "audio_export");
    vi.mocked(runFfmpeg).mockRejectedValueOnce(new Error("disk full"));
    const next = h.grant("export:wav");
    await expect(executeExportRecipe(h.deps, next.context, next.piece)).rejects.toThrow(
      "disk full",
    );
    expect(
      h.view().outputs.find((row) => row.selected && row.output.role === "audio_export")?.assetId,
    ).toBe(old?.assetId);
    if (old === undefined) throw new Error("No original");
    expect(existsSync(outputPath(h.deps.paths, h.projectId, old.output.path))).toBe(true);
  } finally {
    h.close();
  }
});
it("does not overwrite newer captions when an unchanged WAV finishes after a caption edit", async () => {
  const h = await exportFixture();
  try {
    for (const key of ["subtitles:cues", "subtitles:files"]) {
      const part = h.grant(key);
      await executeSubtitleRecipe(h.deps, part.context, part.piece);
    }
    let release = (): void => undefined;
    let started = (): void => undefined;
    const entered = new Promise<void>((resolve) => {
      started = resolve;
    });
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.mocked(runFfmpeg).mockImplementationOnce(async (run) => {
      started();
      await pending;
      const path = run.args.at(-1);
      if (path === undefined) throw new Error("No output");
      writeFileSync(path, "late WAV");
    });
    const part = h.grant("export:wav");
    const running = executeExportRecipe(h.deps, part.context, part.piece);
    await entered;
    const old = h.view();
    const saved = await saveRevision(h.deps, {
      projectId: h.projectId,
      baseRevisionId: old.revision.id,
      idempotencyKey: "change-cue",
      edit: {
        config: old.revision.config,
        content: {
          ...old.revision.content,
          subtitleCues: {
            audioFingerprint: old.revision.content.subtitleCues?.audioFingerprint ?? "",
            cues: [{ id: "one", text: "New caption", start: 0, end: 3 }],
          },
        },
      },
    });
    if (!saved.ok) throw new Error(JSON.stringify(saved));
    for (const key of ["subtitles:cues", "subtitles:files"]) {
      const caption = h.grant(key, saved.view.revision.id);
      await executeSubtitleRecipe(h.deps, caption.context, caption.piece);
    }
    const newSrt = h
      .view(saved.view.revision.id)
      .outputs.find((row) => row.selected && row.output.role === "subtitles_srt");
    release();
    await running;
    const current = h.view(saved.view.revision.id).outputs.filter((row) => row.selected);
    expect(current.find((row) => row.output.role === "subtitles_srt")?.assetId).toBe(
      newSrt?.assetId,
    );
    expect(current.some((row) => row.output.role === "audio_export")).toBe(true);
    expect(
      h.view().outputs.some((row) => row.output.role === "audio_export" && row.available),
    ).toBe(true);
  } finally {
    h.close();
  }
});
it("renders a silent slideshow in the selected shape without requiring narration", async () => {
  const h = await exportFixture(false);
  try {
    const old = h.view();
    writeFileSync(join(h.deps.paths.staging, "image"), "image");
    insertStagedFile(h.deps.db, {
      id: "image",
      stageKind: "images",
      path: "image",
      originalFilename: "image.png",
      bytes: 5,
      state: "staged",
      createdAt: h.deps.clock.now().toISOString(),
    });
    const saved = await saveRevision(h.deps, {
      projectId: h.projectId,
      baseRevisionId: old.revision.id,
      idempotencyKey: "silent",
      edit: {
        config: {
          ...old.revision.config,
          format: "9:16",
          sources: {
            ...old.revision.config.sources,
            audio: "off",
            images: "provide",
            video: "generate",
          },
          subtitles: {
            mode: "off",
            language: "en",
            fontId: "default",
            fontSize: 48,
            position: "bottom",
          },
        },
        content: {
          ...old.revision.content,
          imageOrder: ["one"],
          imageDefinitions: { one: { source: "provide", assetId: null, prompt: null } },
        },
        uploads: [{ stagedFileId: "image", destination: { kind: "image", imageKey: "one" } }],
      },
    });
    if (!saved.ok) throw new Error(JSON.stringify(saved));
    vi.mocked(runFfmpeg).mockClear();
    const part = h.grant("export:video", saved.view.revision.id);
    expect(await executeExportRecipe(h.deps, part.context, part.piece)).toBe("done");
    const run = vi.mocked(runFfmpeg).mock.calls[0]?.[0];
    expect(run?.args).toContain("-an");
    expect(run?.args.join(" ")).toContain("s=1080x1920");
    const video = h
      .view(saved.view.revision.id)
      .outputs.find((row) => row.selected && row.output.role === "video");
    // One image, shown once for the default 15 seconds.
    expect(video?.output.durationMs).toBe(15000);
  } finally {
    h.close();
  }
});
