import { execFile } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, renameSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { promisify } from "node:util";
import { z } from "zod";
import { redact } from "../kernel/log.js";

interface FfmpegSetup {
  readonly dataDir: string;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly bundled: unknown;
  readonly installer?: string;
  readonly version?: string;
  readonly report?: (message: string) => void;
}

// ffmpeg-static exports a path even when npm skipped its install script. Recover using
// that dependency's own downloader, including its source notice and license, without
// writing into an npx cache or requiring dependency lifecycle scripts to be enabled.
export async function prepareFfmpeg(deps: FfmpegSetup): Promise<string> {
  const override = deps.env.SLOPIFY_FFMPEG?.trim() || deps.env.FFMPEG_BIN?.trim();
  if (override) {
    await verify(override);
    return override;
  }
  if (typeof deps.bundled !== "string" || deps.bundled === "") {
    throw new Error(`No ffmpeg build is available for this platform. ${remedy}`);
  }
  if (existsSync(deps.bundled)) {
    await verify(deps.bundled);
    return deps.bundled;
  }

  const require = createRequire(import.meta.url);
  const version =
    deps.version ??
    z.object({ version: z.string() }).parse(require("ffmpeg-static/package.json")).version;
  const installer = deps.installer ?? require.resolve("ffmpeg-static/install.js");
  const root = join(deps.dataDir, "bin");
  const cached = join(root, `ffmpeg-static-${version}-${process.platform}-${process.arch}`);
  const name = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
  const bin = join(cached, name);
  if (existsSync(bin)) {
    await verify(bin);
    return bin;
  }

  deps.report?.("Slopify's ffmpeg download is missing. Downloading it before starting…");
  mkdirSync(root, { recursive: true, mode: 0o700 });
  const staging = mkdtempSync(join(root, ".ffmpeg-"));
  try {
    const target = join(staging, name);
    await promisify(execFile)(process.execPath, [installer], {
      env: { ...deps.env, FFMPEG_BIN: target },
      windowsHide: true,
      timeout: 180_000,
      maxBuffer: 1024 * 1024,
    });
    await verify(target);
    // Antivirus may remove just the cached executable, leaving its notices behind.
    rmSync(cached, { recursive: true, force: true });
    renameSync(staging, cached);
    return bin;
  } catch (error) {
    throw new Error(
      `Slopify could not download and start ffmpeg. Check your connection and antivirus quarantine, then restart Slopify. ${remedy} ${detail(error)}`,
    );
  } finally {
    // A failed or interrupted download must never be mistaken for an installed binary.
    rmSync(staging, { recursive: true, force: true });
  }
}

const remedy = "You can also set SLOPIFY_FFMPEG (or FFMPEG_BIN) to a working ffmpeg executable.";

async function verify(bin: string): Promise<void> {
  try {
    const { stdout } = await promisify(execFile)(bin, ["-version"], {
      windowsHide: true,
      timeout: 10_000,
      maxBuffer: 1024 * 1024,
    });
    if (!stdout.startsWith("ffmpeg version "))
      throw new Error("the executable did not identify itself as ffmpeg");
  } catch (error) {
    throw new Error(`ffmpeg at ${bin} could not be started. ${remedy} ${detail(error)}`);
  }
}

function detail(error: unknown): string {
  return redact(error instanceof Error ? error.message : String(error));
}
