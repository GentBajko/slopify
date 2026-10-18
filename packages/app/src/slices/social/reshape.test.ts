import { existsSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { RenderRun } from "../video/ffmpeg.js";
import { createReshaper, dropReshaped, reshapeArgs, socialDir } from "./reshape.js";

// A 1x1 PNG header is enough for the size reader: 2000 x 1000.
function png(width: number, height: number): Buffer {
  const bytes = Buffer.alloc(33);
  Buffer.from("89504e470d0a1a0a0000000d49484452", "hex").copy(bytes);
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
}

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
function setup() {
  const dataDir = mkdtempSync(join(tmpdir(), "slopify-reshape-"));
  dirs.push(dataDir);
  const runs: RenderRun[] = [];
  let fail = false;
  const reshaper = createReshaper({
    paths: { dataDir },
    ffmpeg: "ffmpeg",
    log: { write: () => undefined },
    runFfmpeg: async (run) => {
      runs.push(run);
      if (fail) throw new Error("boom");
      writeFileSync(join(run.cwd ?? "", "out.jpg"), "jpg");
    },
  });
  const source = join(dataDir, "image-1.png");
  writeFileSync(source, png(2000, 1000));
  return { dataDir, runs, reshaper, source, failNext: () => (fail = true) };
}

describe("reshapeArgs", () => {
  it("covers the frame and cuts around the centre when the size is known", () => {
    const args = reshapeArgs({
      source: "in.png",
      size: { width: 2000, height: 1000 },
      shape: "4:5",
      output: "out.jpg",
    });
    expect(args).toContain("in.png");
    expect(args.at(-1)).toBe("out.jpg");
    expect(args[args.indexOf("-vf") + 1]).toBe(
      "scale=2700:1350:flags=lanczos,crop=1080:1350:810:0,format=yuvj420p",
    );
  });

  it("lets ffmpeg cover-fit a picture whose size can't be read", () => {
    const args = reshapeArgs({ source: "in.webp", size: undefined, shape: "1:1", output: "o.jpg" });
    expect(args[args.indexOf("-vf") + 1]).toBe(
      "scale=1080:1080:force_original_aspect_ratio=increase:flags=lanczos,crop=1080:1080,format=yuvj420p",
    );
  });
});

describe("createReshaper", () => {
  it("makes the copy once and keeps it under the project's social folder", async () => {
    const { dataDir, runs, reshaper, source } = setup();
    const first = await reshaper.picture("p1", source, "4:5", AbortSignal.timeout(5000));
    expect(first.ok && first.path.startsWith(socialDir({ dataDir }, "p1"))).toBe(true);
    const again = await reshaper.picture("p1", source, "4:5", AbortSignal.timeout(5000));
    expect(again).toEqual(first);
    expect(runs).toHaveLength(1);
  });

  it("makes it again when the picture changes", async () => {
    const { runs, reshaper, source } = setup();
    await reshaper.picture("p1", source, "4:5", AbortSignal.timeout(5000));
    writeFileSync(source, png(1000, 1000));
    utimesSync(source, new Date(), new Date(Date.now() + 5000));
    await reshaper.picture("p1", source, "4:5", AbortSignal.timeout(5000));
    expect(runs).toHaveLength(2);
  });

  it("says so when the picture is gone", async () => {
    const { reshaper, dataDir } = setup();
    const result = await reshaper.picture(
      "p1",
      join(dataDir, "gone.png"),
      "4:5",
      AbortSignal.timeout(5000),
    );
    expect(result).toMatchObject({ ok: false });
    expect(result.ok ? "" : result.sentence).toMatch(/isn't on disk any more/);
  });

  it("says ffmpeg stopped, leaves nothing half-made, and logs it", async () => {
    const { reshaper, source, failNext, dataDir } = setup();
    failNext();
    const result = await reshaper.picture("p1", source, "1:1", AbortSignal.timeout(5000));
    expect(result.ok ? "" : result.sentence).toMatch(
      /couldn't be cut to 1:1 because ffmpeg stopped/,
    );
    dropReshaped({ dataDir }, "p1");
    expect(existsSync(socialDir({ dataDir }, "p1"))).toBe(false);
  });
});
