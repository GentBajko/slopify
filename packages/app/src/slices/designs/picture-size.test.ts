import { describe, expect, it } from "vitest";
import { nearestFormat, pictureSize } from "./picture-size.js";

function png(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(bytes.buffer).setUint32(16, width);
  new DataView(bytes.buffer).setUint32(20, height);
  return bytes;
}

function jpeg(width: number, height: number, sof = 0xc0): Uint8Array {
  return Uint8Array.from([
    0xff,
    0xd8,
    // APP0, 16 bytes long, contents irrelevant
    0xff,
    0xe0,
    0x00,
    0x10,
    ...new Array<number>(14).fill(0),
    // a DHT before the frame: 0xC4 is not a start of frame
    0xff,
    0xc4,
    0x00,
    0x04,
    0x00,
    0x00,
    0xff,
    0xff,
    sof,
    0x00,
    0x11,
    0x08,
    height >> 8,
    height & 0xff,
    width >> 8,
    width & 0xff,
    0x03,
    ...new Array<number>(9).fill(0),
  ]);
}

describe("picture size", () => {
  it("reads a PNG's width and height from its header", () => {
    expect(pictureSize(png(1920, 1080))).toEqual({ width: 1920, height: 1080 });
  });

  it("reads a JPEG's from its frame, past other segments and fill bytes", () => {
    expect(pictureSize(jpeg(1080, 1350))).toEqual({ width: 1080, height: 1350 });
    expect(pictureSize(jpeg(4000, 3000, 0xc2))).toEqual({ width: 4000, height: 3000 });
  });

  it("answers nothing for a truncated, zero-sized or unknown picture", () => {
    expect(pictureSize(png(1920, 1080).slice(0, 20))).toBeUndefined();
    expect(pictureSize(png(0, 1080))).toBeUndefined();
    expect(pictureSize(jpeg(1080, 1350).slice(0, 30))).toBeUndefined();
    expect(pictureSize(Uint8Array.from([0xff, 0xd8, 0xff, 0xda, 0, 2]))).toBeUndefined();
    expect(pictureSize(Uint8Array.from([0xff, 0xd8, 0xff, 0xc0, 0, 1]))).toBeUndefined();
    expect(pictureSize(new TextEncoder().encode("GIF89a"))).toBeUndefined();
  });

  it("picks the provider shape closest to the picture", () => {
    expect(nearestFormat({ width: 1920, height: 1080 })).toBe("16:9");
    expect(nearestFormat({ width: 3000, height: 2000 })).toBe("16:9");
    expect(nearestFormat({ width: 1080, height: 1350 })).toBe("1:1");
    expect(nearestFormat({ width: 1080, height: 1920 })).toBe("9:16");
    expect(nearestFormat({ width: 2480, height: 3508 })).toBe("9:16");
    expect(nearestFormat({ width: 1000, height: 1000 })).toBe("1:1");
  });
});
