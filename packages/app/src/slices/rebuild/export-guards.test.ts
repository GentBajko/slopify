import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
import type { ProjectEvent } from "../../kernel/events.js";
import { projectDir } from "../storage/layout.js";
import { runFfmpeg } from "../video/ffmpeg.js";
import { exportFixture } from "./runtime-export.fake.js";
import { executeExportRecipe } from "./runtime-export.js";
import { narrationAudio } from "./runtime-export-inputs.js";

// What an export does when it is canceled, how it reports its progress, and the narration it
// refuses to export. ffmpeg is a double that writes its output file.

vi.mock("../video/ffmpeg.js", async (original) => ({
  ...(await original<typeof import("../video/ffmpeg.js")>()),
  runFfmpeg: vi.fn(async (run: { args: readonly string[] }) => {
    const path = run.args.at(-1);
    if (path === undefined) throw new Error("No output");
    writeFileSync(path, "rendered-audio");
  }),
}));

type Fixture = Awaited<ReturnType<typeof exportFixture>>;

const selectedWav = (h: Fixture) =>
  h.view().outputs.find((row) => row.selected && row.output.role === "audio_export");

async function exported(h: Fixture) {
  const first = h.grant("export:wav");
  expect(await executeExportRecipe(h.deps, first.context, first.piece)).toBe("done");
  const old = selectedWav(h);
  if (old === undefined) throw new Error("No first export");
  const files = readdirSync(projectDir(h.deps.paths, h.projectId), { recursive: true }).sort();
  const assets = h.deps.db.prepare("SELECT count(*) AS n FROM project_assets").get();
  // The first export is whole and selected; nothing new is left behind by the second.
  return () => {
    expect(selectedWav(h)?.assetId).toBe(old.assetId);
    expect(existsSync(outputPathOf(h, old.output.path))).toBe(true);
    expect(readdirSync(projectDir(h.deps.paths, h.projectId), { recursive: true }).sort()).toEqual(
      files,
    );
    expect(h.deps.db.prepare("SELECT count(*) AS n FROM project_assets").get()).toEqual(assets);
  };
}

function outputPathOf(h: Fixture, path: string): string {
  return `${projectDir(h.deps.paths, h.projectId)}/${path}`;
}

it("starts no render for an export canceled before it began, and keeps the previous one", async () => {
  const h = await exportFixture();
  try {
    const unchanged = await exported(h);
    vi.mocked(runFfmpeg).mockClear();
    const next = h.grant("export:wav");
    const controller = new AbortController();
    controller.abort(new Error("canceled"));
    await expect(
      executeExportRecipe(h.deps, { ...next.context, signal: controller.signal }, next.piece),
    ).rejects.toThrow();
    expect(vi.mocked(runFfmpeg)).not.toHaveBeenCalled();
    unchanged();
  } finally {
    h.close();
  }
});

it("discards an export whose cancel arrived with its progress, and keeps the previous one", async () => {
  const h = await exportFixture();
  try {
    const unchanged = await exported(h);
    const controller = new AbortController();
    vi.mocked(runFfmpeg).mockImplementationOnce(async (run) => {
      run.onProgress?.(1000);
      const path = run.args.at(-1);
      if (path === undefined) throw new Error("No output");
      writeFileSync(path, "late audio");
    });
    const next = h.grant("export:wav");
    await expect(
      executeExportRecipe(
        h.deps,
        {
          ...next.context,
          signal: controller.signal,
          emit: () => controller.abort(new Error("canceled")),
        },
        next.piece,
      ),
    ).rejects.toThrow();
    unchanged();
  } finally {
    h.close();
  }
});

it("reports the render's progress as a share of the whole, ending at all of it", async () => {
  const h = await exportFixture();
  try {
    vi.mocked(runFfmpeg).mockImplementationOnce(async (run) => {
      run.onProgress?.(1000);
      run.onProgress?.(4000);
      const path = run.args.at(-1);
      if (path === undefined) throw new Error("No output");
      writeFileSync(path, "rendered-audio");
    });
    const events: ProjectEvent[] = [];
    const { context, piece } = h.grant("export:wav");
    expect(
      await executeExportRecipe(
        h.deps,
        { ...context, emit: (event) => void events.push(event) },
        piece,
      ),
    ).toBe("done");
    // The fixture's narration is four seconds long.
    expect(events.filter((event) => event.type === "stage.progress")).toEqual([
      { type: "stage.progress", projectId: h.projectId, stage: "video", current: 25, total: 100 },
      { type: "stage.progress", projectId: h.projectId, stage: "video", current: 100, total: 100 },
    ]);
  } finally {
    h.close();
  }
});

it("refuses to export narration that decodes to no length at all", async () => {
  const h = await exportFixture();
  try {
    const view = h.view();
    // An upload whose length was never recorded, and that measures as nothing now.
    const unmeasured = {
      ...view,
      outputs: view.outputs.map((row) =>
        row.output.role === "audio_body"
          ? { ...row, output: { ...row.output, durationMs: null } }
          : row,
      ),
    };
    expect(unmeasured.outputs.some((row) => row.selected && row.output.role === "audio_body")).toBe(
      true,
    );
    await expect(
      narrationAudio({ paths: h.deps.paths, measure: async () => 0 }, unmeasured),
    ).rejects.toThrow(/couldn't read the length of the narration audio/);
  } finally {
    h.close();
  }
});
