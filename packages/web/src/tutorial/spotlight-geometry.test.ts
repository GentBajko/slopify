import { describe, expect, it } from "vitest";
import { spotlightHole, spotlightLayout } from "./spotlight-geometry";

const viewport = { width: 1200, height: 800 };
const card = { width: 360, height: 280 };

describe("spotlight positioning", () => {
  it("uses free space beside a narrow target without covering it", () => {
    const target = { left: 100, top: 200, width: 400, height: 300 };
    const layout = spotlightLayout(target, viewport, card);
    expect(layout.docked).toBe(false);
    expect(layout.left).toBeGreaterThan(target.left + target.width);
    expect(layout.top + card.height).toBeLessThan(viewport.height);
  });

  it("uses the left side when the target is against the right edge", () => {
    const target = { left: 800, top: 200, width: 350, height: 100 };
    const layout = spotlightLayout(target, viewport, card);
    expect(layout.left + layout.width).toBeLessThan(target.left);
    expect(layout.docked).toBe(false);
  });

  it("places the card below or above broad targets when space permits", () => {
    const target = { left: 20, top: 100, width: 1160, height: 180 };
    const below = spotlightLayout(target, viewport, card);
    expect(below.top).toBeGreaterThan(target.top + target.height);
    const above = spotlightLayout({ ...target, top: 500 }, viewport, card);
    expect(above.top + card.height).toBeLessThan(500);
  });

  it("docks on a phone and clips a tall target to the usable area above the card", () => {
    const phone = { width: 390, height: 700 };
    const target = { left: 16, top: -100, width: 358, height: 1400 };
    const layout = spotlightLayout(target, phone, card);
    expect(layout.docked).toBe(true);
    expect(layout.left).toBeGreaterThanOrEqual(12);
    expect(layout.left + layout.width).toBeLessThanOrEqual(phone.width - 12);
    const hole = spotlightHole(target, phone, layout.top - 12);
    expect(hole?.top).toBe(0);
    expect((hole?.top ?? 0) + (hole?.height ?? 0)).toBeLessThan(layout.top);
  });

  it("draws no hole for targets wholly outside the visible work area", () => {
    expect(spotlightHole({ left: 0, top: 900, width: 800, height: 100 }, viewport)).toBeNull();
    expect(spotlightHole({ left: -500, top: 10, width: 100, height: 100 }, viewport)).toBeNull();
  });

  it("keeps the missing-target card inside a narrow viewport", () => {
    const layout = spotlightLayout(null, { width: 320, height: 600 }, card);
    expect(layout.left).toBe(12);
    expect(layout.width).toBe(296);
    expect(layout.docked).toBe(false);
  });
});
