import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { derive } from "../src/kernel/runner/graph.js";
import { executionStandings } from "../src/slices/rebuild/runtime-store.js";
import { insertStagedFile } from "../src/slices/storage/repo.js";
import { composedFixture, current, save, start, tone } from "./revision-rebuild.fake.js";

it("projects uploaded stages immediately on Save and completes a supplied-only WAV rebuild", async () => {
  const h = await composedFixture({
    image: () => {
      throw new Error("No image generation");
    },
    tts: () => {
      throw new Error("No narration generation");
    },
  });
  try {
    const base = current(h.deps, h.projectId);
    await save(h.deps, h.projectId, {
      config: {
        ...base.revision.config,
        sources: { ...base.revision.config.sources, images: "off" },
      },
      content: { ...base.revision.content, imageOrder: [], imageDefinitions: {} },
    });
    for (const kind of ["audio", "images"] as const) {
      const bytes = kind === "audio" ? tone() : Buffer.from("image");
      writeFileSync(join(h.deps.paths.staging, kind), bytes);
      insertStagedFile(h.deps.db, {
        id: kind,
        stageKind: kind,
        path: kind,
        originalFilename: `${kind}.${kind === "audio" ? "mp3" : "png"}`,
        bytes: bytes.length,
        state: "staged",
        createdAt: h.deps.clock.now().toISOString(),
      });
    }
    const off = current(h.deps, h.projectId);
    await save({ ...h.deps, measureAudio: async () => 100 }, h.projectId, {
      config: {
        ...off.revision.config,
        sources: { ...off.revision.config.sources, audio: "provide", images: "provide" },
      },
      content: {
        ...off.revision.content,
        imageOrder: ["custom"],
        imageDefinitions: { custom: { source: "provide", assetId: null, prompt: null } },
      },
      uploads: [
        { stagedFileId: "audio", destination: { kind: "provided", stage: "audio" } },
        { stagedFileId: "images", destination: { kind: "image", imageKey: "custom" } },
      ],
    });
    const stages = h.deps.db
      .prepare("SELECT kind,source,state FROM stages WHERE project_id=?")
      .all(h.projectId);
    expect(stages).toEqual(
      expect.arrayContaining([
        { kind: "audio", source: "provide", state: "provided" },
        { kind: "images", source: "provide", state: "provided" },
        { kind: "video", source: "off", state: "pending" },
      ]),
    );
    expect(h.deps.db.prepare("SELECT count(*) AS n FROM attempts").get()?.n).toBe(0);
    expect(h.deps.db.prepare("SELECT count(*) AS n FROM rebuild_admissions").get()?.n).toBe(0);
    await start({ ...h.deps, measureAudio: async () => 100 }, h.projectId, ["export:wav"]);
    await h.runner.settled();
    expect(derive(executionStandings(h.deps, h.projectId))).toBe("done");
    expect(
      current(h.deps, h.projectId).outputs.some(
        (row) => row.selected && row.available && row.output.role === "audio_export",
      ),
    ).toBe(true);
    expect(h.deps.db.prepare("SELECT count(*) AS n FROM attempts").get()?.n).toBe(0);
  } finally {
    await h.runner.settled();
    h.audioPreviews.close();
    h.close();
  }
});
