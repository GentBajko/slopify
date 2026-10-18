import { describe, expect, it } from "vitest";
import { artworkAspect, coverCrop, frames } from "./frames.js";
import { designFormats } from "./model.js";

describe("frames", () => {
  it("draws print formats at 300 dpi of their page", () => {
    for (const format of designFormats) {
      const frame = frames[format];
      if (frame.pdf === undefined) continue;
      expect(Math.abs(frame.width - (frame.pdf.widthMm / 25.4) * 300)).toBeLessThan(2);
      expect(Math.abs(frame.height - (frame.pdf.heightMm / 25.4) * 300)).toBeLessThan(2);
    }
    expect(frames.square).toEqual({ width: 1080, height: 1080 });
    expect(frames.story).toEqual({ width: 1080, height: 1920 });
  });

  it("asks for one artwork shape every chosen format is closest to, else square", () => {
    expect(artworkAspect(["a4"])).toBe("9:16");
    expect(artworkAspect(["a4", "a3", "story", "flyer"])).toBe("9:16");
    expect(artworkAspect(["wide"])).toBe("16:9");
    expect(artworkAspect(["square", "portrait"])).toBe("1:1");
    expect(artworkAspect(["a4", "wide"])).toBe("1:1");
    expect(artworkAspect([])).toBe("1:1");
  });
});

describe("cover crop", () => {
  const wide = { width: 1920, height: 1080 };

  it("fills the frame and centres the cut on the focus", () => {
    expect(coverCrop(wide, frames.square, { x: 0.5, y: 0.5 })).toEqual({
      scaleWidth: 1920,
      scaleHeight: 1080,
      x: 420,
      y: 0,
    });
    expect(coverCrop(wide, frames.square, { x: 0.25, y: 0.5 })).toEqual({
      scaleWidth: 1920,
      scaleHeight: 1080,
      x: 0,
      y: 0,
    });
    expect(coverCrop(wide, frames.square, { x: 0.6, y: 0.5 }).x).toBe(612);
  });

  it("never cuts past the picture's edge, and scales a small picture up", () => {
    expect(coverCrop(wide, frames.square, { x: 1, y: 1 })).toMatchObject({ x: 840, y: 0 });
    const crop = coverCrop({ width: 1024, height: 1536 }, frames.a4, { x: 0.5, y: 0 });
    expect(crop.scaleWidth).toBeGreaterThanOrEqual(frames.a4.width);
    expect(crop.scaleHeight).toBeGreaterThanOrEqual(frames.a4.height);
    expect(crop).toMatchObject({ x: 0, y: 0 });
    const bottom = coverCrop({ width: 1024, height: 1536 }, frames.a4, { x: 0.5, y: 1 });
    expect(bottom.y).toBe(bottom.scaleHeight - frames.a4.height);
  });
});
