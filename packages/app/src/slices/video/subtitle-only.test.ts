import { readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { projectById, updateProjectConfig } from "../admission/repo.js";
import { insertOutput, outputsOf } from "../storage/repo.js";
import { defaultSubtitles, type SubtitleConfig } from "../subtitles/model.js";
import { exportFixture } from "./export.fake.js";
import { renderVideo, type VideoDeps } from "./run.js";

const fixtures: ReturnType<typeof exportFixture>[] = [];
afterEach(() => {
  for (const h of fixtures.splice(0)) {
    h.deps.db.close();
    rmSync(h.deps.paths.dataDir, { recursive: true, force: true });
  }
});
function setup() {
  const h = exportFixture("off", "provide");
  fixtures.push(h);
  h.tone("audio_body", "wav");
  writeFileSync(join(h.dir, "article.txt"), "Hello world.");
  insertOutput(h.deps.db, {
    id: "article",
    projectId: "p1",
    stageKind: "article",
    role: "article_txt",
    path: "article.txt",
    originalFilename: null,
    bytes: 12,
    durationMs: null,
    meta: {},
    createdAt: h.deps.clock.now().toISOString(),
  });
  return h;
}
function configure(h: ReturnType<typeof setup>, mode: SubtitleConfig["mode"], size = 48): void {
  const project = projectById(h.deps.db, "p1");
  if (project === undefined) throw new Error("Missing fixture");
  updateProjectConfig(
    h.deps.db,
    "p1",
    { ...project.config, subtitles: { ...defaultSubtitles, mode, fontSize: size } },
    h.deps.clock.now().toISOString(),
  );
}
const aligned = [
  { text: "Hello", start: 0.02, end: 0.1 },
  { text: "world.", start: 0.11, end: 0.2 },
];

it.each([false, true])(
  "updates only captions on an unchanged WAV (legacy plan: %s)",
  async (legacy) => {
    const h = setup();
    await renderVideo(h.deps, h.context());
    if (legacy) {
      const p = join(h.dir, "render.json");
      const plan = JSON.parse(readFileSync(p, "utf8"));
      delete plan.sourceIds;
      writeFileSync(p, JSON.stringify(plan));
    }
    const wav = join(h.dir, "audio.wav"),
      before = readFileSync(wav),
      mtime = statSync(wav).mtimeMs;
    const original = outputsOf(h.deps.db, "p1").find((o) => o.role === "audio_export");
    const align = vi.fn(async () => aligned);
    const deps: VideoDeps = { ...h.deps, ffmpeg: "must-not-launch-ffmpeg", alignSubtitles: align };
    configure(h, "files");
    await renderVideo(deps, h.context());
    expect(outputsOf(h.deps.db, "p1").find((o) => o.role === "subtitles_srt")).toBeDefined();
    configure(h, "files", 64);
    await renderVideo(deps, h.context());
    expect(align).toHaveBeenCalledTimes(1);
    configure(h, "off");
    await renderVideo(deps, h.context());
    expect(outputsOf(h.deps.db, "p1").find((o) => o.role === "subtitles_srt")).toBeUndefined();
    expect(outputsOf(h.deps.db, "p1").find((o) => o.role === "audio_export")?.id).toBe(
      original?.id,
    );
    expect(readFileSync(wav)).toEqual(before);
    expect(statSync(wav).mtimeMs).toBe(mtime);
  },
);

it("rolls back subtitle replacement without touching the retained WAV or captions", async () => {
  const h = setup();
  configure(h, "files");
  const deps: VideoDeps = { ...h.deps, alignSubtitles: async () => aligned };
  await renderVideo(deps, h.context());
  const before = outputsOf(h.deps.db, "p1"),
    wav = readFileSync(join(h.dir, "audio.wav"));
  configure(h, "files", 64);
  h.deps.db.exec(
    "CREATE TRIGGER reject_caption BEFORE INSERT ON outputs WHEN NEW.role = 'subtitles_srt' BEGIN SELECT RAISE(ABORT, 'caption commit refused'); END",
  );
  await expect(renderVideo({ ...deps, ffmpeg: "must-not-run" }, h.context())).rejects.toThrow(
    "caption commit refused",
  );
  expect(outputsOf(h.deps.db, "p1")).toEqual(before);
  expect(readFileSync(join(h.dir, "audio.wav"))).toEqual(wav);
  for (const output of before.filter((o) => o.role === "subtitles_srt"))
    expect(readFileSync(join(h.dir, output.path), "utf8")).toContain("Hello world.");
});

it("re-encodes when the saved timeline changes or the WAV is missing", async () => {
  const h = setup();
  h.tone("audio_intro", "wav", 0.2);
  await renderVideo(h.deps, h.context());
  const project = projectById(h.deps.db, "p1");
  if (project === undefined) throw new Error("Missing fixture");
  updateProjectConfig(
    h.deps.db,
    "p1",
    { ...project.config, silenceGapSeconds: 0.8 },
    h.deps.clock.now().toISOString(),
  );
  await expect(
    renderVideo({ ...h.deps, ffmpeg: "must-run-new-export" }, h.context()),
  ).rejects.toThrow();
  await renderVideo(h.deps, h.context());
  rmSync(join(h.dir, "audio.wav"));
  await expect(
    renderVideo({ ...h.deps, ffmpeg: "must-run-new-export" }, h.context()),
  ).rejects.toThrow();
});
