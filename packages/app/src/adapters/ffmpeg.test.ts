import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegStatic from "ffmpeg-static";
import { afterEach, describe, expect, it } from "vitest";
import { prepareFfmpeg } from "./ffmpeg.js";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function setup(source = ffmpegStatic) {
  const dir = mkdtempSync(join(tmpdir(), "slopify ffmpeg "));
  dirs.push(dir);
  const installer = join(dir, "install.cjs");
  writeFileSync(
    installer,
    `const fs = require('node:fs');
fs.copyFileSync(${JSON.stringify(source)}, process.env.FFMPEG_BIN);
fs.writeFileSync(process.env.FFMPEG_BIN + '.LICENSE', 'license');
fs.writeFileSync(process.env.FFMPEG_BIN + '.README', 'source');`,
  );
  return {
    dataDir: dir,
    bundled: join(dir, "missing", "ffmpeg.exe"),
    env: {},
    installer,
    version: "test",
  };
}

describe("prepareFfmpeg", () => {
  it("uses the installed executable without downloading", async () => {
    const deps = setup();
    expect(await prepareFfmpeg({ ...deps, bundled: ffmpegStatic })).toBe(ffmpegStatic);
    expect(existsSync(join(deps.dataDir, "bin"))).toBe(false);
  });

  it("recovers a skipped install into the data directory and reuses it offline", async () => {
    const deps = setup();
    const bin = await prepareFfmpeg(deps);
    expect(bin.startsWith(join(deps.dataDir, "bin"))).toBe(true);
    expect(readFileSync(`${bin}.LICENSE`, "utf8")).toBe("license");
    expect(readFileSync(`${bin}.README`, "utf8")).toBe("source");
    expect(existsSync(deps.bundled)).toBe(false);
    writeFileSync(deps.installer, "process.exit(1)");
    expect(await prepareFfmpeg(deps)).toBe(bin);
  });

  it("does not replace a missing explicit override with a download", async () => {
    const deps = setup();
    await expect(prepareFfmpeg({ ...deps, env: { SLOPIFY_FFMPEG: deps.bundled } })).rejects.toThrow(
      /SLOPIFY_FFMPEG/,
    );
    expect(existsSync(join(deps.dataDir, "bin"))).toBe(false);
  });

  it("recovers when only the cached executable was removed", async () => {
    const deps = setup();
    const bin = await prepareFfmpeg(deps);
    rmSync(bin);
    expect(existsSync(`${bin}.LICENSE`)).toBe(true);
    expect(await prepareFfmpeg(deps)).toBe(bin);
    expect(existsSync(bin)).toBe(true);
  });

  it("honors FFMPEG_BIN as an explicit override too", async () => {
    const deps = setup();
    await expect(prepareFfmpeg({ ...deps, env: { FFMPEG_BIN: deps.bundled } })).rejects.toThrow(
      /FFMPEG_BIN/,
    );
    expect(existsSync(join(deps.dataDir, "bin"))).toBe(false);
  });

  it("rejects a broken download and removes partial files so next boot can recover", async () => {
    const deps = setup();
    const original = readFileSync(deps.installer, "utf8");
    writeFileSync(
      deps.installer,
      "require('node:fs').writeFileSync(process.env.FFMPEG_BIN, 'partial'); process.exit(1);",
    );
    await expect(prepareFfmpeg(deps)).rejects.toThrow(/SLOPIFY_FFMPEG/);
    expect(readdirSync(join(deps.dataDir, "bin"))).toEqual([]);
    writeFileSync(deps.installer, original);
    expect(existsSync(await prepareFfmpeg(deps))).toBe(true);
  });

  it("checks that the downloaded file runs even when the installer exits successfully", async () => {
    const deps = setup();
    writeFileSync(
      deps.installer,
      "require('node:fs').writeFileSync(process.env.FFMPEG_BIN, 'broken');",
    );
    await expect(prepareFfmpeg(deps)).rejects.toThrow(/ffmpeg/);
    expect(readdirSync(join(deps.dataDir, "bin"))).toEqual([]);
  });

  it("checks an existing binary before any provider work can start", async () => {
    const deps = setup();
    const broken = join(deps.dataDir, "ffmpeg.exe");
    writeFileSync(broken, "broken");
    await expect(prepareFfmpeg({ ...deps, bundled: broken })).rejects.toThrow(/ffmpeg/);
  });

  it("keeps an explicitly selected binary", async () => {
    const deps = setup();
    const custom = join(deps.dataDir, process.platform === "win32" ? "custom.exe" : "custom");
    if (typeof ffmpegStatic !== "string") throw new Error("ffmpeg unavailable");
    copyFileSync(ffmpegStatic, custom);
    expect(await prepareFfmpeg({ ...deps, env: { SLOPIFY_FFMPEG: custom } })).toBe(custom);
  });
});
