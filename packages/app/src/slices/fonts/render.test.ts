import { execFile } from "node:child_process";
import { copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { expect, it } from "vitest";
import { layout } from "../../kernel/paths.js";
import { resolveFont } from "./catalog.js";

it("selects bundled Barlow in the shipped libass renderer without system installation", async () => {
  const dir = await mkdtemp(join(tmpdir(), "slopify-font-render-"));
  try {
    const font = await resolveFont(layout(dir), "default");
    await mkdir(join(dir, "fonts"));
    await copyFile(font.path, join(dir, "fonts", "font.ttf"));
    await writeFile(
      join(dir, "sample.ass"),
      [
        "[Script Info]",
        "ScriptType: v4.00+",
        "PlayResX: 320",
        "PlayResY: 180",
        "[V4+ Styles]",
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
        `Style: Default,${font.assName},24,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,1,0,2,10,10,10,1`,
        "[Events]",
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
        "Dialogue: 0,0:00:00.00,0:00:01.00,Default,,0,0,0,,Slopify subtitles",
      ].join("\n"),
    );
    const bin: unknown = createRequire(import.meta.url)("ffmpeg-static");
    if (typeof bin !== "string")
      throw new Error("The bundled ffmpeg test dependency is unavailable");
    const result = await promisify(execFile)(
      bin,
      [
        "-hide_banner",
        "-nostdin",
        "-loglevel",
        "verbose",
        "-f",
        "lavfi",
        "-i",
        "color=c=black:s=320x180:d=0.1",
        "-vf",
        "ass=filename=sample.ass:fontsdir=fonts",
        "-frames:v",
        "1",
        "-f",
        "null",
        "-",
      ],
      { cwd: dir, timeout: 15000, maxBuffer: 1024 * 1024 },
    );
    expect(result.stderr).toMatch(/fontselect:.*Barlow Regular.*->.*Barlow-Regular/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
