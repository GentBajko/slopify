import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegStatic from "ffmpeg-static";
import { expect } from "vitest";
import { openDb } from "../../src/kernel/db/index.js";
import { ensureDirs, layout } from "../../src/kernel/paths.js";
import { stageKinds } from "../../src/kernel/pipeline.js";
import { type RunConfig, sourceOf } from "../../src/slices/admission/model.js";
import { resolveFfmpeg } from "../../src/slices/video/ffmpeg.js";

const ffmpeg = resolveFfmpeg(process.env, ffmpegStatic);
export const projectId = "legacy-project";

function ff(args: readonly string[]): void {
  execFileSync(ffmpeg, [...args], { windowsHide: true, stdio: "pipe" });
}

function tone(path: string, frequency: number, seconds: number): void {
  ff([
    "-v",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    `sine=frequency=${frequency}:duration=${seconds}:sample_rate=48000`,
    path,
  ]);
}

export function seedLegacy(): {
  readonly dataDir: string;
  readonly oldWav: Buffer;
  readonly replacement: Buffer;
} {
  const dataDir = mkdtempSync(join(tmpdir(), "slopify-editable-"));
  const paths = layout(dataDir);
  ensureDirs(paths, { mode: 0o700 });
  const directory = join(paths.projects, projectId);
  mkdirSync(directory, { recursive: true });
  const article = "# Legacy narration\n\nA saved article for supplied narration.";
  writeFileSync(join(directory, "article.md"), article);
  writeFileSync(
    join(directory, "article.txt"),
    "Legacy narration\n\nA saved article for supplied narration.",
  );
  tone(join(directory, "audio-body.wav"), 440, 0.25);
  ff([
    "-v",
    "error",
    "-y",
    "-i",
    join(directory, "audio-body.wav"),
    "-c:a",
    "pcm_s16le",
    "-ar",
    "48000",
    "-ac",
    "2",
    join(directory, "audio.wav"),
  ]);
  tone(join(dataDir, "replacement.mp3"), 880, 0.5);
  writeFileSync(
    join(directory, "render.json"),
    JSON.stringify({
      sampleRate: 48000,
      channels: 2,
      codec: "pcm_s16le",
      gapSeconds: 0,
      totalSeconds: 0.25,
      audio: [{ kind: "body", path: "audio-body.wav", seconds: 0.25 }],
      output: "audio.wav",
      sourceIds: ["legacy-audio_body"],
    }),
  );
  const at = "2026-09-10T00:00:00.000Z";
  const config: RunConfig = {
    title: "Legacy title",
    format: "16:9",
    sources: {
      research: "off",
      article: "provide",
      audio: "provide",
      images: "off",
      thumbnail: "off",
      video: "off",
    },
    imagePrompts: [],
    values: {},
    provided: { article, audio: "consumed-legacy-upload" },
    silenceGapSeconds: 0,
    imageSeconds: 15,
    zoomPercent: 22.5,
    motionStyle: "zoom",
    edgeSilenceSeconds: 0,
    rendered: {},
  };
  const db = openDb(paths.db);
  try {
    // Do not call current migrate(): the seeded database must predate revisions.
    for (const [version, file] of [
      [1, "0001-init.sql"],
      [2, "0002-project-controls.sql"],
      [3, "0003-batch-queue.sql"],
    ] as const) {
      db.exec(
        readFileSync(new URL(`../../src/kernel/db/migrations/${file}`, import.meta.url), "utf8"),
      );
      db.prepare("INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)").run(
        version,
        at,
      );
    }
    db.prepare(
      "INSERT INTO projects(id,title,format,config,created_at,updated_at) VALUES (?,?,?,?,?,?)",
    ).run(projectId, config.title, config.format, JSON.stringify(config), at, at);
    // The seeded schema predates the Document stage; migrating adds its row.
    for (const kind of stageKinds.filter((one) => one !== "document")) {
      const state =
        kind === "video"
          ? "done"
          : sourceOf(config.sources, kind) === "provide"
            ? "provided"
            : "skipped";
      db.prepare(
        "INSERT INTO stages(id,project_id,kind,source,state,finished_at) VALUES (?,?,?,?,?,?)",
      ).run(`legacy-${kind}`, projectId, kind, sourceOf(config.sources, kind), state, at);
    }
    for (const [role, stage, path, duration] of [
      ["article_md", "article", "article.md", null],
      ["article_txt", "article", "article.txt", null],
      ["audio_body", "audio", "audio-body.wav", 250],
      ["audio_export", "video", "audio.wav", 250],
      ["render_params", "video", "render.json", null],
    ] as const) {
      db.prepare(
        "INSERT INTO outputs " +
          "(id,project_id,stage_kind,role,path,original_filename,bytes,duration_ms,meta,created_at) " +
          "VALUES (?,?,?,?,?,NULL,?,?,?,?)",
      ).run(
        `legacy-${role}`,
        projectId,
        stage,
        role,
        path,
        statSync(join(directory, path)).size,
        duration,
        "{}",
        at,
      );
    }
    expect(db.prepare("SELECT version FROM schema_migrations ORDER BY version").all()).toEqual([
      { version: 1 },
      { version: 2 },
      { version: 3 },
    ]);
    expect(
      db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='project_revisions'")
        .get(),
    ).toBeUndefined();
  } finally {
    db.close();
  }
  return {
    dataDir,
    oldWav: readFileSync(join(directory, "audio.wav")),
    replacement: readFileSync(join(dataDir, "replacement.mp3")),
  };
}

export function verifyPcmWav(path: string): void {
  const result = spawnSync(ffmpeg, ["-hide_banner", "-i", path, "-f", "null", "-"], {
    windowsHide: true,
    encoding: "utf8",
  });
  expect(result.error).toBeUndefined();
  expect(result.status, result.stderr).toBe(0);
  // Native Windows FFmpeg names stereo input "2 channels".
  expect(result.stderr).toMatch(/Audio: pcm_s16le.*48000 Hz, (?:stereo|2 channels)/);
}
