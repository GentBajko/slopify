import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, expect, it } from "vitest";
import type { LogLevel } from "../../kernel/log.js";
import type { Shot } from "./edit-list.js";
import { stillSizes } from "./still-sizes.js";

const work = mkdtempSync(join(tmpdir(), "slopify-still-sizes-"));
afterAll(() => rmSync(work, { recursive: true, force: true }));

// A PNG's first 24 bytes: its signature and the start of IHDR, which states the size.
function pngHead(width: number, height: number): Buffer {
  const head = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(head, 0);
  head.writeUInt32BE(13, 8);
  head.write("IHDR", 12, "ascii");
  head.writeUInt32BE(width, 16);
  head.writeUInt32BE(height, 20);
  return head;
}

function file(name: string, bytes: Buffer): string {
  const path = join(work, name);
  writeFileSync(path, bytes);
  return path;
}

const image = (path: string): Shot => ({
  source: { kind: "image", path },
  frames: 30,
  motion: { kind: "still" },
});

function watched() {
  const lines: { level: LogLevel; event: string; detail: string | undefined }[] = [];
  return {
    lines,
    log: {
      write: (level: LogLevel, event: string, fields?: { readonly detail?: string | undefined }) =>
        lines.push({ level, event, detail: fields?.detail }),
    },
  };
}

it("reads each still's size from its header, once however often the still comes round", () => {
  const { log, lines } = watched();
  const made = file("made.png", Buffer.concat([pngHead(1672, 941), Buffer.alloc(4096)]));
  const photo = file("photo.png", pngHead(4000, 2250));
  const sizes = stillSizes([image(made), image(photo), image(made)], log);
  expect([...sizes]).toEqual([
    [made, { width: 1672, height: 941 }],
    [photo, { width: 4000, height: 2250 }],
  ]);
  expect(lines).toEqual([]);
});

it("leaves out a clip and a picture whose size it cannot read, without failing the render", () => {
  const { log, lines } = watched();
  const other = file("picture.webp", Buffer.from("RIFF....WEBPVP8 ", "ascii"));
  const sizes = stillSizes(
    [
      {
        source: { kind: "video", path: join(work, "clip.mp4"), seconds: 4 },
        frames: 30,
        motion: { kind: "still" },
      },
      image(other),
    ],
    log,
  );
  expect(sizes.size).toBe(0);
  expect(lines).toEqual([]);
});

it("logs a still it cannot open and leaves it to the render to refuse", () => {
  const { log, lines } = watched();
  const missing = join(work, "gone.png");
  expect(stillSizes([image(missing)], log).size).toBe(0);
  expect(lines).toHaveLength(1);
  expect(lines[0]).toMatchObject({ level: "warn", event: "video.still" });
  expect(lines[0]?.detail).toContain("gone.png");
});
