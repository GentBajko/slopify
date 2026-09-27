import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegStatic from "ffmpeg-static";
import { afterAll, describe, expect, it } from "vitest";
import { layout as pathsLayout } from "../../kernel/paths.js";
import { resolveFont } from "../fonts/index.js";
import { resolveFfmpeg } from "./ffmpeg.js";
import {
  type CardInput,
  cardLayout,
  defaultCardStyle,
  renderCard,
  typeset,
} from "./figure-card.js";

// Cards are drawn by the ffmpeg Slopify ships, so these render real PNGs and read their size.

const bin = resolveFfmpeg({}, ffmpegStatic);
const dir = mkdtempSync(join(tmpdir(), "slopify-card-"));
const keep = process.env.SLOPIFY_CARD_SAMPLES;
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const log = { write: () => undefined };

function pngSize(path: string): { width: number; height: number } {
  const bytes = readFileSync(path);
  expect(bytes.subarray(1, 4).toString()).toBe("PNG");
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

async function draw(
  name: string,
  input: Omit<CardInput, "style" | "width" | "height" | "picture">,
  format: "16:9" | "9:16" = "16:9",
  picture?: string,
) {
  const cwd = join(dir, name);
  mkdirSync(join(cwd, "fonts"), { recursive: true });
  const font = await resolveFont(pathsLayout(dir), "default");
  copyFileSync(font.path, join(cwd, "fonts", "Barlow-Regular.ttf"));
  const [width, height] = format === "16:9" ? [1920, 1080] : [1080, 1920];
  const output = join(cwd, "card.png");
  await renderCard(
    {
      bin,
      input: { ...input, width, height, style: defaultCardStyle, picture: picture !== undefined },
      cwd,
      output,
      picture,
      signal: new AbortController().signal,
      log,
    },
    (ass) => writeFileSync(join(cwd, "card.ass"), ass),
  );
  if (keep !== undefined) copyFileSync(output, join(keep, `${name}.png`));
  return output;
}

const table = [
  "| Seed | Rivers | Lakes | Peak (m) |",
  "|---|---|---|---|",
  ...Array.from(
    { length: 30 },
    (_value, at) =>
      `| ${String(at + 1)} | ${String(10 + (at % 7))} | ${String(at % 4)} | ${String(1200 + at * 37)} |`,
  ),
].join("\n");

describe("figure cards", () => {
  it("draws a large table at 16:9, cut to what reads, with the rows left out counted", async () => {
    const input = { kind: "table" as const, source: table, section: "Results" };
    expect(pngSize(await draw("table", input))).toEqual({ width: 1920, height: 1080 });
    const ass = cardLayout({
      ...input,
      width: 1920,
      height: 1080,
      style: defaultCardStyle,
      picture: false,
    }).ass;
    expect(ass).toMatch(/…and \d+ more rows/);
    // Nothing smaller than 2.4% of the short side.
    for (const size of ass.matchAll(/\\fs(\d+)/g))
      expect(Number(size[1])).toBeGreaterThanOrEqual(25);
  });

  it("draws the same table for a vertical short", async () => {
    expect(
      pngSize(
        await draw("table-vertical", { kind: "table", source: table, section: null }, "9:16"),
      ),
    ).toEqual({
      width: 1080,
      height: 1920,
    });
  });

  it("draws code in a monospace face with its braces kept", async () => {
    const source =
      "```rust\nfn carve(height: &mut [f32], flow: &[f32]) {\n    // lower the terrain along the flow\n    for (h, f) in height.iter_mut().zip(flow) {\n        *h -= 0.01 * f;\n    }\n}\n```";
    const ass = cardLayout({
      kind: "code",
      source,
      section: "Erosion",
      width: 1920,
      height: 1080,
      style: defaultCardStyle,
      picture: false,
    }).ass;
    expect(ass).toContain("\\{");
    expect(ass).toContain("\\fnDejaVu Sans Mono");
    expect(ass).toContain("Erosion · rust");
    expect(pngSize(await draw("code", { kind: "code", source, section: "Erosion" }))).toEqual({
      width: 1920,
      height: 1080,
    });
  });

  it("sets an equation in readable symbols", async () => {
    expect(typeset("E = k \\frac{T_s - T_a}{h} \\cdot \\alpha^2")).toBe("E = k (Tₛ - Tₐ)/h · α²");
    expect(
      pngSize(
        await draw("math", {
          kind: "math",
          source: "$$E = k \\frac{T_s - T_a}{h}$$",
          section: null,
        }),
      ),
    ).toEqual({
      width: 1920,
      height: 1080,
    });
  });

  it("fits a figure's own picture over its caption", async () => {
    const picture = join(dir, "figure.png");
    await (await import("node:child_process")).execFileSync(bin, [
      "-loglevel",
      "error",
      "-y",
      "-f",
      "lavfi",
      "-i",
      "testsrc=s=800x600:d=1",
      "-frames:v",
      "1",
      picture,
    ]);
    const input = {
      kind: "figure" as const,
      source:
        "Alt text: Relief map\nCaption: Figure 3: Elevation of the valley, blue low, red high.",
      section: "Terrain",
    };
    const layout = cardLayout({
      ...input,
      width: 1920,
      height: 1080,
      style: defaultCardStyle,
      picture: true,
    });
    expect(layout.box).toBeDefined();
    expect(pngSize(await draw("figure", input, "16:9", picture))).toEqual({
      width: 1920,
      height: 1080,
    });
    // Without its picture a figure's card is its caption.
    expect(pngSize(await draw("figure-caption", input))).toEqual({ width: 1920, height: 1080 });
  });
});
