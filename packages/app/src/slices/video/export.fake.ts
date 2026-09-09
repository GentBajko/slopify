import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegStatic from "ffmpeg-static";
import { systemClock } from "../../kernel/clock.js";
import { openDb } from "../../kernel/db/index.js";
import { migrate } from "../../kernel/db/migrate.js";
import { ulidIds } from "../../kernel/ids.js";
import { ensureDirs, layout } from "../../kernel/paths.js";
import type { StageContext } from "../../kernel/runner/index.js";
import type { OutputRole } from "../storage/model.js";
import { insertOutput } from "../storage/repo.js";
import { recordingCounter } from "../telemetry/record.fake.js";
import { resolveFfmpeg } from "./ffmpeg.js";

export const binary = resolveFfmpeg(process.env, ffmpegStatic);

export function exportFixture(video: "generate" | "off", audio: "provide" | "off", gap = 0.15) {
  const paths = layout(mkdtempSync(join(tmpdir(), "slopify-export-")));
  ensureDirs(paths, { mode: 0o700 });
  const db = openDb(paths.db);
  migrate(db, systemClock);
  const dir = join(paths.projects, "p1");
  mkdirSync(dir, { recursive: true });
  db.prepare(
    "INSERT INTO projects (id, title, format, config, created_at, updated_at) VALUES ('p1', 'Export', '16:9', ?, '2026-09-09', '2026-09-09')",
  ).run(
    JSON.stringify({
      title: "Export",
      format: "16:9",
      sources: {
        research: "off",
        article: "provide",
        audio,
        images: video === "off" ? "off" : "provide",
        thumbnail: "off",
        video,
      },
      imagePrompts: [],
      values: {},
      provided: {},
      rendered: {},
      silenceGapSeconds: gap,
    }),
  );
  db.prepare(
    "INSERT INTO stages (id, project_id, kind, source, state) VALUES ('s-video', 'p1', 'video', ?, 'running')",
  ).run(video);
  const counted = recordingCounter();
  const deps = {
    db,
    paths,
    ids: ulidIds,
    clock: systemClock,
    log: { write: () => {} },
    ffmpeg: binary,
    count: counted.count,
  };
  const output = (role: OutputRole, path: string, index?: number) =>
    insertOutput(db, {
      id: ulidIds.next(),
      projectId: "p1",
      stageKind: role === "image" ? "images" : "audio",
      role,
      path,
      originalFilename: null,
      bytes: statSync(join(dir, path)).size,
      durationMs: null,
      meta: index === undefined ? {} : { index },
      createdAt: systemClock.now().toISOString(),
    });
  const tone = (
    role: "audio_body" | "audio_intro" | "audio_outro",
    extension: "mp3" | "wav",
    duration = 0.3,
  ) => {
    const path = `${role}.${extension}`;
    execFileSync(binary, [
      "-v",
      "error",
      "-y",
      "-f",
      "lavfi",
      "-i",
      `sine=frequency=440:duration=${duration}:sample_rate=22050`,
      "-ac",
      "1",
      join(dir, path),
    ]);
    output(role, path);
    return join(dir, path);
  };
  const image = () => {
    const path = "image.ppm";
    writeFileSync(
      join(dir, path),
      Buffer.concat([Buffer.from("P6\n16 16\n255\n"), Buffer.alloc(16 * 16 * 3, 80)]),
    );
    output("image", path, 1);
  };
  const context = (signal = new AbortController().signal): StageContext => ({
    stage: { id: "s-video", projectId: "p1", kind: "video", state: "running" },
    signal,
    emit: () => {},
  });
  return { deps, dir, counted, tone, image, context };
}

export function inspectMedia(path: string): string {
  try {
    execFileSync(binary, ["-hide_banner", "-i", path], { stdio: ["ignore", "pipe", "pipe"] });
  } catch (error) {
    return String((error as { stderr?: Buffer }).stderr ?? "");
  }
  throw new Error("ffmpeg inspection unexpectedly exited successfully");
}

export function wavParts(path: string) {
  const bytes = readFileSync(path);
  let format: Buffer | undefined;
  let pcm: Buffer | undefined;
  for (let offset = 12; offset + 8 <= bytes.length; ) {
    const size = bytes.readUInt32LE(offset + 4);
    const name = bytes.toString("ascii", offset, offset + 4);
    if (name === "fmt ") format = bytes.subarray(offset + 8, offset + 8 + size);
    if (name === "data") pcm = bytes.subarray(offset + 8, offset + 8 + size);
    offset += 8 + size + (size % 2);
  }
  if (!format || !pcm) throw new Error("WAV lacks format or PCM data");
  const samples = pcm;
  return {
    signature: bytes.toString("ascii", 0, 4),
    container: bytes.toString("ascii", 8, 12),
    codec: format.readUInt16LE(0),
    channels: format.readUInt16LE(2),
    rate: format.readUInt32LE(4),
    bits: format.readUInt16LE(14),
    duration: pcm.length / (48000 * 2 * 2),
    peakAt: (seconds: number) => {
      const offset = Math.round(seconds * 48000) * 4;
      let peak = 0;
      for (let at = offset; at < Math.min(offset + 480 * 4, samples.length); at += 2)
        peak = Math.max(peak, Math.abs(samples.readInt16LE(at)));
      return peak;
    },
  };
}
